import { RAGE_BONUS, RAGE_THRESHOLD_PCT } from './abilities';
import { canCounterAttack, COMBAT_SCALE, COUNTER_SCALE, MISS_CHANCE, SHIELD_COUNTER_SCALE } from './combat';
import { SKILLS, skillCost } from './skills';
import { UNIT_TYPES } from './units';
import { SkillId, UnitType } from '@enums';

export const PLAYABLE_UNITS: UnitType[] = [UnitType.WARRIOR, UnitType.RIDER, UnitType.ARCHER, UnitType.SWORDSMAN, UnitType.SHIELD, UnitType.CATAPULT, UnitType.KNIGHT, UnitType.STALKER, UnitType.BUILDER, UnitType.BANNER, UnitType.BERSERKER, UnitType.TRAPPER, UnitType.STORMCALLER, UnitType.STUNNER];

/** Combat-role units: the roster whose duel results decide the balance verdict.
 *  Utility specials (stalker, builder, banner) are judged on their abilities. */
export const CORE_COMBAT: UnitType[] = [UnitType.WARRIOR, UnitType.RIDER, UnitType.ARCHER, UnitType.SWORDSMAN, UnitType.SHIELD, UnitType.CATAPULT, UnitType.KNIGHT, UnitType.BERSERKER, UnitType.TRAPPER, UnitType.STORMCALLER, UnitType.STUNNER];

/** Utility units that are expected to lose duels; their value is the ability. */
export const UTILITY_UNITS: UnitType[] = [UnitType.STALKER, UnitType.BUILDER, UnitType.BANNER];

/** Win-rate thresholds shared by the flags and the report. */
export const WIN_THRESHOLD = 0.6;
export const LOSS_THRESHOLD = 0.4;

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
  rider: SkillId.RIDING,
  swordsman: SkillId.SWORDSMAN,
  shield: SkillId.SHIELDS,
  catapult: SkillId.CATAPULT,
  knight: SkillId.KNIGHTS,
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
export interface StrikeContext {
  /** Flat attack bonus (banner aura); rage is derived from the attacker's hp. */
  bonus?: number;
  /** A stealthed stalker's first strike ignores the defender's defense. */
  ignoreDefense?: boolean;
  /** Attack distance of this exchange (defender counters only if it reaches). */
  distance: number;
}

/** True while a berserker is at/below the rage hp threshold. */
export function isRaging(type: UnitType, hp: number, maxHp: number): boolean {
  return type === UnitType.BERSERKER && hp <= maxHp * RAGE_THRESHOLD_PCT;
}

/** One directed hit, mirroring `resolveCombat` + `performAttack` (miss roll
 *  excluded): attack force vs defense force, counters scaled by COUNTER_SCALE (shield: SHIELD_COUNTER_SCALE), raging
 *  berserkers do not counter, land catapults never counter. */
export function strike(
  attType: UnitType,
  defType: UnitType,
  att: UnitStats,
  def: UnitStats,
  attHp: number,
  defHp: number,
  ctx: StrikeContext,
): { dmg: number; counter: number } {
  const rage = isRaging(attType, attHp, att.maxHp) ? RAGE_BONUS : 0;
  const attack = att.attack + rage + (ctx.bonus ?? 0);
  const defense = ctx.ignoreDefense ? 0 : (def.defense ?? 0);
  const attackForce = (attack * attHp) / att.maxHp;
  const defenseForce = (defense * defHp) / def.maxHp;
  const total = attackForce + defenseForce;
  if (total <= 0) return { dmg: 0, counter: 0 };
  const dmg = Math.round((attackForce / total) * attack * COMBAT_SCALE);
  const canCounter =
    ctx.distance <= def.attackDistance && canCounterAttackType(defType) && !isRaging(defType, defHp, def.maxHp);
  // Same counter multipliers as the real combat formula.
  const counterMult = defType === UnitType.SHIELD ? SHIELD_COUNTER_SCALE : COUNTER_SCALE;
  const counter = canCounter ? Math.round((defenseForce / total) * defense * COMBAT_SCALE * counterMult) : 0;
  return { dmg, counter };
}

export interface DuelOptions {
  /** Starting distance in hexes; defaults to the longer of the two ranges
   *  (the ranged unit starts with the target walking into its range). */
  startDist?: number;
}

/** Simulated 1v1. Models: closing speed (move / 10 hexes per turn), ranged free
 *  volleys, catapults unable to fire in a turn they moved, berserker rage
 *  (+attack, no counters) and stalker first-strike (ignores defense). Banner
 *  aura and the knight's extra attack need allies / several targets and only
 *  exist in the skirmish sim (`balance-skirmish.ts`). */
