import { BANNER_BONUS } from './abilities';
import { CORE_COMBAT, Mulberry32, statsFor, strike, type UnitStats } from './balance';
import { MISS_CHANCE } from './combat';
import { UNIT_TYPES, unitTypeMaintenance } from './units';
import { UnitType } from '@enums';

/** Purchase price in money-equivalents (money + wood + 2×ore), no skill gate. */
export function armyUnitCost(type: UnitType, upkeepTurns = 0): number {
  const s = UNIT_TYPES[type];
  return s.price + s.priceWood + 2 * s.priceOre + upkeepTurns * unitTypeMaintenance(type);
}

interface Fighter {
  type: UnitType;
  stats: UnitStats;
  hp: number;
}

type Overrides = Partial<Record<UnitType, Partial<UnitStats>>>;

function spawn(types: UnitType[], overrides?: Overrides): Fighter[] {
  return types.map((type) => {
    const stats = statsFor(type, overrides);
    return { type, stats, hp: stats.maxHp };
  });
}

/** Max melee attackers that can touch one target in a turn (its 6 neighbours). */
export const MELEE_SLOTS = 6;

/** Pick a target: prefer a kill (the highest-cost one), else the most damage.
 *  Melee attackers skip targets whose 6 adjacent hexes are already taken. */
function pickTarget(att: Fighter, foes: Fighter[], bonus: number, slots: Map<Fighter, number>): Fighter | null {
  let best: Fighter | null = null;
  let bestScore = -Infinity;
  const melee = att.stats.attackDistance <= 1;
  for (const f of foes) {
    if (f.hp <= 0) continue;
    if (melee && (slots.get(f) ?? 0) >= MELEE_SLOTS) continue;
    const { dmg } = strike(att.type, f.type, att.stats, f.stats, att.hp, f.hp, { distance: att.stats.attackDistance, bonus });
    const kills = dmg >= f.hp;
    const score = (kills ? 1000 + armyUnitCost(f.type) : 0) + dmg - f.hp * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

/** One side's turn: every eligible living unit attacks once with focus fire;
 *  banners add +5 attack to allies (all fighters are assumed inside the aura);
 *  a knight that kills attacks again. Attacks are made from each unit's own
 *  attack distance, so a defender counters only when it reaches that far. At
 *  most MELEE_SLOTS melee attackers may hit one target per turn. */
function playTurn(side: Fighter[], foes: Fighter[], rng: () => number, eligible: (f: Fighter) => boolean = () => true): void {
  const banner = side.some((u) => u.type === UnitType.BANNER && u.hp > 0);
  const slots = new Map<Fighter, number>();
  for (const att of side) {
    if (!eligible(att)) continue;
    let again = true;
    while (att.hp > 0 && again) {
      again = false;
      const bonus = banner && att.type !== UnitType.BANNER ? BANNER_BONUS : 0;
      const target = pickTarget(att, foes, bonus, slots);
      if (!target) return;
      if (att.stats.attackDistance <= 1) slots.set(target, (slots.get(target) ?? 0) + 1);
      if (rng() < MISS_CHANCE) break;
      const { dmg, counter } = strike(att.type, target.type, att.stats, target.stats, att.hp, target.hp, {
        distance: att.stats.attackDistance,
        bonus,
      });
      target.hp -= dmg;
      if (target.hp <= 0) {
        again = att.type === UnitType.KNIGHT;
      } else {
        att.hp -= counter;
      }
    }
  }
}

/** Free volleys a ranged unit gets while the enemy closes from its own range:
 *  (range - 1) hexes at the fastest enemy's hexes-per-turn. Melee gets none. */
function freeVolleys(f: Fighter, foes: Fighter[]): number {
  const range = f.stats.attackDistance;
  if (range <= 1) return 0;
  const fastest = Math.max(1, ...foes.map((x) => Math.floor(x.stats.movePoints / 10)));
  return Math.ceil((range - 1) / fastest);
}

/** Fights two armies to the death (or a round cap). Returns 1 if `a` wins, 0 if
 *  `b` wins, 0.5 on a cap draw. `aFirst` picks who acts first. */
export function skirmish(a: UnitType[], b: UnitType[], aFirst: boolean, rng: () => number, overrides?: Overrides, maxRounds = 60): number {
  const A = spawn(a, overrides);
  const B = spawn(b, overrides);
  const alive = (s: Fighter[]) => s.some((f) => f.hp > 0);
  // Approach phase: ranged units shoot while melee walks in; nobody else acts.
  const freeA = new Map(A.map((f) => [f, freeVolleys(f, B)] as const));
  const freeB = new Map(B.map((f) => [f, freeVolleys(f, A)] as const));
  for (let r = 0; r < 4; r++) {
    const okA = (f: Fighter) => (freeA.get(f) ?? 0) > r;
    const okB = (f: Fighter) => (freeB.get(f) ?? 0) > r;
    if (aFirst) {
      playTurn(A, B, rng, okA);
      playTurn(B, A, rng, okB);
    } else {
      playTurn(B, A, rng, okB);
      playTurn(A, B, rng, okA);
    }
  }
  if (!alive(A) || !alive(B)) return alive(A) ? 1 : alive(B) ? 0 : 0.5;
  for (let round = 0; round < maxRounds; round++) {
    if (aFirst) {
      playTurn(A, B, rng);
      if (!alive(B)) return 1;
      playTurn(B, A, rng);
      if (!alive(A)) return 0;
    } else {
      playTurn(B, A, rng);
      if (!alive(A)) return 0;
      playTurn(A, B, rng);
      if (!alive(B)) return 1;
    }
  }
  return 0.5;
}

/** Army of one unit type worth about `budget` (at least one unit). */
export function armyFor(type: UnitType, budget: number, upkeepTurns = 0): UnitType[] {
  const n = Math.max(1, Math.round(budget / armyUnitCost(type, upkeepTurns)));
  return Array.from({ length: n }, () => type);
}

export interface SkirmishMatrix {
  budget: number;
  upkeepTurns: number;
  roster: UnitType[];
  /** win[row][col] = P(row army beats col army), initiative-averaged. */
  win: Record<string, Record<string, number>>;
}

/** Equal-budget mono-army tournament: does mass-of-cheap beat few-expensive? */
export function runSkirmishMatrix(
  budget = 96,
  upkeepTurns = 0,
  roster: UnitType[] = CORE_COMBAT,
  seed = 777,
  trials = 200,
  overrides?: Overrides,
): SkirmishMatrix {
  const win: SkirmishMatrix['win'] = {};
  const rng = new Mulberry32(seed);
  for (const a of roster) {
    win[a] = {};
    for (const b of roster) {
      if (a === b) continue;
      const A = armyFor(a, budget, upkeepTurns);
      const B = armyFor(b, budget, upkeepTurns);
      let sum = 0;
      for (let i = 0; i < trials; i++) sum += skirmish(A, B, i % 2 === 0, () => rng.next(), overrides);
      win[a]![b] = sum / trials;
    }
  }
  return { budget, upkeepTurns, roster, win };
}

/** Mean skirmish win-rate of each roster unit over the others. */
export function skirmishMeans(m: SkirmishMatrix): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of m.roster) {
    const others = m.roster.filter((b) => b !== a);
    out[a] = others.reduce((s, b) => s + m.win[a]![b]!, 0) / Math.max(1, others.length);
  }
  return out;
}
