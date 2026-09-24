import { canCounterAttack, COMBAT_SCALE, MISS_CHANCE } from './combat';
import { SKILLS, skillCost, type SkillId } from './skills';
import { UNIT_TYPES, type UnitType } from './units';

export const PLAYABLE_UNITS: UnitType[] = ['warrior', 'rider', 'archer', 'swordsman', 'shield', 'catapult', 'knight', 'stalker', 'builder', 'banner', 'berserker', 'trapper', 'stormcaller', 'stunner'];

/** Exchange rates used to convert resource costs into money for cost-efficiency
 *  analysis (tunable; see combat-balance.md). */
export const WOOD_TO_MONEY = 1;
export const ORE_TO_MONEY = 2;

/** Combat-affecting stats plus price; mirror of the UNIT_TYPES fields the sim
 *  uses, so candidate rebalances can be evaluated without editing the game. */
export interface UnitStats {
  movePoints: number;
  attack: number;
  attackDistance: number;
  maxHp: number;
  defense: number;
  price: number;
  priceWood: number;
  priceOre: number;
}

/** Live stats for a unit type, optionally overridden by a candidate rebalance. */
export function statsFor(type: UnitType, overrides?: Partial<Record<UnitType, Partial<UnitStats>>>): UnitStats {
  const base = UNIT_TYPES[type];
  const o = overrides?.[type];
  return {
    movePoints: o?.movePoints ?? base.movePoints,
    attack: o?.attack ?? base.attack,
    attackDistance: o?.attackDistance ?? base.attackDistance,
    maxHp: o?.maxHp ?? base.maxHp,
    defense: o?.defense ?? base.defense,
    price: o?.price ?? base.price,
    priceWood: o?.priceWood ?? base.priceWood,
    priceOre: o?.priceOre ?? base.priceOre,
  };
}

/** Unit type -> skill that unlocks spawning it (mirrors spawn.ts gates). */
export const UNIT_SKILL: Partial<Record<UnitType, SkillId>> = {
  rider: 'riding',
  swordsman: 'swordsman',
  shield: 'shields',
  catapult: 'catapult',
  knight: 'knights',
};

/** The skill plus its prerequisite chain, root first. */
export function skillChain(type: UnitType): SkillId[] {
  const skill = UNIT_SKILL[type];
  if (!skill) return [];
  const chain: SkillId[] = [];
  let cur: SkillId | null = skill;
  while (cur) {
    chain.unshift(cur);
    cur = SKILLS[cur].parent;
  }
  return chain;
}

/** One-time entry cost of unlocking this unit type's skill chain (skillCost
 *  grows with each already-opened skill, so the chain is summed in order). */
export function skillGateCost(type: UnitType): number {
  let opened = 0;
  let total = 0;
  for (const id of skillChain(type)) {
    total += skillCost(id, opened);
    opened += 1;
  }
  return total;
}

/** Money-equivalent cost of a unit: price + resources (+ skill gate as a
 *  one-time entry cost, representing "expensive because it needs a skill"). */
export function effectiveCost(type: UnitType, overrides?: Partial<Record<UnitType, Partial<UnitStats>>>): number {
  const s = statsFor(type, overrides);
  return s.price + s.priceWood * WOOD_TO_MONEY + s.priceOre * ORE_TO_MONEY + skillGateCost(type);
}

export interface DuelResult {
  /** Unit type that won the duel (null when both survive the round cap). */
  winner: UnitType | null;
  /** Number of full attack-turns `a` needed to kill `b` (reported for A as the
   *  row unit; the counter on A's own turn is not an attack-turn). */
  turnsForA: number;
  turnsForB: number;
  hpA: number;
  hpB: number;
}

/** A single duel, both at full HP, alternating turns (A first). Units start at
 *  the longer attack range; a unit out of range advances instead of attacking
 *  (`movePoints / 10` hexes per turn, min 1) and may attack in the same turn it
 *  closes. Damage mirrors the live combat formula (see resolveCombat); `rng`
 *  drives the 10% miss roll (pass `() => 1` for the deterministic pass). */
