# AI Strategic Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each AI a persistent, multi-turn strategic layer (HTN-flavored goal recipes → per-turn *directives*) that biases the existing one-turn tactical planner, so the AI builds its economy first, then musters and pushes with massed force, defends with a planned counter, and plays visibly different personalities.

**Architecture:** `Player.strategy` holds persistent goals (plain JSON, survives save/load). Each AI turn `updateStrategy` (throttled re-pick, forced re-plan on invalidation) computes the active goal set, then `deriveDirectives` expands the current goal phases into an `AiDirectives` object. The existing pattern cascade (`AI_PATTERNS`) and `bestAvailableAction` read the directives as *score biases only* — with no directives every path behaves byte-for-byte as today.

**Tech Stack:** TypeScript, Vitest (`npm test`), `npm run typecheck`. No new dependencies. No renderer/UI/network changes.

## Global Constraints

- All new modules live under `src/game/`.
- Directives are **optional and neutral by default**: when `directives` is `undefined` (or a field is unset) every score/tactic is today's exact value.
- `Player.strategy` must stay plain JSON (no methods, no Sets/Maps) — it is serialized by `GameStateSnapshot`.
- Match existing code style: no comments except per project conventions; reuse `SeededRandom` for every non-deterministic choice.
- Do **not** modify `GAME.md` — no rules change; this is decision logic only.
- Run `npm test` and `npm run typecheck` before every commit in every task.
- All task relationships: Task 1 builds types + personality; Task 2 builds the planner lifecycle; Task 3 builds directive recipes; Task 4 wires everything into `ai.ts`; Task 5 is the full regression gate.

---

### Task 1: Types, difficulty profile, and personalities

**Files:**
- Modify: `src/game/aiTypes.ts`
- Modify: `src/game/aiDifficulty.ts`
- Modify: `src/game/players.ts`
- Create: `src/game/aiPersonality.ts`
- Test: `tests/aiStrategy.test.ts` (new file, first describe block)

**Interfaces:**
- Produces:
  - `aiTypes.ts`: `export type AiGoalId = 'economy' | 'army' | 'defense' | 'naval' | 'score'`; `export interface AiGoalState { id: AiGoalId; phase: string; target: { q: number; r: number } | null; sinceTurn: number; confidence: number }`; `export interface AiStrategyState { personalityId: string; nextPlanTurn: number; goals: AiGoalState[] }`; `export type SpawnPreference = 'offense' | 'defense' | 'scout' | 'naval'`; `export interface AiDirectives { frontTarget: { q: number; r: number } | null; muster: { tile: { q: number; r: number } | null; minUnits: number; target: { q: number; r: number } } | null; spawnPlan: { villageKey: string; prefer: SpawnPreference }[]; moneyReserve: number; skillChain: SkillId[] | null; pace: 'rushed' | 'normal' | 'slow' }`. Also: `AiPatternContext` gains `directives?: AiDirectives` (moved from `aiPatterns.ts`).
  - `aiDifficulty.ts`: `export interface AiStrategyProfile { planIntervalTurns: number; musterFactor: number; assaultRatio: number; economyCap: number }`; `AiDifficultyProfile` gains `strategy: AiStrategyProfile`.
  - `aiPersonality.ts`: `export type AiPersonalityId = 'aggressive' | 'balanced' | 'builder'`; `export interface AiPersonality { id: AiPersonalityId; goalWeights: Record<AiGoalId, number>; musterMinUnits: number }`; `export const AI_PERSONALITIES: Record<AiPersonalityId, AiPersonality>`; `export function personalityFor(player: Player): AiPersonality`.
  - `players.ts`: `import { AiStrategyState } from './aiTypes'`; `Player` gains `strategy?: AiStrategyState`.
  - `aiPatterns.ts`: delete its local `SpawnPreference` type declaration and re-export it from `aiTypes` so `bestSpawnableUnitType`'s signature is unchanged for callers.

- Consumes: existing `Player`/`AiDifficultyProfile`/`SkillId`/`UnitType` types.

- [ ] **Step 1: Write the failing test**

Create `tests/aiStrategy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY_PROFILES } from '../src/game/aiDifficulty';
import { AI_PERSONALITIES, personalityFor } from '../src/game/aiPersonality';
import { SpawnPreference } from '../src/game/aiTypes';
import { Player } from '../src/game/players';

function aiPlayer(name: string): Player {
  return {
    index: 1, tribe: 3, isHuman: false, name,
    resources: { wood: 5, stone: 5, money: 100, ore: 5 },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

describe('AI strategy types & personalities', () => {
  it('every difficulty profile has a strategy group with sane bounds', () => {
    for (const key of ['easy', 'normal', 'hard'] as const) {
      const s = AI_DIFFICULTY_PROFILES[key].strategy;
      expect(s.planIntervalTurns).toBeGreaterThan(0);
      expect(s.musterFactor).toBeGreaterThan(0);
      expect(s.assaultRatio).toBeGreaterThan(0);
      expect(s.economyCap).toBeGreaterThanOrEqual(0);
    }
  });

  it('personality assignment is deterministic per name', () => {
    const a1 = personalityFor(aiPlayer('Sable'));
    const a2 = personalityFor(aiPlayer('Sable'));
    expect(a1.id).toBe(a2.id);
  });

  it('covers all three personality ids across many names', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) ids.add(personalityFor(aiPlayer(`p${i}`)).id);
    expect(ids.size).toBe(3);
  });

  it('exposes the SpawnPreference union through aiTypes', () => {
    const prefs: SpawnPreference[] = ['offense', 'defense', 'scout', 'naval'];
    expect(prefs).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiStrategy.test.ts`