export function duel(
  a: UnitType,
  b: UnitType,
  rng: () => number = () => 1,
  maxRounds = 100,
  overrides?: Partial<Record<UnitType, Partial<UnitStats>>>,
  opts: DuelOptions = {},
): DuelResult {
  const A = statsFor(a, overrides);
  const B = statsFor(b, overrides);
  const ra = A.attackDistance;
  const rb = B.attackDistance;
  let dist = opts.startDist ?? Math.max(ra, rb);
  let hpA = A.maxHp;
  let hpB = B.maxHp;
  let turnsA = 0;
  let turnsB = 0;
  let firstA = true;
  let firstB = true;

  const step = (move: number): number => Math.max(1, Math.floor(move / 10));

  /** Resolve one directed attack (with the miss roll). */
  const resolve = (
    attType: UnitType,
    defType: UnitType,
    att: UnitStats,
    def: UnitStats,
    attHp: number,
    defHp: number,
    distance: number,
    first: boolean,
  ): { dmg: number; counter: number } => {
    if (rng() < MISS_CHANCE) return { dmg: 0, counter: 0 };
    return strike(attType, defType, att, def, attHp, defHp, {
      distance,
      ignoreDefense: attType === UnitType.STALKER && first,
    });
  };

  for (let round = 0; round < maxRounds; round++) {
    // A's turn: close while out of range, then attack (a catapult that moved cannot fire).
    turnsA += 1;
    let movedA = false;
    if (dist > ra) {
      dist = Math.max(ra, dist - step(A.movePoints));
      movedA = true;
    }
    if (dist <= ra && !(movedA && a === UnitType.CATAPULT)) {
      const hitA = resolve(a, b, A, B, hpA, hpB, dist, firstA);
      firstA = false;
      hpB -= hitA.dmg;
      if (hpB <= 0) return { winner: a, turnsForA: turnsA, turnsForB: turnsB, hpA, hpB: 0 };
      hpA -= hitA.counter;
      if (hpA <= 0) return { winner: b, turnsForA: turnsA, turnsForB: turnsB, hpA: 0, hpB };
    }

    // B's turn.
    turnsB += 1;
    let movedB = false;
    if (dist > rb) {
      dist = Math.max(rb, dist - step(B.movePoints));
      movedB = true;
    }
    if (dist <= rb && !(movedB && b === UnitType.CATAPULT)) {
      const hitB = resolve(b, a, B, A, hpB, hpA, dist, firstB);
      firstB = false;
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
  return t !== UnitType.CATAPULT;
}

function key(a: UnitType, b: UnitType): string {
  return `${a}\u2192${b}`;
}

let cachedDeterministicDuels: Record<string, DuelResult> | null = null;

/** Deterministic (no-miss) duel result for every playable pair, computed once
 *  and cached. Unlike `runDuels`'s Monte Carlo pass this has no RNG loop, so
 *  it is cheap enough to consult from AI planning (a spawn decision or two per
 *  AI turn), not just offline balance reports. */
export function deterministicDuelMatrix(): Record<string, DuelResult> {
  if (!cachedDeterministicDuels) {
    const table: Record<string, DuelResult> = {};
    for (const a of PLAYABLE_UNITS) {
      for (const b of PLAYABLE_UNITS) table[key(a, b)] = duel(a, b);
    }
    cachedDeterministicDuels = table;
  }
  return cachedDeterministicDuels;
}

/** How well `a` counters `b` in an open-terrain duel: 1 when `a` wins
 *  outright, 0 when `b` does, 0.5 for a mirror match or a draw (round cap). A
 *  coarse, cheap alternative to `symWin`'s Monte Carlo win rate. */
export function counterScore(a: UnitType, b: UnitType): number {
  if (a === b) return 0.5;
  const d = deterministicDuelMatrix()[key(a, b)];
  if (!d || d.winner === null) return 0.5;
  return d.winner === a ? 1 : 0;
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

export interface Dominance {
  type: UnitType;
  /** Opponents (in `roster`) this unit beats at >= WIN_THRESHOLD. */
  beats: UnitType[];
  /** Opponents that beat this unit at >= WIN_THRESHOLD. */
  beatenBy: UnitType[];
  /** Mean symmetrised win-rate over `roster` (self excluded). */
  meanWin: number;
}

/** Per-unit dominance figures over a roster (defaults to the core combat
 *  units, so the mean is not inflated by utility units that lose to all). */
export function dominance(duels: Duels, roster: UnitType[] = CORE_COMBAT): Dominance[] {
  return roster.map((type) => {
    const others = roster.filter((o) => o !== type);
    const rates = others.map((o) => symWin(duels, type, o));
    return {
      type,
      beats: others.filter((_, i) => rates[i]! >= WIN_THRESHOLD),
      beatenBy: others.filter((_, i) => rates[i]! <= LOSS_THRESHOLD),
      meanWin: rates.reduce((x, y) => x + y, 0) / Math.max(1, rates.length),
    };
  });
}

/** Super-strong: nothing counters it and it beats most of the roster. */
export function superStrong(dom: Dominance[], roster: UnitType[] = CORE_COMBAT): Dominance[] {
  const minWins = Math.ceil(((roster.length - 1) * 2) / 3);
  return dom.filter((d) => d.beatenBy.length === 0 && d.beats.length >= minWins);
}

/** Super-weak: beats nothing and loses to most of the roster. */
export function superWeak(dom: Dominance[], roster: UnitType[] = CORE_COMBAT): Dominance[] {
  const minLosses = Math.ceil(((roster.length - 1) * 2) / 3);
  return dom.filter((d) => d.beats.length === 0 && d.beatenBy.length >= minLosses);
}