export function duel(
  a: UnitType,
  b: UnitType,
  rng: () => number = () => 1,
  maxRounds = 100,
  overrides?: Partial<Record<UnitType, Partial<UnitStats>>>,
): DuelResult {
  const A = statsFor(a, overrides);
  const B = statsFor(b, overrides);
  const ra = A.attackDistance;
  const rb = B.attackDistance;
  let dist = Math.max(ra, rb);
  let hpA = A.maxHp;
  let hpB = B.maxHp;
  let turnsA = 0;
  let turnsB = 0;

  const step = (move: number): number => Math.max(1, Math.floor(move / 10));

  /** Resolve one directed attack; mirrors the game formula exactly. */
  const resolve = (
    attType: UnitType,
    defType: UnitType,
    att: UnitStats,
    def: UnitStats,
    attHp: number,
    defHp: number,
    distance: number,
  ): { dmg: number; counter: number } => {
    if (rng() < MISS_CHANCE) return { dmg: 0, counter: 0 };
    const attackForce = (att.attack * attHp) / att.maxHp;
    const defenseForce = ((def.defense ?? 0) * defHp) / def.maxHp;
    const total = attackForce + defenseForce;
    if (total <= 0) return { dmg: 0, counter: 0 };
    const dmg = Math.round((attackForce / total) * att.attack * COMBAT_SCALE);
    const canCounter = distance <= def.attackDistance && canCounterAttackType(defType);
    const counter = canCounter ? Math.round((defenseForce / total) * (def.defense ?? 0) * COMBAT_SCALE) : 0;
    return { dmg, counter };
  };

  for (let round = 0; round < maxRounds; round++) {
    // A's turn: close while out of range, then attack.
    turnsA += 1;
    if (dist > ra) dist = Math.max(ra, dist - step(A.movePoints));
    if (dist <= ra) {
      const hitA = resolve(a, b, A, B, hpA, hpB, dist);
      hpB -= hitA.dmg;
      if (hpB <= 0) return { winner: a, turnsForA: turnsA, turnsForB: turnsB, hpA, hpB: 0 };
      hpA -= hitA.counter;
      if (hpA <= 0) return { winner: b, turnsForA: turnsA, turnsForB: turnsB, hpA: 0, hpB };
    }

    // B's turn.
    turnsB += 1;
    if (dist > rb) dist = Math.max(rb, dist - step(B.movePoints));
    if (dist <= rb) {
      const hitB = resolve(b, a, B, A, hpB, hpA, dist);
      hpA -= hitB.dmg;
      if (hpA <= 0) return { winner: b, turnsForA: turnsA, turnsForB: turnsB, hpA: 0, hpB };
      hpB -= hitB.counter;
      if (hpB <= 0) return { winner: a, turnsForA: turnsA, turnsForB: turnsB, hpA, hpB: 0 };
    }
  }

  return { winner: null, turnsForA: turnsA, turnsForB: turnsB, hpA, hpB };
}

/** A land catapult never counter-attacks; all other units do when in range. */
function canCounterAttackType(t: UnitType): boolean {
  return t !== 'catapult';
}

function key(a: UnitType, b: UnitType): string {
  return `${a}\u2192${b}`;
}

export interface Duels {
  /** Deterministic (no-miss) result for each ordered pair. */
  deterministic: Record<string, DuelResult>;
  /** Monte Carlo win rate of the row unit over the column unit (seeded). */
  mcWin: Record<string, number>;
}