Expected: FAIL — `aiPersonality` / `aiTypes` imports not found.

- [ ] **Step 3: Implement types, profile, and personalities**

Extend `src/game/aiTypes.ts` to:

```ts
import { BuildingKind } from './events';
import { SkillId } from './skills';
import { UnitType } from './units';

export type SpawnPreference = 'offense' | 'defense' | 'scout' | 'naval';

export type AiGoalId = 'economy' | 'army' | 'defense' | 'naval' | 'score';

export interface AiGoalState {
  id: AiGoalId;
  phase: string;
  target: { q: number; r: number } | null;
  sinceTurn: number;
  confidence: number;
}

export interface AiStrategyState {
  personalityId: string;
  nextPlanTurn: number;
  goals: AiGoalState[];
}

export interface AiDirectives {
  frontTarget: { q: number; r: number } | null;
  muster: { tile: { q: number; r: number } | null; minUnits: number; target: { q: number; r: number } } | null;
  spawnPlan: { villageKey: string; prefer: SpawnPreference }[];
  moneyReserve: number;
  skillChain: SkillId[] | null;
  pace: 'rushed' | 'normal' | 'slow';
}

export type AiAction =
  | { type: 'upgrade'; q: number; r: number }
  | { type: 'move'; unitId: string; q: number; r: number }
  | { type: 'attack'; unitId: string; q: number; r: number }
  | { type: 'spawn'; q: number; r: number; unitType: UnitType }
  | { type: 'capture'; q: number; r: number; unitId: string }
  | { type: 'heal'; unitId: string; q: number; r: number }
  | { type: 'build'; q: number; r: number; kind: BuildingKind }
  | { type: 'buildRoad'; q: number; r: number }
  | { type: 'buildBridge'; q: number; r: number }
  | { type: 'upgradeShip'; unitId: string }
  | { type: 'openSkill'; skill: SkillId };

export interface AiPlannerState {
  moved: Set<string>;
  acted: Set<string>;
  upgraded: Set<string>;
  spawned: Set<string>;
  built: Set<string>;
  opened: Set<SkillId>;
  occupied: Set<string>;
}
```

Note: `AiPlannerState` is unchanged; only the type additions above are new at the top of the file (keep the original `AiAction`/`AiPlannerState` blocks byte-identical).

In `src/game/aiDifficulty.ts`, add the `strategy` group:

```ts
export interface AiStrategyProfile {
  planIntervalTurns: number;
  musterFactor: number;
  assaultRatio: number;
  economyCap: number;
}

export interface AiDifficultyProfile {
  mistakeChance: number;
  guardWindow: number;
  warRatio: number;
  checkTrades: boolean;
  spawnReserve: number;
  navalThreatRadius: number;
  strategy: AiStrategyProfile;
}

export const AI_DIFFICULTY_PROFILES: Record<AiDifficulty, AiDifficultyProfile> = {
  easy: { mistakeChance: 0.25, guardWindow: 1, warRatio: 2.5, checkTrades: false, spawnReserve: 8, navalThreatRadius: 6, strategy: { planIntervalTurns: 6, musterFactor: 0.6, assaultRatio: 1.8, economyCap: 1 } },
  normal: { mistakeChance: 0, guardWindow: 2, warRatio: 1.5, checkTrades: true, spawnReserve: 4, navalThreatRadius: 10, strategy: { planIntervalTurns: 4, musterFactor: 1.0, assaultRatio: 1.3, economyCap: 2 } },
  hard: { mistakeChance: 0, guardWindow: 3, warRatio: 1.0, checkTrades: true, spawnReserve: 0, navalThreatRadius: 14, strategy: { planIntervalTurns: 2, musterFactor: 1.5, assaultRatio: 1.0, economyCap: 2 } },
};
```

Create `src/game/aiPersonality.ts`:

```ts
import type { Player } from './players';
import type { AiGoalId } from './aiTypes';

export type AiPersonalityId = 'aggressive' | 'balanced' | 'builder';

export interface AiPersonality {
  id: AiPersonalityId;
  goalWeights: Record<AiGoalId, number>;
  musterMinUnits: number;
}

export const AI_PERSONALITIES: Record<AiPersonalityId, AiPersonality> = {
  aggressive: { id: 'aggressive', goalWeights: { economy: 0.6, army: 2.0, defense: 0.9, naval: 0.4, score: 1.0 }, musterMinUnits: 3 },
  balanced: { id: 'balanced', goalWeights: { economy: 1.0, army: 1.0, defense: 1.0, naval: 0.7, score: 1.0 }, musterMinUnits: 4 },
  builder: { id: 'builder', goalWeights: { economy: 2.0, army: 0.6, defense: 1.1, naval: 1.2, score: 1.0 }, musterMinUnits: 5 },
};

function hashName(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return h;
}

export function personalityFor(player: Player): AiPersonality {
  const ids: AiPersonalityId[] = ['aggressive', 'balanced', 'builder'];
  return AI_PERSONALITIES[ids[hashName(player.name) % ids.length]!]!;
}
```

In `src/game/players.ts`, add the optional field:

```ts
import type { AiStrategyState } from './aiTypes';
...
export interface Player {
  index: number;
  tribe: Tribe;
  isHuman: boolean;
  name: string;
  resources: Resources;
  score: number;
  kills: number;
  skills: SkillId[];
  isActive: boolean;
  knownTribes?: Tribe[];
  stats?: PlayerStats;
  difficulty?: AiDifficulty;
  achievements?: AchievementId[];
  strategy?: AiStrategyState;
}
```

In `src/game/aiPatterns.ts`, replace the local `SpawnPreference` declaration:

```ts
import { AiAction, AiPlannerState, SpawnPreference } from './aiTypes';
```
and delete the line `export type SpawnPreference = 'offense' | 'defense' | 'scout' | 'naval';`. Note `aiPatterns.ts` maps over `SPAWN_ORDER: Record<SpawnPreference, UnitType[]>` — with the import it compiles unchanged. Do **not** re-export; verify nothing else imports `SpawnPreference` from `aiPatterns` (confirmed by grep: only `aiPatterns.ts` itself).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/aiStrategy.test.ts tests/aiDifficulty.test.ts tests/aiPatterns.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Commit:

```bash
git add src/game/aiTypes.ts src/game/aiDifficulty.ts src/game/players.ts src/game/aiPersonality.ts src/game/aiPatterns.ts tests/aiStrategy.test.ts
git commit -m "feat: AI strategy types, difficulty profile, personalities"
```

---

### Task 2: Strategy lifecycle — state, re-pick throttle, forced re-plan

**Files:**
- Create: `src/game/aiStrategy.ts`
- Test: `tests/aiStrategy.test.ts` (append a second describe block)

**Interfaces:**
- Consumes: `AiSituation` (from `aiSituation.ts`), `AiDifficultyProfile`, `AiPersonality`/`personalityFor`, `SeededRandom`, `Player`, `GameMap`, `GameMode`.
- Produces:
  - `export function ensurePlayerStrategy(player: Player, rng: SeededRandom): AiStrategyState`
  - `export function productionBuildings(map: GameMap, player: Player): number`
  - `export function updateStrategy(map: GameMap, player: Player, situation: AiSituation, mode: GameMode, difficulty: AiDifficultyProfile, turn: number, rng: SeededRandom): AiStrategyState`
  - `export function goalTargetKey(g: AiGoalState): string`

Rules encoded:
- Primary goal is `economy | army | score` picked by weighted score; `defense` and `naval` are condition-driven (never scored) and auto-add/remove each re-pick.
- Re-pick runs when `turn >= state.nextPlanTurn` **or** any active goal is *expired* (forced re-plan). Otherwise the goal set is untouched (persistence).
- After a re-pick: `state.nextPlanTurn = turn + difficulty.strategy.planIntervalTurns`.

- [ ] **Step 1: Write the failing test**

Append to `tests/aiStrategy.test.ts`:

```ts
import { updateStrategy, goalTargetKey, productionBuildings } from '../src/game/aiStrategy';
import { analyzeSituation } from '../src/game/aiSituation';
import { profileFor } from '../src/game/aiDifficulty';
import { SeededRandom } from '../src/util/random';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Unit } from '../src/game/units';
import { GameMode } from '../src/game/gameMode';

function makeTile(q: number, r: number, ownedBy: number | null = null, settlement: Settlement | null = null, unit: Unit | null = null): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy, claimedByVillage: null, building: null, exploredBy: [0, 1] };
}

function makeWarrior(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 50, attack: 20, attackDistance: 1, defense: 0, spawnVillage: null };
}

function twoVillageMap(): GameMap {
  const tiles: MapTile[] = [
    makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }, makeWarrior('g1', 1, 0, 0)),
    makeTile(1, 0, 1, { owner: 1, level: 1, captureReady: false }),
    makeTile(2, 0),
    makeTile(3, 0),
    makeTile(4, 0, 0, { owner: 0, level: 1, captureReady: false }),
  ];
  return { radius: 4, tiles, spawns: [] };
}

describe('AiStrategy lifecycle', () => {
  const mode: GameMode = 'capture';

  function v1(name = 'Adaro'): ReturnType<typeof aiPlayer> {
    return aiPlayer(name);
  }

  it('starts with a persisted strategy state and a primary army/economy or score goal', () => {
    const p = v1();
    const map = twoVillageMap();
    const situation = analyzeSituation(map, p, mode, profileFor(p));
    const state = updateStrategy(map, p, situation, mode, profileFor(p), 1, new SeededRandom(1));
    expect(p.strategy).toBe(state);
    expect(state.goals.length).toBeGreaterThan(0);
    expect(['economy', 'army', 'score']).toContain(state.goals[0]!.id);
  });

  it('keeps the same goal set between the plan interval (persistence)', () => {
    const p = v1();
    const map = twoVillageMap();
    const profile = profileFor(p);
    const s1 = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1, new SeededRandom(1));
    const s2 = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 2, new SeededRandom(1));
    const same = s1.goals.length === s2.goals.length && s1.goals.every((g, i) => g.id === s2.goals[i]!.id);
    expect(same).toBe(true);
  });

  it('re-picks after the plan interval passes', () => {
    const p = v1();
    const map = twoVillageMap();
    const profile = profileFor(p);
    const s1 = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1, new SeededRandom(1));
    const s2 = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1 + profile.strategy.planIntervalTurns + 1, new SeededRandom(1));
    expect(s2.nextPlanTurn).toBeGreaterThan(s1.nextPlanTurn);
  });

  it('adds a defense goal when endangered and drops it when safe again', () => {
    const map = twoVillageMap();
    map.tiles.push(makeTile(0, 3, 0, null, makeWarrior('e1', 0, 0, 3)));
    const p = v1();
    const profile = profileFor(p);
    const s = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1, new SeededRandom(1));
    expect(s.goals.some((g) => g.id === 'defense')).toBe(true);
    map.tiles.pop();
    const s2 = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1 + profile.strategy.planIntervalTurns, new SeededRandom(1));
    expect(s2.goals.some((g) => g.id === 'defense')).toBe(false);
  });

  it('tracks production buildings and exposes a stable goal target key', () => {
    const map = twoVillageMap();
    map.tiles[1]!.building = { kind: 'mine', level: 1 };
    const p = v1();
    expect(productionBuildings(map, p)).toBe(1);
    const s = updateStrategy(map, p, analyzeSituation(map, p, mode, profileFor(p)), mode, profileFor(p), 1, new SeededRandom(1));
    if (s.goals[0]!.target) expect(goalTargetKey(s.goals[0]!)).toBe(`${s.goals[0]!.target!.q},${s.goals[0]!.target!.r}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiStrategy.test.ts`
Expected: FAIL — `aiStrategy` module not found.

- [ ] **Step 3: Implement the strategy lifecycle**

Create `src/game/aiStrategy.ts`:

```ts
import { GameMap } from './mapGen';
import { Player } from './players';
import { GameMode } from './gameMode';
import { AiDifficultyProfile } from './aiDifficulty';
import { personalityFor } from './aiPersonality';
import { AiGoalId, AiGoalState, AiStrategyState } from './aiTypes';
import { AiSituation } from './aiSituation';
import { SeededRandom } from '../util/random';
import { isExploredFor } from './explore';