/** Run the full duel set: deterministic (no miss) + Monte Carlo (seeded). */
export function runDuels(seed = 12345, trials = 2000, overrides?: Partial<Record<UnitType, Partial<UnitStats>>>): Duels {
  const deterministic: Duels['deterministic'] = {};
  const mcWin: Duels['mcWin'] = {};

  for (const a of PLAYABLE_UNITS) {
    for (const b of PLAYABLE_UNITS) {
      deterministic[key(a, b)] = duel(a, b, () => 1, 100, overrides);

      const rng = new Mulberry32(seed + (PLAYABLE_UNITS.indexOf(a) * 100 + PLAYABLE_UNITS.indexOf(b)) * 7919);
      let aWins = 0;
      let draws = 0;
      for (let i = 0; i < trials; i++) {
        const d = duel(a, b, () => rng.next(), 100, overrides);
        if (d.winner === a) aWins += 1;
        else if (d.winner === null) draws += 1;
      }
      mcWin[key(a, b)] = aWins / (trials - draws || 1);
    }
  }
  return { deterministic, mcWin };
}

export function detAt(duels: Duels, a: UnitType, b: UnitType): DuelResult {
  return duels.deterministic[key(a, b)]!;
}

export function mcWinAt(duels: Duels, a: UnitType, b: UnitType): number {
  return duels.mcWin[key(a, b)] ?? 0;
}

/** Order-independent win rate of `a` over `b`: averages the two directed
 *  duels so the first-strike bias (whoever acts first engages first) cancels
 *  out. `p(ab) + p(ba) === 1` by construction. */
export function symWin(duels: Duels, a: UnitType, b: UnitType): number {
  return (mcWinAt(duels, a, b) + (1 - mcWinAt(duels, b, a))) / 2;
}

export interface BalanceStats {
  type: UnitType;
  cost: number;
  /** Sum over opponents of win-rate × opponent effective cost. */
  duelValue: number;
  /** duelValue / cost. */
  efficiency: number;
  /** Mean win rate across all opponents. */
  winRate: number;
}

export function balanceStats(
  duels: Duels,
  overrides?: Partial<Record<UnitType, Partial<UnitStats>>>,
): BalanceStats[] {
  return PLAYABLE_UNITS.map((type) => {
    let winRate = 0;
    let duelValue = 0;
    let opponents = 0;
    for (const opp of PLAYABLE_UNITS) {
      if (opp === type) continue;
      const rate = symWin(duels, type, opp);
      opponents += 1;
      winRate += rate;
      duelValue += rate * effectiveCost(opp, overrides);
    }
    winRate /= Math.max(1, opponents);
    return {
      type,
      cost: effectiveCost(type, overrides),
      duelValue,
      efficiency: duelValue / effectiveCost(type, overrides),
      winRate,
    };
  });
}

function median(xs: number[]): number {
  const s = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Cheap-but-strong: cost efficiency well above the median. */
export function cheapButStrong(stats: BalanceStats[]): BalanceStats[] {
  const med = median(stats.map((s) => s.efficiency));
  return stats.filter((s) => s.efficiency > med * 1.5);
}

/** Expensive-but-weak: cost efficiency well below the median. */
export function expensiveButWeak(stats: BalanceStats[]): BalanceStats[] {
  const med = median(stats.map((s) => s.efficiency));
  return stats.filter((s) => s.efficiency < med * 0.6);
}

/** Pairs where the cheaper unit wins > 60% (order-independent) against a
 *  pricier one — cheap-but-strong / expensive-but-weak red flags. */
export function cheapBeatsCostly(
  duels: Duels,
  overrides?: Partial<Record<UnitType, Partial<UnitStats>>>,
): Array<{ cheaper: UnitType; pricier: UnitType; win: number }> {
  const out: Array<{ cheaper: UnitType; pricier: UnitType; win: number }> = [];
  for (const cheaper of PLAYABLE_UNITS) {
    for (const pricier of PLAYABLE_UNITS) {
      if (cheaper === pricier) continue;
      if (effectiveCost(cheaper, overrides) >= effectiveCost(pricier, overrides)) continue;
      const rate = symWin(duels, cheaper, pricier);
      if (rate > 0.6) out.push({ cheaper, pricier, win: rate });
    }
  }
  return out;
}

/** Small seeded PRNG for the Monte Carlo pass (independent of Math.random). */
export class Mulberry32 {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    const t = (this.state ^ (this.state >>> 15)) >>> 0;
    let x = Math.imul(t, t | 1) >>> 0;
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }
}