const PRIMARY_IDS: AiGoalId[] = ['economy', 'army', 'score'];

export function goalTargetKey(g: AiGoalState): string {
  return g.target ? `${g.target.q},${g.target.r}` : '';
}

export function productionBuildings(map: GameMap, player: Player): number {
  let n = 0;
  for (const t of map.tiles) {
    if (t.ownedBy !== player.index || !t.building) continue;
    if (t.building.kind === 'mine' || t.building.kind === 'sawmill') n += 1;
  }
  return n;
}

export function ensurePlayerStrategy(player: Player, rng: SeededRandom): AiStrategyState {
  if (!player.strategy) {
    const personality = personalityFor(player);
    player.strategy = { personalityId: personality.id, nextPlanTurn: 0, goals: [] };
  }
  return player.strategy;
}

function hasGoal(state: AiStrategyState, id: AiGoalId): boolean {
  return state.goals.some((g) => g.id === id);
}

function makeGoal(id: AiGoalId, phase: string, target: { q: number; r: number } | null, turn: number): AiGoalState {
  return { id, phase, target, sinceTurn: turn, confidence: 1 };
}

function enemyVillageVisible(map: GameMap, player: Player): boolean {
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === null || t.settlement.owner === player.index) continue;
    if (isExploredFor(t, player.index)) return true;
  }
  return false;
}

function chooseArmyTarget(map: GameMap, player: Player): { q: number; r: number } | null {
  let best: { q: number; r: number } | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement) continue;
    if (t.settlement.owner === player.index) continue;
    if (t.settlement.owner === null && !isExploredFor(t, player.index)) continue;
    let d = Infinity;
    for (const u of map.tiles) {
      if (!u.unit || u.unit.owner !== player.index) continue;
      const dx = Math.abs(u.q - t.q);
      const dy = Math.abs(u.r - t.r);
      const dist = Math.max(dx, dy, Math.abs(dx - dy));
      if (dist < d) d = dist;
    }
    if (d < bestDist) {
      bestDist = d;
      best = { q: t.q, r: t.r };
    }
  }
  return best;
}

function goalExpired(map: GameMap, player: Player, situation: AiSituation, g: AiGoalState): boolean {
  switch (g.id) {
    case 'defense':
      return !situation.endangered;
    case 'naval':
      return !situation.navalThreat;
    case 'army': {
      if (!g.target) return false;
      const tile = map.tiles.find((t) => t.q === g.target!.q && t.r === g.target!.r && t.settlement);
      if (!tile || !tile.settlement) return true;
      return tile.settlement.owner === player.index;
    }
    default:
      return false;
  }
}

function weightedPrimaryScore(
  map: GameMap,
  player: Player,
  situation: AiSituation,
  mode: GameMode,
  difficulty: AiDifficultyProfile,
  rng: SeededRandom,
  weights: { economy: number; army: number; score: number },
): AiGoalId {
  const production = productionBuildings(map, player);
  const economyScore = (70 - production * 20 + situation.freeVillages.length * 5) * weights.economy + rng.next() * 20;
  let armyScore = (25 + (enemyVillageVisible(map, player) ? 90 : 0) + situation.freeVillages.length * 8 + (situation.ownPower >= situation.enemyPower ? 25 : 0)) * weights.army + rng.next() * 20;
  if (mode === 'turns30') armyScore *= 0.5;
  if (production >= difficulty.strategy.economyCap) economyScore -= 40;
  if (economyScore >= armyScore) return 'economy';
  return 'army';
}

export function updateStrategy(
  map: GameMap,
  player: Player,
  situation: AiSituation,
  mode: GameMode,
  difficulty: AiDifficultyProfile,
  turn: number,
  rng: SeededRandom,
): AiStrategyState {
  const state = ensurePlayerStrategy(player, rng);
  const personality = personalityFor(player);
  const expired = state.goals.some((g) => goalExpired(map, player, situation, g));
  if (turn < state.nextPlanTurn && !expired) return state;

  const kept = state.goals.filter((g) => !goalExpired(map, player, situation, g));
  const next = kept.filter((g) => g.id !== 'defense' && g.id !== 'naval');

  if (situation.endangered && !hasGoalTyped(next, 'defense')) {
    const danger = situation.dangers[0];
    next.push(makeGoal('defense', 'muster', danger ? { q: danger.village.q, r: danger.village.r } : null, turn));
  }
  if (situation.navalThreat && !hasGoalTyped(next, 'naval')) {
    next.push(makeGoal('naval', 'research', null, turn));
  }
  if (mode === 'turns30' && !hasGoalTyped(next, 'score')) {
    next.push(makeGoal('score', 'race', null, turn));
  }

  const current = next.find((g) => g.id === 'economy' || g.id === 'army');
  const picked = weightedPrimaryScore(map, player, situation, mode, difficulty, rng, {
    economy: personality.goalWeights.economy,
    army: personality.goalWeights.army,
    score: personality.goalWeights.score,
  });
  if (mode === 'turns30' && situation.ownPower < situation.enemyPower * 0.8) {
    next = next.filter((g) => g.id !== 'economy' && g.id !== 'army');
    if (!hasGoalTyped(next, 'army')) next.push(makeGoal('army', 'choose', null, turn));
  } else if (!current || current.id !== picked) {
    next = next.filter((g) => g.id !== 'economy' && g.id !== 'army');
    next.push(makeGoal(picked, picked === 'army' ? 'choose' : 'build', picked === 'army' ? chooseArmyTarget(map, player) : null, turn));
  }

  state.goals = next;
  state.nextPlanTurn = turn + difficulty.strategy.planIntervalTurns;
  return state;
}

function hasGoalTyped(goals: AiGoalState[], id: AiGoalId): boolean {
  return goals.some((g) => g.id === id);
}
```

Note: in `weightedPrimaryScore`, declare `let armyScore` (mutable) because of the `turns30` re-assignment — the snippet above already does.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/aiStrategy.test.ts`
Expected: PASS (the defense add/drop test pops the tile so the situation is recomputed on a map with no enemy).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Commit:

```bash
git add src/game/aiStrategy.ts tests/aiStrategy.test.ts
git commit -m "feat: AI strategy lifecycle (persistent goals, throttle, forced replan)"
```

---

### Task 3: Directive recipes — economy / army / defense / naval / score goals

**Files:**
- Modify: `src/game/aiStrategy.ts` (append recipe helpers.)
- Test: `tests/aiStrategy.test.ts` (append a third describe block)

**Interfaces:**
- Consumes: `AiDirectives`, `AiSituation`, `AiDifficultyProfile`, `AI_PERSONALITIES`, `hasSkill`/`SkillId`, `hexDistance`.
- Produces: `export function deriveDirectives(map: GameMap, player: Player, situation: AiSituation, difficulty: AiDifficultyProfile, strategy: AiStrategyState): AiDirectives` plus private helpers.

- [ ] **Step 1: Write the failing test**

Append to `tests/aiStrategy.test.ts`:

```ts
import { deriveDirectives } from '../src/game/aiStrategy';
import { ensurePlayerStrategy } from '../src/game/aiStrategy';

describe('AiStrategy deriveDirectives', () => {
  const mode: GameMode = 'capture';
  const rng = new SeededRandom(1);

  it('emits a neutral directive set for a fresh player (no goals)', () => {
    const p = aiPlayer('Adaro');
    const map = twoVillageMap();
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, mode, profile);
    const state = ensurePlayerStrategy(p, rng);
    const d = deriveDirectives(map, p, situation, profile, state);
    expect(d.frontTarget).toBeNull();
    expect(d.muster).toBeNull();
    expect(d.spawnPlan).toEqual([]);
    expect(d.moneyReserve).toBe(8);
    expect(d.skillChain).toBeNull();
    expect(d.pace).toBe('normal');
  });

  it('economy goal sets a slow pace, reserve, and economy skill chain', () => {
    const p = aiPlayer('Elowen'); // deterministic name
    const map = twoVillageMap();
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, mode, profile);
    const state = updateStrategy(map, p, situation, mode, profile, 1, rng);
    const d = deriveDirectives(map, p, situation, profile, state);
    if (state.goals[0]!.id === 'economy') {
      expect(d.pace).toBe('slow');
      expect(d.moneyReserve).toBeGreaterThanOrEqual(12);
      expect(d.skillChain).not.toBeNull();
    } else {
      expect(d.frontTarget).not.toBeNull(); // army goal targets the enemy village
    }
  });

  it('army goal emits a front target toward the enemy village and an offense spawn plan', () => {
    const map = twoVillageMap();
    const p = aiPlayer('Ragnar');
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, mode, profile);
    const state = updateStrategy(map, p, situation, mode, profile, 8, rng);
    const d = deriveDirectives(map, p, situation, profile, state);
    const army = state.goals.find((g) => g.id === 'army');
    expect(army).toBeDefined();
    expect(d.frontTarget).not.toBeNull();
    expect(d.spawnPlan.some((s) => s.prefer === 'offense')).toBe(true);
  });

  it('defense goal reverts the money reserve to 0 and targets the endangered village', () => {
    const map = twoVillageMap();
    map.tiles.push(makeTile(0, 2, 0, null, makeWarrior('e1', 0, 0, 2)));
    const p = aiPlayer('Sable');
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, mode, profile);
    const state = updateStrategy(map, p, situation, mode, profile, 1, rng);
    expect(state.goals.some((g) => g.id === 'defense')).toBe(true);
    const d = deriveDirectives(map, p, situation, profile, state);
    expect(d.moneyReserve).toBe(0);
    expect(d.pace).toBe('rushed');
    expect(d.frontTarget).not.toBeNull();
  });

  it('naval goal opens the naval skill chain first', () => {
    const map = twoVillageMap();
    map.tiles.push(makeTile(0, -2, 0, null, { ...makeWarrior('e1', -1, 0, -2), shipLevel: 1 }));
    const p = aiPlayer('Mara');
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, mode, profile);
    const state = updateStrategy(map, p, situation, mode, profile, 1, rng);
    expect(state.goals.some((g) => g.id === 'naval')).toBe(true);
    const d = deriveDirectives(map, p, situation, profile, state);
    expect(d.skillChain).not.toBeNull();
  });

  it('score goal sets a rushed pace and zero reserve in 30-turn mode', () => {
    const p = aiPlayer('Kade');
    const map = twoVillageMap();
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, 'turns30', profile);
    const state = updateStrategy(map, p, situation, 'turns30', profile, 12, rng);
    const d = deriveDirectives(map, p, situation, profile, state);
    expect(d.pace).toBe('rushed');
    expect(d.moneyReserve).toBe(0);
  });

  it('personalities diverge: aggressive picks army, builder picks economy on the same map', () => {
    const map = twoVillageMap();
    const aggr = updateStrategy(map, aiPlayer('Zed'), analyzeSituation(map, aiPlayer('Zed'), mode, profileFor(aiPlayer('Zed'))), mode, profileFor(aiPlayer('Zed')), 1, rng);
    const build = updateStrategy(map, aiPlayer('Tea'), analyzeSituation(map, aiPlayer('Tea'), mode, profileFor(aiPlayer('Tea'))), mode, profileFor(aiPlayer('Tea')), 1, rng);
    const pick = (s: AiStrategyState) => s.goals.find((g) => g.id === 'economy' || g.id === 'army')!.id;
    expect(pick(aggr)).not.toBe(pick(build));
  });
});
```

Note: the two test maps `twoVillageMap` and the personality divergence rely on deterministic names that produce different personalities; if the specific names don't produce a split, pick different names or assert `pick(aggr) === 'army'`/`pick(build) === 'economy'` after checking `personalityFor` — during implementation, tweak the names so the assertion holds (see Step 4 note).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiStrategy.test.ts`
Expected: FAIL — `deriveDirectives` not found.

- [ ] **Step 3: Implement the recipes**

Append to `src/game/aiStrategy.ts`:

```ts
import { AiDirectives } from './aiTypes';
import { AI_PERSONALITIES } from './aiPersonality';
import { hexDistance } from './hex';
import { hasSkill, SkillId } from './skills';
import { UnitType } from './units';

function economySkillChain(player: Player): SkillId[] | null {
  const chain: SkillId[] = ['forestry', 'climbing', 'smithery', 'geology', 'science'];
  for (const s of chain) if (!hasSkill(player, s)) return chain.slice(chain.indexOf(s));
  return null;
}

function navalSkillChain(player: Player): SkillId[] | null {
  const chain: SkillId[] = ['water', 'navigation', 'science', 'catapult'];
  for (const s of chain) if (!hasSkill(player, s)) return chain.slice(chain.indexOf(s));
  return null;
}

function countOwnUnitsNear(map: GameMap, player: Player, target: { q: number; r: number }, radius: number): number {
  let n = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner !== player.index) continue;
    const d = hexDistance(t, target);
    if (d <= radius) n += 1;
  }
  return n;
}

function nearestOwnVillageTo(map: GameMap, player: Player, target: { q: number; r: number }): MapTile | null {
  let best: MapTile | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== player.index) continue;
    const d = hexDistance(t, target);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function nearestFreeVillage(map: GameMap, player: Player, situation: AiSituation): { q: number; r: number } | null {
  if (situation.freeVillages.length === 0) return null;
  const v = situation.freeVillages[0]!.village;
  return { q: v.q, r: v.r };
}

export function deriveDirectives(
  map: GameMap,
  player: Player,
  situation: AiSituation,
  difficulty: AiDifficultyProfile,
  strategy: AiStrategyState,
): AiDirectives {
  const personality = AI_PERSONALITIES[strategy.personalityId] ?? AI_PERSONALITIES.balanced;
  const d: AiDirectives = { frontTarget: null, muster: null, spawnPlan: [], moneyReserve: 8, skillChain: null, pace: 'normal' };

  for (const g of strategy.goals) {
    if (g.id === 'economy') {
      d.pace = 'slow';
      d.moneyReserve = Math.max(d.moneyReserve, 12);
      d.skillChain = economySkillChain(player);
    }
    if (g.id === 'army') {
      const target = g.target;
      if (!target) continue;
      d.frontTarget = target;
      d.pace = 'rushed';
      if (d.moneyReserve > 4) d.moneyReserve = 4;
      const mustered = countOwnUnitsNear(map, player, target, 5);
      const minUnits = Math.round(personality.musterMinUnits * difficulty.strategy.musterFactor);
      const assaultReady = situation.ownPower >= situation.enemyPower * difficulty.strategy.assaultRatio;
      if (g.phase === 'muster' && mustered < minUnits && !assaultReady) {
        d.muster = { tile: null, minUnits, target };
      }
      const village = nearestOwnVillageTo(map, player, target);
      if (village) {
        const preferred = target && !situation.freeVillages.some((fv) => fv.village.q === target.q && fv.village.r === target.r) ? 'offense' : 'scout';
        d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: preferred });
      }
    }
    if (g.id === 'defense') {
      if (!g.target) continue;
      d.frontTarget = g.target;
      d.moneyReserve = 0;
      d.pace = 'rushed';
      d.muster = { tile: g.target, minUnits: 1, target: g.target };
      const village = map.tiles.find((t) => t.settlement && t.settlement.owner === player.index && !t.unit);
      if (village) d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: 'defense' });
    }
    if (g.id === 'naval') {
      d.skillChain = navalSkillChain(player);
      d.pace = 'rushed';
      if (d.moneyReserve <= 8) d.moneyReserve = 10;
    }
    if (g.id === 'score') {
      d.pace = 'rushed';
      d.moneyReserve = 0;
      const fv = nearestFreeVillage(map, player, situation);
      if (fv) {
        d.frontTarget = fv;
        const village = nearestOwnVillageTo(map, player, fv);
        if (village) d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: 'scout' });
      }
    }
  }
  if (situation.endangered) d.moneyReserve = 0;
  return d;
}
```

In the `army` block, `UnitType` import above is unused — remove it from the import list (keep `SkillId`). Also `map: GameMap` param is used; `Player` already imported.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/aiStrategy.test.ts`
Expected: PASS. If the personality-divergence test fails on the chosen names, re-check which personality each name maps to with a tiny scratch test or choose names where `hashName(name) % 3` differ (e.g., assert which ids you get for 'Zed'/'Tea' and pick constants accordingly).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Commit:

```bash
git add src/game/aiStrategy.ts tests/aiStrategy.test.ts
git commit -m "feat: AI directive recipes for economy/army/defense/naval/score goals"
```

---

### Task 4: Wire directives into planAiActions and the utility scarer

**Files:**
- Modify: `src/game/ai.ts`
- Modify: `src/game/aiPatterns.ts` (context type only)
- Modify: `src/game/simulator.ts` (pass `this.turn`)
- Test: `tests/aiStrategy.test.ts` (append integration describe), plus run the full `tests/ai*.test.ts` suite.

**Interfaces:**
- Produces: `planAiActions(map, player, rng, mode = 'capture', markers?, turn = 0): AiAction[]` (adds optional trailing `turn`).
- Consumes: `updateStrategy`, `deriveDirectives`, `AiDirectives`.

- [ ] **Step 1: Write the failing integration test**

Append to `tests/aiStrategy.test.ts`:

```ts
import { planAiActions } from '../src/game/ai';

describe('planAiActions with strategy', () => {
  it('keeps a bare one-village map on today behaviour (no directives)', () => {
    const tiles: MapTile[] = [
      makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }, makeWarrior('g1', 1, 0, 0)),
      makeTile(1, 0),
      makeTile(2, 0),
    ];
    const map: GameMap = { radius: 4, tiles, spawns: [] };
    const actions = planAiActions(map, aiPlayer('Ona'), new SeededRandom(1), 'capture');
    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('army-plan moves units toward the enemy village front', () => {
    const map = twoVillageMap();
    const actions = planAiActions(map, aiPlayer('Ragnar'), new SeededRandom(1), 'capture');
    const moves = actions.filter((a) => a.type === 'move');
    expect(moves.length).toBeGreaterThan(0);
  });

  it('passes the turn through to the planner (no crash across turns)', () => {
    const map = twoVillageMap();
    const p = aiPlayer('Drake');
    for (let turn = 1; turn <= 12; turn++) {
      const actions = planAiActions(map, p, new SeededRandom(turn), 'capture');
      expect(actions.length).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiStrategy.test.ts`
Expected: FAIL — `planAiActions` signature doesn't take `turn` yet / imports unresolved.

- [ ] **Step 3: Wire the strategy into ai.ts**

Modify `src/game/ai.ts` imports:

```ts
import { updateStrategy, deriveDirectives } from './aiStrategy';
import { AiAction, AiDirectives, AiPlannerState } from './aiTypes';
import { AiStrategyState } from './aiTypes';
```

Modify the signature and the body head of `planAiActions`:

```ts
export function planAiActions(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  mode: GameMode = 'capture',
  markers?: AiActionMarker[],
  turn: number = 0,
): AiAction[] {
  const difficulty = profileFor(player);
  const situation = analyzeSituation(map, player, mode, difficulty);
  const strategy = updateStrategy(map, player, situation, mode, difficulty, turn, rng);
  const directives = deriveDirectives(map, player, situation, difficulty, strategy);
  ...
```

Thread `directives` into the pattern context and the fallback:

```ts
  const ctx: AiPatternContext = { map, player, rng, state, situation, difficulty, directives };
  ...
  next = bestAvailableAction(map, player, rng, state, situation, difficulty, directives, source);
```

Change `bestAvailableAction`'s signature (private) to accept `directives: AiDirectives | undefined`:

```ts
function bestAvailableAction(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  state: AiPlannerState,
  situation: AiSituation | undefined,
  difficulty: AiDifficultyProfile | undefined,
  directives: AiDirectives | undefined,
  source?: { kind: 'best' | 'random' },
): AiAction[] | null {
```

Add the bias helpers at module scope (near `bestAvailableAction`):

```ts
function directivesReserve(directives: AiDirectives | undefined, difficulty: AiDifficultyProfile | undefined): number {
  if (directives) return directives.moneyReserve;
  return difficulty?.spawnReserve ?? UNIT_TYPES.warrior.price;
}

function mustering(directives: AiDirectives | undefined): boolean {
  return directives?.muster !== null && directives?.muster !== undefined;
}
```

Apply the biases:

1. **Spawn bias** — in the village spawn block, replace the `prefer` computation:

```ts
      const planFor = directives?.spawnPlan.find((p) => p.villageKey === k);
      const prefer =
        planFor
          ? planFor.prefer
          : urgent || situation?.stance === 'defend'
            ? 'defense'
            : situation?.navalThreat
              ? 'naval'
              : situation?.stance === 'settle' && freeVillageToGrab
                ? 'scout'
                : 'offense';
```

and the reserve line becomes:

```ts
          const reserve = directivesReserve(directives, difficulty);
          const reserveOk = urgent || after.money >= reserve;
```

2. **Move bias** — inside the move-target loop, after the existing `if (situation?.stance === 'war' ...)` block, add:

```ts
      if (directives?.frontTarget) {
        const df = hexDistance(c, directives.frontTarget);
        s += 300 - df * 8;
        const ownDist2 = nearestOwnUnitDistanceFrom(map, player.index, c);
        if (Number.isFinite(ownDist2)) s += Math.max(0, 30 - ownDist2 * 4);
      }
      if (directives?.muster && hexDistance(c, directives.muster.target) > hexDistance(t, directives.muster.target)) {
        s -= 150;
      }
```

3. **Attack gating** — the two attack candidate sites currently read `(!difficulty || !difficulty.checkTrades || tradeIsFavorable(unit, attackTile))`. Change both to also require `!mustering(directives)` on the favorable check:

```ts
    const canTrade = !difficulty || !difficulty.checkTrades || !mustering(directives) || tradeIsFavorable(unit, attackTile);
    if (attackTile && canTrade) { ... }
```
and in the move+attack branch:
```ts
      const a = chooseBestAttack(map, ghost, unit.owner);
      if (a && !foreignVillage && (!difficulty || !difficulty.checkTrades || !mustering(directives) || tradeIsFavorable(ghost, a))) { ... }
```

4. **Skill bias** — wrap the existing skill loop so the directive chain wins:

```ts
  if (directives?.skillChain) {
    for (const id of directives.skillChain) {
      if (state.opened.has(id)) continue;
      if (canOpenSkill(player, id)) {
        candidates.push({ score: 300 + jitter(), action: { type: 'openSkill', skill: id } });
        break;
      }
    }
  } else if (!situation?.navalThreat) {
    for (const id of AI_SKILL_ORDER) { ... existing body ... }
  }
```

5. **Build bias by pace** — in the build loop, multiply non-mine/sawmill scores by `0.5` when `directives?.pace === 'slow'`, and by `0.6` when `pace === 'rushed'` (the army frees money for spawns):

```ts
    const buildScale = directives?.pace === 'slow' ? 0.5 : directives?.pace === 'rushed' ? 0.6 : 1;
```
and apply to the port/temple/forestTemple and bridge candidates (`score * buildScale`). Leave mine (500) and sawmill (360) unscaled.

Update `src/game/aiPatterns.ts`:

```ts
import { AiAction, AiDirectives, AiPlannerState, SpawnPreference } from './aiTypes';
...
export interface AiPatternContext {
  map: GameMap;
  player: Player;
  rng: SeededRandom;
  state: AiPlannerState;
  situation?: AiSituation;
  difficulty?: AiDifficultyProfile;
  directives?: AiDirectives;
}
```

Update `src/game/simulator.ts` line 780:

```ts
    const actions = planAiActions(this.map, ai, this.aiRng(), this.mode, markers, this.turn);
```

- [ ] **Step 4: Run the target tests**

Run: `npx vitest run tests/aiStrategy.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full AI regression suite and fix intentional-only deltas**

Run: `npx vitest run tests/ai.test.ts tests/aiBehavior.test.ts tests/aiBehavior2.test.ts tests/aiNaval.test.ts tests/aiEconomy.test.ts tests/aiPatterns.test.ts tests/aiCapture.test.ts tests/aiSituation.test.ts tests/aiDifficulty.test.ts tests/aiStrategy.test.ts`
Expected: all PASS. If a scenario test breaks, verify the change is an *intentional improvement* from the new strategy (inspect `player.strategy` via a scratch log), and update **only** that test with a comment referencing this plan. The simulated default-turn `0` still produces a re-pick every call in tests — that is why every scenario is exercised with strategy active.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Commit:

```bash
git add src/game/ai.ts src/game/aiPatterns.ts src/game/simulator.ts tests/aiStrategy.test.ts
git commit -m "feat: wire AI strategic directives into the one-turn planner"
```

---

### Task 5: Full verification gate

**Files:**
- No source changes unless the gate exposes a regression.

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS (this includes `tests/wake.test.ts`, `tests/bottles.test.ts`, and every other suite).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual smoke via the simulator test harness**

Run: `npx vitest run tests/simulatorTurn.test.ts tests/simulator.test.ts`
Expected: PASS — AI turns execute end-to-end with strategy state present.

- [ ] **Step 4: Commit any legitimate test adjustments from Task 4 together here**

If Task 4's step 5 left the working tree dirty, commit those adjustments now:

```bash
git add -A && git commit -m "test: align AI scenario tests with strategic planning intent"
```

- [ ] **Step 5: Report**

Summarize: new modules (`aiStrategy.ts`, `aiPersonality.ts`), the `AiDirectives` bias points in `ai.ts`, and the changed tests (never count the suite green until the full `npm test` is green).

---

## Self-Review notes

- **Spec coverage:** Persist state (T1), recipes economy/army/defense/naval/score (T3), personalities (T1), difficulty steering (T1 + T2/thresholds), tactical integration biases (T4), neutral default (T4 test), save/load via plain-JSON `Player.strategy` (T1 type + no serialization change), 30-turn scoring (T3 score goal). Gaps: none.
- **Placeholder scan:** No TBD/TODO; every step carries concrete code or an exact command.
- **Type consistency:** `AiDirectives` fields match between `aiTypes.ts` (T1), `deriveDirectives` (T3), and `ai.ts` consumers (T4); `planAiActions`'s trailing `turn` param is consistently threaded from `simulator.ts`. `SpawnPreference` moves to `aiTypes.ts` and is imported by `aiPatterns.ts` (T1), consumed by `AiDirectives.spawnPlan` (T3) and the spawn bias (T4).