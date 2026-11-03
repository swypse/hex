# AI Behavior + Difficulty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI a goal-driven intent layer (mode-aware stances, proactive village defense, never-passive missions, favorable-trade combat) and Easy / Normal / Hard difficulty levels over one shared brain, wired through Settings and the Single Player setup screen.

**Architecture:** Each AI turn computes a pure `AiSituation` (stance, per-village danger forecast, objectives, force comparison) from `(map, player, mode)`, then a difficulty profile modulates thresholds and mistake chance. The existing greedy planner loop and action executors stay; patterns consume the situation and the fallback move scoring becomes mission-aware. Difficulty flows via a `Player.difficulty` field persisted in snapshots.

**Tech Stack:** TypeScript, Vitest, existing game modules (`ai.ts`, `aiPatterns.ts`, `aiTypes.ts`, `simulator.ts`, `combat.ts`, `players.ts`, `storage/settings.ts`, Pixi UI screens).

## Global Constraints

- Run `npm run typecheck` and `npm test` before every commit; all existing tests must stay green.
- `AI_PATTERNS` in `aiPatterns.ts` must stay sorted by `priority` descending (a test asserts this).
- Default difficulty is `'normal'`; all existing callers/tests keep working without passing difficulty or mode.
- No stat, resource, or rule changes — decision logic only.
- Do not add code comments unless a `//` note explains an existing non-obvious line; match surrounding style.

---

### Task 1: Difficulty types and profiles

**Files:**
- Create: `src/game/aiDifficulty.ts`
- Test: `tests/aiDifficulty.test.ts`

**Interfaces:**
- Produces: `export type AiDifficulty = 'easy' | 'normal' | 'hard'`
- Produces: `export interface AiDifficultyProfile { mistakeChance: number; guardWindow: number; warRatio: number; checkTrades: boolean; spawnReserve: number }`
- Produces: `export const AI_DIFFICULTY_PROFILES: Record<AiDifficulty, AiDifficultyProfile>`
- Produces: `export const DEFAULT_AI_DIFFICULTY: AiDifficulty = 'normal'`
- Produces: `export function difficultyFor(player: { difficulty?: AiDifficulty }): AiDifficulty`
- Produces: `export function profileFor(player: { difficulty?: AiDifficulty }): AiDifficultyProfile`

- [ ] **Step 1: Write the failing test**

`tests/aiDifficulty.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY_PROFILES, DEFAULT_AI_DIFFICULTY, difficultyFor, profileFor } from '../src/game/aiDifficulty';

describe('AI difficulty', () => {
  it('defaults to normal', () => {
    expect(DEFAULT_AI_DIFFICULTY).toBe('normal');
    expect(difficultyFor({})).toBe('normal');
    expect(difficultyFor({ difficulty: undefined })).toBe('normal');
  });

  it('returns the stored difficulty', () => {
    expect(difficultyFor({ difficulty: 'easy' })).toBe('easy');
    expect(difficultyFor({ difficulty: 'hard' })).toBe('hard');
  });

  it('easy makes mistakes, hard defends earlier and presses war', () => {
    const easy = AI_DIFFICULTY_PROFILES.easy;
    const normal = AI_DIFFICULTY_PROFILES.normal;
    const hard = AI_DIFFICULTY_PROFILES.hard;
    expect(easy.mistakeChance).toBeGreaterThan(0);
    expect(normal.mistakeChance).toBe(0);
    expect(hard.mistakeChance).toBe(0);
    expect(easy.guardWindow).toBeLessThan(normal.guardWindow);
    expect(normal.guardWindow).toBeLessThan(hard.guardWindow);
    expect(hard.warRatio).toBeLessThan(normal.warRatio);
    expect(normal.warRatio).toBeLessThan(easy.warRatio);
    expect(easy.checkTrades).toBe(false);
    expect(normal.checkTrades).toBe(true);
    expect(hard.checkTrades).toBe(true);
    expect(profileFor({ difficulty: 'hard' })).toBe(AI_DIFFICULTY_PROFILES.hard);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiDifficulty.test.ts`
Expected: FAIL — module `../src/game/aiDifficulty` not found.

- [ ] **Step 3: Write the implementation**

`src/game/aiDifficulty.ts`:

```ts
export type AiDifficulty = 'easy' | 'normal' | 'hard';

export interface AiDifficultyProfile {
  /** Probability (0..1) that a planned action is replaced by a random one. */
  mistakeChance: number;
  /** How many enemy turns of advance warning trigger village defense. */
  guardWindow: number;
  /** Minimum ownPower / enemyPower ratio required to adopt the war stance. */
  warRatio: number;
  /** Whether single attacks are gated by the favorable-trade check. */
  checkTrades: boolean;
  /** Money kept in reserve before the AI will spend on a spawn. */
  spawnReserve: number;
}

export const DEFAULT_AI_DIFFICULTY: AiDifficulty = 'normal';

export const AI_DIFFICULTY_PROFILES: Record<AiDifficulty, AiDifficultyProfile> = {
  easy: { mistakeChance: 0.25, guardWindow: 1, warRatio: 2.5, checkTrades: false, spawnReserve: 8 },
  normal: { mistakeChance: 0, guardWindow: 2, warRatio: 1.5, checkTrades: true, spawnReserve: 4 },
  hard: { mistakeChance: 0, guardWindow: 3, warRatio: 1.0, checkTrades: true, spawnReserve: 0 },
};

export function difficultyFor(player: { difficulty?: AiDifficulty }): AiDifficulty {
  return player.difficulty ?? DEFAULT_AI_DIFFICULTY;
}

export function profileFor(player: { difficulty?: AiDifficulty }): AiDifficultyProfile {
  return AI_DIFFICULTY_PROFILES[difficultyFor(player)];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aiDifficulty.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/aiDifficulty.ts tests/aiDifficulty.test.ts
git commit -m "feat: AI difficulty types and profiles (easy/normal/hard)"
```

---

### Task 2: Situation analysis (`aiSituation.ts`)

**Files:**
- Create: `src/game/aiSituation.ts`
- Test: `tests/aiSituation.test.ts`

**Interfaces:**
- Consumes: `AiDifficultyProfile` from `./aiDifficulty` (Task 1).
- Produces:
  `export type AiStance = 'settle' | 'defend' | 'war'`
  `export interface EnemyUnit { tile: MapTile; unit: Unit }`
  `export interface VillageDanger { village: MapTile; enemyTurns: number }`
  `export interface FreeVillageTarget { village: MapTile; distance: number }`
  `export interface AiSituation { stance: AiStance; enemies: EnemyUnit[]; dangers: VillageDanger[]; endangered: boolean; frontTarget: MapTile | null; freeVillages: FreeVillageTarget[]; huntTarget: MapTile | null; ownPower: number; enemyPower: number }`
  `export function visibleEnemies(map: GameMap, playerIndex: number): EnemyUnit[]`
  `export function turnsToOccupy(from: MapTile, to: MapTile, mover: Unit): number`
  `export function analyzeSituation(map: GameMap, player: Player, mode: GameMode, profile: AiDifficultyProfile): AiSituation`

- [ ] **Step 1: Write the failing tests**

`tests/aiSituation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile } from '../src/game/mapGen';
import { Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { Unit, UNIT_MOVEMENT, UNIT_TYPES } from '../src/game/units';
import { TileType } from '../src/game/tileTypes';
import { AI_DIFFICULTY_PROFILES } from '../src/game/aiDifficulty';
import { analyzeSituation, visibleEnemies, turnsToOccupy } from '../src/game/aiSituation';

function tile(q: number, r: number, opts: Partial<MapTile> = {}): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement: null, building: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0, 1], ...opts };
}

function unit(id: string, owner: number, type: keyof typeof UNIT_TYPES, q: number, r: number): Unit {
  return { id, owner, type, q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: UNIT_TYPES[type].maxHp, attack: UNIT_TYPES[type].attack, attackDistance: UNIT_TYPES[type].attackDistance, defence: UNIT_TYPES[type].defence, spawnVillage: null };
}

function player(index: number): Player {
  return { index, tribe: Tribe.Villagers, isHuman: false, name: 'AI', resources: { wood: 5, stone: 5, money: 100, ore: 5 }, score: 0, kills: 0, skills: [], isActive: true };
}

describe('aiSituation', () => {
  it('visibleEnemies returns only explored non-own units', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { unit: unit('a', 1, 'warrior', 0, 0) }),
      tile(1, 0, { unit: unit('e', 0, 'warrior', 1, 0) }),
    );
    const foggy = tile(2, 0, { unit: unit('fog', 0, 'warrior', 2, 0) });
    foggy.exploredBy = [0];
    map.tiles.push(foggy);
    const enemies = visibleEnemies(map, 1);
    expect(enemies.map((e) => e.unit.id)).toEqual(['e']);
  });

  it('turnsToOccupy uses the mover movement', () => {
    const from = tile(0, 0);
    const to = tile(4, 0);
    const rider = unit('r', 0, 'rider', 0, 0); // movement 4
    const warrior = unit('w', 0, 'warrior', 0, 0); // movement 1
    expect(turnsToOccupy(from, to, rider)).toBe(1);
    expect(turnsToOccupy(from, to, warrior)).toBe(4);
  });

  it('is in defend stance when an empty own village is endangered', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { settlement: { owner: 1, level: 1, captureReady: false }, ownedBy: 1 }),
      tile(2, 0, { unit: unit('e', 0, 'rider', 2, 0) }), // reaches the village in 1 turn (movement 4)
    );
    const s = analyzeSituation(map, player(1), 'capture', AI_DIFFICULTY_PROFILES.normal);
    expect(s.stance).toBe('defend');
    expect(s.endangered).toBe(true);
    expect(s.dangers.some((d) => d.village.q === 0 && d.village.r === 0)).toBe(true);
  });

  it('goes to war in capture mode when strong enough and an enemy village is explored', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { settlement: { owner: 1, level: 1, captureReady: false }, unit: unit('k1', 1, 'knight', 0, 0), ownedBy: 1 }),
      tile(1, 0, { unit: unit('k2', 1, 'knight', 1, 0) }),
      tile(2, 0, { unit: unit('k3', 1, 'knight', 2, 0) }),
      tile(5, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
    );
    const s = analyzeSituation(map, player(1), 'capture', AI_DIFFICULTY_PROFILES.normal);
    expect(s.stance).toBe('war');
    expect(s.frontTarget).not.toBeNull();
    expect(s.frontTarget!.q).toBe(5);
  });

  it('stays in settle stance in 30-turn mode even when an enemy village is explored', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { settlement: { owner: 1, level: 1, captureReady: false }, unit: unit('k1', 1, 'knight', 0, 0), ownedBy: 1 }),
      tile(1, 0, { unit: unit('k2', 1, 'knight', 1, 0) }),
      tile(2, 0, { unit: unit('k3', 1, 'knight', 2, 0) }),
      tile(5, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
    );
    const s = analyzeSituation(map, player(1), 'turns30', AI_DIFFICULTY_PROFILES.normal);
    expect(s.stance).toBe('settle');
    expect(s.frontTarget).toBeNull();
  });

  it('easy AI stays out of war until it has a bigger advantage', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    // Own power 200 (4 knights x 50 damage) vs enemy power 100 (2 knights x 50).
    // Normal warRatio 1.5: 200 >= 150 -> war. Easy warRatio 2.5: 200 < 250 -> settle.
    map.tiles.push(
      tile(0, 0, { settlement: { owner: 1, level: 1, captureReady: false }, unit: unit('k1', 1, 'knight', 0, 0), ownedBy: 1 }),
      tile(1, 0, { unit: unit('k2', 1, 'knight', 1, 0) }),
      tile(2, 0, { unit: unit('k3', 1, 'knight', 2, 0) }),
      tile(3, 0, { unit: unit('k4', 1, 'knight', 3, 0) }),
      tile(5, 0, { settlement: { owner: 0, level: 1, captureReady: false }, unit: unit('e1', 0, 'knight', 5, 0), ownedBy: 0 }),
      tile(6, 0, { unit: unit('e2', 0, 'knight', 6, 0) }),
    );
    const normal = analyzeSituation(map, player(1), 'capture', AI_DIFFICULTY_PROFILES.normal);
    const easy = analyzeSituation(map, player(1), 'capture', AI_DIFFICULTY_PROFILES.easy);
    expect(normal.stance).toBe('war');
    expect(easy.stance).toBe('settle');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/aiSituation.test.ts`
Expected: FAIL — module `../src/game/aiSituation` not found.

- [ ] **Step 3: Write the implementation**

`src/game/aiSituation.ts`:

```ts
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { GameMode } from './gameMode';
import { AiDifficultyProfile } from './aiDifficulty';
import { isExploredFor } from './explore';
import { hexDistance } from './hex';
import { shipMovement } from './ship';
import { UNIT_MOVEMENT, Unit, UnitType } from './units';
import { attackDamage } from './combat';

export type AiStance = 'settle' | 'defend' | 'war';

export interface EnemyUnit {
  tile: MapTile;
  unit: Unit;
}

export interface VillageDanger {
  village: MapTile;
  /** Smallest number of enemy turns before an enemy can occupy the village. */
  enemyTurns: number;
}

export interface FreeVillageTarget {
  village: MapTile;
  distance: number;
}

export interface AiSituation {
  stance: AiStance;
  enemies: EnemyUnit[];
  /** Empty own villages reachable within the guard window. */
  dangers: VillageDanger[];
  endangered: boolean;
  frontTarget: MapTile | null;
  freeVillages: FreeVillageTarget[];
  huntTarget: MapTile | null;
  ownPower: number;
  enemyPower: number;
}

const MELEE_TYPES = new Set<UnitType>(['warrior', 'rider', 'swordsman', 'shield', 'knight']);

export function isMelee(unit: Unit): boolean {
  return MELEE_TYPES.has(unit.type);
}

export function movementOf(unit: Unit): number {
  return unit.shipLevel !== undefined ? shipMovement(unit) : UNIT_MOVEMENT[unit.type];
}

export function turnsToOccupy(from: MapTile, to: MapTile, mover: Unit): number {
  return Math.max(1, Math.ceil(hexDistance(from, to) / movementOf(mover)));
}

export function visibleEnemies(map: GameMap, playerIndex: number): EnemyUnit[] {
  const out: EnemyUnit[] = [];
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === playerIndex) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    out.push({ tile: t, unit: t.unit });
  }
  return out;
}

function enemyPower(map: GameMap, playerIndex: number): number {
  let total = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === playerIndex || !isExploredFor(t, playerIndex)) continue;
    total += attackDamage(t.unit);
  }
  return total;
}

function ownPower(map: GameMap, playerIndex: number): number {
  let total = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner !== playerIndex) continue;
    total += attackDamage(t.unit);
  }
  return total;
}

function ownUnitCount(map: GameMap, playerIndex: number): number {
  let n = 0;
  for (const t of map.tiles) if (t.unit && t.unit.owner === playerIndex) n += 1;
  return n;
}

function ownVillageDangers(map: GameMap, playerIndex: number, enemies: EnemyUnit[], guardWindow: number): VillageDanger[] {
  const dangers: VillageDanger[] = [];
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== playerIndex) continue;
    if (t.unit && t.unit.owner === playerIndex) continue;
    let minTurns = Infinity;
    for (const e of enemies) {
      if (e.unit.owner < 0) continue; // pirates do not capture villages
      const turns = turnsToOccupy(e.tile, t, e.unit);
      if (turns < minTurns) minTurns = turns;
    }
    if (minTurns <= guardWindow) dangers.push({ village: t, enemyTurns: minTurns });
  }
  return dangers;
}

function nearestEnemyVillage(map: GameMap, playerIndex: number): MapTile | null {
  let best: MapTile | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === playerIndex || t.settlement.owner === null) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    let dist = hexDistance({ q: 0, r: 0 }, t);
    for (const u of map.tiles) {
      if (u.unit && u.unit.owner === playerIndex) {
        const d = hexDistance(u, t);
        if (d < dist) dist = d;
      }
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

function freeVillages(map: GameMap, playerIndex: number): FreeVillageTarget[] {
  const out: FreeVillageTarget[] = [];
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== null) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    let minDist = Infinity;
    for (const u of map.tiles) {
      if (!u.unit || u.unit.owner !== playerIndex) continue;
      const d = hexDistance(u, t);
      if (d < minDist) minDist = d;
    }
    out.push({ village: t, distance: minDist });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

export function analyzeSituation(
  map: GameMap,
  player: Player,
  mode: GameMode,
  profile: AiDifficultyProfile,
): AiSituation {
  const enemies = visibleEnemies(map, player.index);
  const dangers = ownVillageDangers(map, player.index, enemies, profile.guardWindow);
  const endangered = dangers.length > 0;
  const enemyOnOwnVillage = enemies.some(
    (e) => e.tile.settlement && e.tile.settlement.owner === player.index,
  );

  const pow = ownPower(map, player.index);
  const epow = enemyPower(map, player.index);
  const enemyVillage = nearestEnemyVillage(map, player.index);
  const units = ownUnitCount(map, player.index);

  let stance: AiStance = 'settle';
  if (enemyOnOwnVillage || endangered) {
    stance = 'defend';
  } else if (mode === 'capture' && enemyVillage && units >= 3 && pow >= epow * profile.warRatio) {
    stance = 'war';
  }

  let huntTarget: MapTile | null = null;
  let bestHuntDist = Infinity;
  for (const u of map.tiles) {
    if (!u.unit || u.unit.owner !== player.index) continue;
    for (const e of enemies) {
      const d = hexDistance(u, e.tile);
      if (d < bestHuntDist) {
        bestHuntDist = d;
        huntTarget = e.tile;
      }
    }
  }

  return {
    stance,
    enemies,
    dangers,
    endangered,
    frontTarget: stance === 'war' ? enemyVillage : null,
    freeVillages: freeVillages(map, player.index),
    huntTarget,
    ownPower: pow,
    enemyPower: epow,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aiSituation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/aiSituation.ts tests/aiSituation.test.ts
git commit -m "feat: AI situation analysis (stances, village danger, objectives)"
```

---

### Task 3: Thread difficulty, mode and situation through the planner

**Files:**
- Modify: `src/game/aiPatterns.ts`
- Modify: `src/game/ai.ts`
- Modify: `src/game/simulator.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `analyzeSituation`, `AiSituation` (Task 2); `profileFor`, `AiDifficultyProfile` (Task 1).
- Produces:
  - `AiPatternContext` gains optional `situation?: AiSituation` and `difficulty?: AiDifficultyProfile`.
  - `planAiActions(map: GameMap, player: Player, rng: SeededRandom, mode: GameMode = 'capture'): AiAction[]`.
  - `bestAvailableAction(map, player, rng, state, situation: AiSituation | undefined, difficulty: AiDifficultyProfile | undefined): AiAction[] | null`.
  - `AiPlannerState` gains no new fields (unchanged).

- [ ] **Step 1: Write a compile-check test first**

Add to `tests/ai.test.ts` a test that calls the planner with an explicit mode to lock the new signature:

```ts
it('accepts an explicit game mode and still plans', () => {
  const actions = planAiActions(makeAiMap(), aiPlayer(), new SeededRandom(1), 'capture');
  expect(Array.isArray(actions)).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails to compile**

Run: `npx vitest run tests/ai.test.ts`
Expected: FAIL — TypeScript error: `planAiActions` takes 3 arguments.

- [ ] **Step 3: Modify `src/game/aiPatterns.ts` context interface**

Replace the `AiPatternContext` interface (lines 14-19) with:

```ts
import { AiDifficultyProfile } from './aiDifficulty';
import { AiSituation } from './aiSituation';

export interface AiPatternContext {
  map: GameMap;
  player: Player;
  rng: SeededRandom;
  state: AiPlannerState;
  situation?: AiSituation;
  difficulty?: AiDifficultyProfile;
}
```

(Add the two imports to the existing import block at the top of `aiPatterns.ts`.)

- [ ] **Step 4: Modify `src/game/ai.ts`**

Add imports for `GameMode`, `analyzeSituation`, and `profileFor`:

```ts
import { GameMode } from './gameMode';
import { AiSituation, analyzeSituation } from './aiSituation';
import { AiDifficultyProfile, profileFor } from './aiDifficulty';
```

Replace the `bestAvailableAction` signature (line 21-26) with:

```ts
function bestAvailableAction(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  state: AiPlannerState,
  situation: AiSituation | undefined,
  difficulty: AiDifficultyProfile | undefined,
): AiAction[] | null {
```

(The body is unchanged in this task; it will be extended in Task 7.)

Replace the `planAiActions` function (lines 192-221) with:

```ts
export function planAiActions(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  mode: GameMode = 'capture',
): AiAction[] {
  const difficulty = profileFor(player);
  const situation = analyzeSituation(map, player, mode, difficulty);
  const state: AiPlannerState = {
    moved: new Set(),
    acted: new Set(),
    upgraded: new Set(),
    spawned: new Set(),
    built: new Set(),
    opened: new Set(),
    occupied: new Set(),
  };
  const actions: AiAction[] = [];
  for (let i = 0; i < MAX_PLAN_STEPS; i++) {
    const ctx: AiPatternContext = { map, player, rng, state, situation, difficulty };
    let next: AiAction[] | null = null;
    for (const pattern of AI_PATTERNS) {
      next = pattern.evaluate(ctx);
      if (next) break;
    }
    if (!next) next = bestAvailableAction(map, player, rng, state, situation, difficulty);
    if (!next) break;
    for (const a of next) {
      actions.push(a);
      markUsed(state, a);
    }
  }
  return actions;
}
```

- [ ] **Step 5: Update `src/game/simulator.ts` AI turn call**

Find `runAiTurn` (line ~560-594). Change the planner call:

```ts
const actions = planAiActions(this.map, ai, this.mode, this.aiRng());
```

(imports are unchanged — `planAiActions` is already imported.)

- [ ] **Step 6: Run the full suite to confirm no behavior change**

Run: `npm test`
Expected: PASS (all existing tests, including `tests/aiPatterns.test.ts`, still green — `situation`/`difficulty` are optional on the context).

- [ ] **Step 7: Commit**

```bash
git add src/game/aiTypes.ts src/game/aiPatterns.ts src/game/ai.ts src/game/simulator.ts tests/ai.test.ts
git commit -m "feat: thread game mode, difficulty and situation through the AI planner"
```

---

### Task 4: Favorable-trade combat helper

**Files:**
- Modify: `src/game/combat.ts`
- Test: `tests/combat.test.ts`

**Interfaces:**
- Consumes: existing `attackDamage`, `counterAttackDamage`, `hexDistance`, `shipAttackDistance`.
- Produces: `export function tradeIsFavorable(attacker: Unit, targetTile: MapTile): boolean`

- [ ] **Step 1: Write the failing tests**

Append to `tests/combat.test.ts`:

```ts
describe('tradeIsFavorable', () => {
  function unitOf(id: string, type: keyof typeof UNIT_TYPES, owner: number, q: number, r: number): Unit {
    return { id, owner, type, q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: UNIT_TYPES[type].maxHp, attack: UNIT_TYPES[type].attack, attackDistance: UNIT_TYPES[type].attackDistance, defence: UNIT_TYPES[type].defence, spawnVillage: null };
  }
  function tileWith(q: number, r: number, u: Unit): MapTile {
    return { q, r, terrain: TileType.GrasslandLand, settlement: null, building: null, unit: u, ownedBy: null, claimedByVillage: null, exploredBy: [0, 1] };
  }

  it('returns true for a kill', () => {
    const knight = unitOf('k', 'knight', 0, 0, 0); // damage 50
    const weak = unitOf('w', 'warrior', 1, 1, 0);
    weak.hp = 10;
    expect(tradeIsFavorable(knight, tileWith(1, 0, weak))).toBe(true);
  });

  it('returns true when the target cannot counter', () => {
    const archer = unitOf('a', 'archer', 0, 0, 0); // range 2, damage 20
    const warrior = unitOf('w', 'warrior', 1, 2, 0); // range 1 -> cannot counter at distance 2
    expect(tradeIsFavorable(archer, tileWith(2, 0, warrior))).toBe(true);
  });

  it('returns false for a losing melee trade', () => {
    const warrior = unitOf('w', 'warrior', 0, 0, 0); // damage 20
    const swordsman = unitOf('s', 'swordsman', 1, 1, 0); // counter ~40
    expect(tradeIsFavorable(warrior, tileWith(1, 0, swordsman))).toBe(false);
  });

  it('returns true for an even melee trade', () => {
    const a = unitOf('a', 'warrior', 0, 0, 0);
    const b = unitOf('b', 'warrior', 1, 1, 0);
    expect(tradeIsFavorable(a, tileWith(1, 0, b))).toBe(true);
  });
});
```

Add these names to the top-of-file imports of `tests/combat.test.ts` (merge into any existing import statements from the same modules — do not import the same name twice):

```ts
import { TileType } from '../src/game/tileTypes';
import { UNIT_TYPES, Unit } from '../src/game/units';
import { tradeIsFavorable } from '../src/game/combat';
import { MapTile } from '../src/game/mapGen';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/combat.test.ts`
Expected: FAIL — `tradeIsFavorable` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/game/combat.ts` (after `chooseBestAttack`):

```ts
export function tradeIsFavorable(attacker: Unit, targetTile: MapTile): boolean {
  const target = targetTile.unit;
  if (!target) return true;
  if (attackDamage(attacker) >= target.hp) return true;
  const dist = hexDistance({ q: attacker.q, r: attacker.r }, { q: target.q, r: target.r });
  if (dist > shipAttackDistance(target)) return true; // no counter available
  return attackDamage(attacker) >= counterAttackDamage(target);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/combat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.ts tests/combat.test.ts
git commit -m "feat: favorable-trade combat check for AI"
```

---

### Task 5: Forecast garrison pattern (`reinforce-endangered-village`)

**Files:**
- Modify: `src/game/aiPatterns.ts`
- Test: `tests/aiPatterns.test.ts`

**Interfaces:**
- Consumes: `situation?: AiSituation` on `AiPatternContext` (Task 3); `AiSituation.dangers` (Task 2).
- Produces: a new pattern entry in `AI_PATTERNS` with `id: 'reinforce-endangered-village'` and `priority: 120`, inserted between `collect-bonus` (125) and `capture-push` (110).

- [ ] **Step 1: Write the failing tests**

Append to `tests/aiPatterns.test.ts` (the file already imports `analyzeSituation`? No — add imports):

```ts
import { analyzeSituation } from '../src/game/aiSituation';
import { AI_DIFFICULTY_PROFILES } from '../src/game/aiDifficulty';
import { GameMode } from '../src/game/gameMode';
```

And append to the describe block:

```ts
function situCtx(map: GameMap, player: Player, mode: GameMode = 'capture') {
  const base = ctx(map, player, new SeededRandom(1));
  return {
    ...base,
    situation: analyzeSituation(map, player, mode, AI_DIFFICULTY_PROFILES.normal),
    difficulty: AI_DIFFICULTY_PROFILES.normal,
  };
}

it('reinforce-endangered-village sends the closest unit to an endangered empty village', () => {
  const map: GameMap = { radius: 4, tiles: [], spawns: [] };
  map.tiles.push(
    tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
    tile(1, 0, null, warrior('ai1', 1, 1, 0)),
    tile(5, 0, null, rider('enemy', 0, 5, 0)), // reaches the village in 2 turns (movement 4, distance 5) <= guard 2
  );
  const actions = findPattern('reinforce-endangered-village').evaluate(situCtx(map, player(100)));
  expect(actions).not.toBeNull();
  expect(actions![0]!.type).toBe('move');
  if (actions![0]!.type === 'move') {
    expect(actions![0]!.unitId).toBe('ai1');
    expect(actions![0]!.q).toBe(0);
    expect(actions![0]!.r).toBe(0);
  }
});

it('reinforce-endangered-village does nothing when no enemy threatens the village', () => {
  const map: GameMap = { radius: 4, tiles: [], spawns: [] };
  map.tiles.push(
    tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
    tile(1, 0, null, warrior('ai1', 1, 1, 0)),
  );
  expect(findPattern('reinforce-endangered-village').evaluate(situCtx(map, player(100)))).toBeNull();
});
```

The enemy rider at distance 5 needs `ceil(5 / 4) = 2` enemy turns to occupy the village (within the normal 2-turn guard), while the AI warrior adjacent to the village can step onto it now. Add this rider helper next to the existing builders (both use the current x10 HP scale):

```ts
function rider(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'rider', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 40, attack: 20, attackDistance: 1, defence: 5, spawnVillage: null };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/aiPatterns.test.ts`
Expected: FAIL — pattern id `reinforce-endangered-village` not found.

- [ ] **Step 3: Write the pattern**

Inside `src/game/aiPatterns.ts`, import `UNIT_MOVEMENT` is already imported (line 6). Add this pattern to `AI_PATTERNS` between the `collect-bonus` and `capture-push` entries:

```ts
{
  id: 'reinforce-endangered-village',
  priority: 120,
  evaluate({ map, player, state, situation }): AiAction[] | null {
    if (!situation || situation.stance !== 'defend') return null;
    const canClimb = hasSkill(player, 'climbing');
    const canDock = hasSkill(player, 'navigation');
    let best: { unit: Unit; step: MapTile; villageKey: string; score: number } | null = null;
    for (const d of situation.dangers) {
      const v = d.village;
      const vk = key(v.q, v.r);
      if (state.occupied.has(vk) || state.spawned.has(vk)) continue;
      if (v.unit && v.unit.owner === player.index) continue;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner === player.index) continue;
        if (hexDistance(t, v) > d.enemyTurns * UNIT_MOVEMENT[unit.type]) continue;
        const reach = reachableTargets(map, unit, undefined, canClimb, canDock, player.index).filter(
          (c) =>
            !state.occupied.has(key(c.q, c.r)) &&
            ((c.q === v.q && c.r === v.r) || !(c.settlement && c.settlement.owner === player.index)),
        );
        let bestStep: MapTile | null = null;
        let bestStepDist = Infinity;
        for (const c of reach) {
          const dist = hexDistance(c, v);
          if (dist < bestStepDist) {
            bestStepDist = dist;
            bestStep = c;
          }
        }
        if (!bestStep) continue;
        const score = hexDistance(t, v);
        if (!best || score < best.score) best = { unit, step: bestStep, villageKey: vk, score };
      }
    }
    if (!best) return null;
    state.occupied.add(best.villageKey);
    return [{ type: 'move', unitId: best.unit.id, q: best.step.q, r: best.step.r }];
  },
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aiPatterns.test.ts`
Expected: PASS (both the new tests and the existing priority-order test).

- [ ] **Step 5: Commit**

```bash
git add src/game/aiPatterns.ts tests/aiPatterns.test.ts
git commit -m "feat: AI forecasts empty-village threats and reinforces by garrisoning"
```

---

### Task 6: Hunt pattern (`hunt-idle-enemy`)

**Files:**
- Modify: `src/game/aiPatterns.ts`
- Test: `tests/aiPatterns.test.ts`

**Interfaces:**
- Consumes: `situation?: AiSituation`, `difficulty?: AiDifficultyProfile` on context; `isMelee`/`movementOf` re-exports — import what you need from `./aiSituation` (`isMelee`, `turnsToOccupy` not needed here); `tradeIsFavorable` from `./combat`.
- Produces: pattern `id: 'hunt-idle-enemy'`, `priority: 78`, inserted between `archer-kite` (80) and `explore-frontier` (75).

- [ ] **Step 1: Write the failing tests**

Append to `tests/aiPatterns.test.ts`:

```ts
function huntWorthyMap() {
  const map: GameMap = { radius: 4, tiles: [], spawns: [] };
  map.tiles.push(
    tile(0, 0, null, warrior('ai1', 1, 0, 0)),
    tile(1, 0),
    tile(2, 0),
    tile(3, 0, null, warrior('enemy', 0, 3, 0)),
  );
  return map;
}

it('hunt-idle-enemy sends a melee unit toward a visible enemy', () => {
  const actions = findPattern('hunt-idle-enemy').evaluate(situCtx(huntWorthyMap(), player(100)));
  expect(actions).not.toBeNull();
  expect(actions![0]!.type).toBe('move');
  if (actions![0]!.type === 'move') {
    expect(actions![0]!.q).toBe(1);
    expect(actions![0]!.r).toBe(0);
  }
});

it('hunt-idle-enemy returns null when no enemy is visible', () => {
  const map: GameMap = { radius: 4, tiles: [], spawns: [] };
  map.tiles.push(tile(0, 0, null, warrior('ai1', 1, 0, 0)), tile(1, 0));
  expect(findPattern('hunt-idle-enemy').evaluate(situCtx(map, player(100)))).toBeNull();
});

it('hunt-idle-enemy attacks a killable enemy in range', () => {
  const map: GameMap = { radius: 4, tiles: [], spawns: [] };
  map.tiles.push(
    tile(0, 0, null, warrior('ai1', 1, 0, 0)),
    tile(1, 0, null, warrior('enemy', 0, 1, 0, 5)),
  );
  const actions = findPattern('hunt-idle-enemy').evaluate(situCtx(map, player(100)));
  expect(actions).not.toBeNull();
  expect(actions!.some((a) => a.type === 'attack')).toBe(true);
});
```

(If `warrior(...)` in this test file sets full hp 50 and attack 20, a target at hp 5 is killable; adjust the hp argument so `attackDamage(unit) >= target.hp` holds.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/aiPatterns.test.ts`
Expected: FAIL — pattern id `hunt-idle-enemy` not found.

- [ ] **Step 3: Write the pattern**

Add imports to `aiPatterns.ts`: `isMelee` from `./aiSituation` and `tradeIsFavorable` from `./combat` (extend the existing `combat` import).

Add to `AI_PATTERNS` between `archer-kite` and `explore-frontier`:

```ts
{
  id: 'hunt-idle-enemy',
  priority: 78,
  evaluate({ map, player, state, situation, difficulty }): AiAction[] | null {
    if (!situation || situation.enemies.length === 0) return null;
    if (situation.endangered && situation.stance === 'defend') return null;
    const canClimb = hasSkill(player, 'climbing');
    const canDock = hasSkill(player, 'navigation');
    let best: { action: AiAction; unitId: string; score: number } | null = null;
    for (const t of map.tiles) {
      const unit = t.unit;
      if (!unit || unit.owner !== player.index) continue;
      if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
      if (t.settlement && t.settlement.owner === player.index) continue;
      const melee = isMelee(unit);
      for (const e of situation.enemies) {
        const enemyTile = e.tile;
        if (!enemyTile.unit || enemyTile.unit.owner === player.index) continue;
        const canStrike = attackableTargets(map, unit, player.index).some(
          (a) => a.q === enemyTile.q && a.r === enemyTile.r,
        );
        if (canStrike) {
          const kills = attackDamage(unit) >= enemyTile.unit.hp;
          const ok = kills || !difficulty || !difficulty.checkTrades || tradeIsFavorable(map, unit, enemyTile);
          if (!ok) continue;
          const score = (kills ? 500 : 300) - hexDistance(t, enemyTile);
          if (!best || score > best.score) {
            best = { action: { type: 'attack', unitId: unit.id, q: enemyTile.q, r: enemyTile.r }, unitId: unit.id, score };
          }
          continue;
        }
        if (!melee) continue;
        const targetHp = enemyTile.unit.hp;
        const canKill = attackDamage(unit) >= targetHp;
        const notTougher = UNIT_TYPES[enemyTile.unit.type].maxHp <= UNIT_TYPES[unit.type].maxHp;
        if (!canKill && !notTougher) continue;
        const startDist = hexDistance(t, enemyTile);
        for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement && c.settlement.owner === player.index) continue;
          const nd = hexDistance(c, enemyTile);
          if (nd >= startDist) continue;
          const score = 200 - nd * 10 - hexDistance(t, c);
          if (!best || score > best.score) {
            best = { action: { type: 'move', unitId: unit.id, q: c.q, r: c.r }, unitId: unit.id, score };
          }
        }
      }
    }
    if (!best) return null;
    return [best.action];
  },
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aiPatterns.test.ts`
Expected: PASS. Also run the whole suite — hunting may change some planner outputs; if an existing test flakes, inspect and adjust only that test's expectations if they now conflict with intended behavior.

- [ ] **Step 5: Commit**

```bash
git add src/game/aiPatterns.ts tests/aiPatterns.test.ts
git commit -m "feat: AI hunts visible enemies so units never sit passive"
```

---

### Task 7: Mission-aware fallback (front cohesion, economy, trade gating, mistakes)

**Files:**
- Modify: `src/game/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `bestAvailableAction(map, player, rng, state, situation, difficulty)` (Task 3 signature); `tradeIsFavorable` (Task 4); `AI_DIFFICULTY_PROFILES` via `difficulty`.
- Produces: behavior changes only.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ai.test.ts`:

```ts
it('marches toward the enemy village front in war stance', () => {
  const map: GameMap = { radius: 4, tiles: [], spawns: [] };
  // AI owns a village far away + three units; enemy village at (5,0) is empty.
  map.tiles.push(
    makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }, makeWarrior('g1', 1, 0, 0)),
    makeTile(0, 1, null, null, makeWarrior('g2', 1, 0, 1)),
    makeTile(0, -1, null, null, makeWarrior('g3', 1, 0, -1)),
    makeTile(1, 0),
    makeTile(2, 0),
    makeTile(3, 0),
    makeTile(4, 0),
    makeTile(5, 0, 0, { owner: 0, level: 1, captureReady: false }),
  );
  const all = planSeeds(map, aiPlayer(), 20);
  const moves = all.filter((a) => a.type === 'move');
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.some((m) => m.type === 'move' && m.q > 0)).toBe(true);
});
```

The `.some(m.q > 0)` assertion checks that units actually step toward the +x front instead of idling; per-step jitter can pick a sideways neighbour occasionally, so we assert the march begins rather than every step's exact axis.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ai.test.ts`
Expected: the new test FAILS (units do not yet march toward the front; they may idle or scatter).

- [ ] **Step 3: Add trade gating, economy and front cohesion in `ai.ts`**

Import `tradeIsFavorable` (extend the existing `./combat` import in `ai.ts`):

```ts
import { chooseBestAttack, tradeIsFavorable } from './combat';
```

**3a. Gate the direct attack candidate** (the `attackTile` block ~line 69):

```ts
const attackTile = chooseBestAttack(map, unit, unit.owner);
if (attackTile && (!difficulty || !difficulty.checkTrades || tradeIsFavorable(map, unit, attackTile))) {
  candidates.push({ score: 4000 + jitter(), action: { type: 'attack', unitId: unit.id, q: attackTile.q, r: attackTile.r } });
  continue;
}
```

**3b. Gate the move→attack chain** (~line 91). Replace:

```ts
for (const c of targets) {
  const ghost: Unit = { ...unit, q: c.q, r: c.r };
  const a = chooseBestAttack(map, ghost, unit.owner);
  if (a) {
```

with:

```ts
for (const c of targets) {
  const ghost: Unit = { ...unit, q: c.q, r: c.r };
  const a = chooseBestAttack(map, ghost, unit.owner);
  if (a && (!difficulty || !difficulty.checkTrades || tradeIsFavorable(map, ghost, a))) {
```

**3c. Reserve + stance-aware spawns.** Replace the spawn candidate block (~line 37-58) with:

```ts
if (!state.spawned.has(k) && !v.unit) {
  const threatened = enemyCanReach(map, v, player.index);
  const freeVillageToGrab = situation?.freeVillages.length ? situation.freeVillages.some((f) => f.distance <= 6) : false;
  const prefer =
    situation?.stance === 'defend' || threatened
      ? 'defense'
      : situation?.stance === 'settle' && freeVillageToGrab
        ? 'scout'
        : 'offense';
  const type = bestSpawnableUnitType(player, prefer);
  if (type) {
    const cost = { wood: UNIT_TYPES[type].priceWood, stone: 0, money: UNIT_TYPES[type].price, ore: UNIT_TYPES[type].priceOre };
    if (canAfford(player.resources, cost)) {
      const after = pay(player.resources, cost);
      const reserveOk = threatened || after.money >= (difficulty?.spawnReserve ?? UNIT_TYPES.warrior.price);
      if (reserveOk) {
        candidates.push({ score: (threatened ? 500 : 250) + jitter(), action: { type: 'spawn', q: v.q, r: v.r, unitType: type } });
      }
    }
  }
}
```

**3d. War front cohesion in move scoring.** In the move branch (~line 86-117), after computing the current score `s` and before `if (s > bestMoveScore)`, insert:

```ts
if (situation?.stance === 'war' && situation.frontTarget) {
  const df = hexDistance(c, situation.frontTarget);
  s += 500 - df * 10;
  const ownDist = nearestOwnUnitDistanceFrom(map, player.index, c);
  if (Number.isFinite(ownDist)) s += Math.max(0, 30 - ownDist * 4);
}
```

**3e. Easy mistake chance.** In `bestAvailableAction`, right before the final `let best = candidates[0]!;` loop, insert:

```ts
if (difficulty && difficulty.mistakeChance > 0 && rng.next() < difficulty.mistakeChance) {
  const pick = candidates[Math.floor(rng.next() * candidates.length)]!;
  return Array.isArray(pick.action) ? pick.action : [pick.action];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ai.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. If any pre-existing test now fails because of trade gating or spawn changes, inspect it: the change is intentional only where it makes the AI avoid losing trades; adjust test fixture units where the old behaviour asserted a suicidal attack.

- [ ] **Step 6: Commit**

```bash
git add src/game/ai.ts tests/ai.test.ts
git commit -m "feat: mission-aware AI fallback (war fronts, trade gating, economy, mistakes)"
```

---

### Task 8: Difficulty plumbing (players, settings, screens)

**Files:**
- Modify: `src/game/players.ts`
- Modify: `src/storage/settings.ts`
- Modify: `src/ui/screens/StartScreen.ts`
- Modify: `src/ui/screens/SetupScreen.ts`
- Modify: `src/controller/gameController.ts`
- Modify: `src/controller/networkController.ts`
- Test: `tests/players.test.ts`, `tests/settings.test.ts`

**Interfaces:**
- Consumes: `AiDifficulty`, `DEFAULT_AI_DIFFICULTY` from `./aiDifficulty` (Task 1).
- Produces: `Player.difficulty?: AiDifficulty`; `buildPlayers(humanTribe, enemyCount, rng, difficulty?)`; `buildMultiplayerPlayers(humans, aiCount, rng, difficulty?)`; `GameSettings.aiDifficulty`; `loadSettings().aiDifficulty`; `setAiDifficulty(d: AiDifficulty)`; `gameController.startGame(tribe, enemies, mode, difficulty?)`; difficulty row in Setup and Settings.

- [ ] **Step 1: Write the failing tests**

Append to `tests/players.test.ts`:

```ts
describe('AI difficulty on players', () => {
  it('stamps difficulty onto AI players in single player', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'hard');
    expect(players[0].difficulty).toBeUndefined();
    expect(players[1].difficulty).toBe('hard');
  });

  it('defaults to normal', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    expect(players[0].difficulty).toBeUndefined();
    expect(players[1].difficulty).toBe('normal');
  });

  it('stamps difficulty onto multiplayer AI players', () => {
    const players = buildMultiplayerPlayers([{ name: 'A', tribe: Tribe.Cats }], 1, new SeededRandom(1), 'easy');
    expect(players.find((p) => !p.isHuman)!.difficulty).toBe('easy');
  });
});
```

Append to `tests/settings.test.ts` (it already defines a `fakeStorage()` helper and mocks storage per test):

```ts
describe('AI difficulty setting', () => {
  it('defaults to normal and round-trips', () => {
    fakeStorage();
    expect(loadSettings().aiDifficulty).toBe('normal');
    setAiDifficulty('hard');
    expect(loadSettings().aiDifficulty).toBe('hard');
    setAiDifficulty('normal');
    expect(loadSettings().aiDifficulty).toBe('normal');
  });
});
```

Add `setAiDifficulty` to the import list at the top of the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/players.test.ts tests/settings.test.ts`
Expected: FAIL — `difficulty` not on `Player`, `buildPlayers`/`buildMultiplayerPlayers` take 3 args, settings missing `aiDifficulty`.

- [ ] **Step 3: Implement `players.ts`**

```ts
import { AiDifficulty } from './aiDifficulty';
```

Add optional field to `Player` interface:

```ts
difficulty?: AiDifficulty;
```

Extend `makePlayer`:

```ts
function makePlayer(index: number, tribe: Tribe, isHuman: boolean, name: string, difficulty?: AiDifficulty): Player {
  return {
    index,
    tribe,
    isHuman,
    name,
    resources: startingResourcesFor(tribe),
    score: 0,
    kills: 0,
    skills: startingSkillsFor(tribe),
    isActive: true,
    knownTribes: [tribe],
    stats: { ...EMPTY_STATS },
    difficulty: isHuman ? undefined : difficulty,
  };
}
```

Change `buildPlayers` signature and its AI loop:

```ts
export function buildPlayers(
  humanTribe: Tribe,
  enemyCount: number,
  rng: SeededRandom,
  difficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY,
): Player[] {
  ...
  for (const tribe of enemyTribes) {
    players.push(makePlayer(players.length, tribe, false, names[players.length]!, difficulty));
  }
```

Change `buildMultiplayerPlayers` signature and its AI loop:

```ts
export function buildMultiplayerPlayers(
  humans: { name: string; tribe: Tribe }[],
  aiCount: number,
  rng: SeededRandom,
  difficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY,
): Player[] {
  ...
  for (let i = 0; i < aiCount; i++) {
    players.push(makePlayer(players.length, aiTribes[i]!, false, aiNames[i]!, difficulty));
  }
```

(Import `DEFAULT_AI_DIFFICULTY` too.)

- [ ] **Step 4: Implement `src/storage/settings.ts`**

```ts
import { AiDifficulty, DEFAULT_AI_DIFFICULTY } from '../game/aiDifficulty';
```

Extend the interface and defaults:

```ts
export interface GameSettings {
  attackConfirmation: boolean;
  aiDifficulty: AiDifficulty;
}

const DEFAULTS: GameSettings = {
  attackConfirmation: true,
  aiDifficulty: DEFAULT_AI_DIFFICULTY,
};
```

Add accessors:

```ts
export function setAiDifficulty(level: AiDifficulty): void {
  saveSettings({ ...loadSettings(), aiDifficulty: level });
}
```

- [ ] **Step 5: Implement the Settings panel row in `StartScreen.ts`**

Add imports at the top of the file:

```ts
import { AiDifficulty } from '../../game/aiDifficulty';
import { loadSettings, setAiDifficulty, setAttackConfirmation } from '../../storage/settings';
```

In the `SettingsPanel` constructor:
- grow the card: `const cardH = 190;` → `const cardH = 250;`
- after the attack-confirmation row, add a difficulty row; the card's close button moves from `y` 128 to `y` 188.

Replace the block that runs from `const close = new Button...` down to the `card.addChild(label, checkbox.el);` line so the children are added together:

```ts
const close = new Button({ label: 'Close', width: 140, onClick: onClose });
close.position.set(cardW / 2 - 70, 188);
card.addChild(label, checkbox.el, close);
```

Then, after that attack-confirmation row block, add the difficulty row:

```ts
const difficultyLabel = makeLabel('AI difficulty', { fontSize: 16, fill: 0xeeeeee });
const difficultyCurrent = loadSettings().aiDifficulty;
const difficultyButtons: Button[] = (['easy', 'normal', 'hard'] as AiDifficulty[]).map((d) => {
  const b = new Button({
    label: d[0]!.toUpperCase() + d.slice(1),
    width: 92,
    selected: d === difficultyCurrent,
    onClick: () => {
      setAiDifficulty(d);
      difficultyButtons.forEach((bb) => { bb.selected = bb === b; });
    },
  });
  return b;
});
difficultyLabel.position.set(24, 120 - difficultyLabel.height / 2);
difficultyButtons.forEach((b, i) => {
  b.position.set(cardW - 24 - difficultyButtons.length * 92 - (difficultyButtons.length - 1) * 4 + i * 96, 120 - b.height / 2);
});
card.addChild(difficultyLabel, ...difficultyButtons);
```

Place this row *before* the existing `card.addChild(label, checkbox.el);` call is moved into the combined block above, or simply keep it before `const close` — order does not matter since children are added to the card either way. (The `Button` kit supports `.selected`; verify against `src/ui/kit/button.ts`.)

- [ ] **Step 6: Implement the difficulty row in `SetupScreen.ts`**

- Add import: `import { AiDifficulty } from '../../game/aiDifficulty';` and `import { loadSettings } from '../../storage/settings';`.
- Add field `private difficulty: AiDifficulty = loadSettings().aiDifficulty;`
- Add `const DIFFICULTY_OPTIONS: AiDifficulty[] = ['easy', 'normal', 'hard'];`
- Change `const SELECTOR_COUNT = 4;` to `const SELECTOR_COUNT = 5;`
- Add a title `this.difficultyTitle` (styled like the others) and three buttons bound to the options; render selected state in `refresh()`; place difficulty row between Mode and Back in `layout()`.
- Keyboard: selector indexes become tribe 0, enemies 1, mode 2, difficulty 3, back 4. Update `change()` so `selector === 4` returns early; `selector === 3` cycles `DIFFICULTY_OPTIONS`.
- `Enter`: `if (this.selector === 4) back else start`. Pass difficulty: `gameController.startGame(this.tribe, this.enemies, store.mode, this.difficulty)`.

Use the existing `Button` + `makeLabel` patterns already in the file; the layout mirrors the Mode row.

- [ ] **Step 7: Update `gameController.startGame`**

```ts
import { AiDifficulty, DEFAULT_AI_DIFFICULTY } from '../game/aiDifficulty';
```

Change signature and the player build:

```ts
async startGame(tribe: Tribe, enemyCount: number, mode: GameMode, difficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY): Promise<void> {
  const store = useGameStore.getState();
  const players = buildPlayers(tribe, enemyCount, new SeededRandom(Math.floor(Math.random() * 100000)), difficulty);
  ...
```

- [ ] **Step 8: Update `networkController.ts` multiplayer host**

Add imports at the top of the file:

```ts
import { AiDifficulty } from '../game/aiDifficulty';
import { loadSettings } from '../storage/settings';
```

At the `buildMultiplayerPlayers` call (line ~211) pass the settings default:

```ts
const difficulty: AiDifficulty = loadSettings().aiDifficulty;
const players = buildMultiplayerPlayers(humans, this.hostConfig.aiCount, new SeededRandom(Math.floor(Math.random() * 100000)), difficulty);
```

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/game/players.ts src/storage/settings.ts src/ui/screens/StartScreen.ts src/ui/screens/SetupScreen.ts src/controller/gameController.ts src/controller/networkController.ts tests/players.test.ts tests/settings.test.ts
git commit -m "feat: AI difficulty wiring (player field, settings, setup screen, host)"
```

---

### Task 9: Behavior scenario tests + full verification

**Files:**
- Create: `tests/aiBehavior.test.ts`

**Interfaces:**
- Consumes: completed planner with difficulty + missions (Tasks 1-8).

- [ ] **Step 1: Write the scenario tests**

`tests/aiBehavior.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { GameMap } from '../src/game/mapGen';

describe('AI behavior scenarios', () => {
  it('captures a reachable enemy village when it holds a strong advantage', () => {
    const map = makeTestMap(6);
    const village = tileAt(map, 5, 0)!;
    village.settlement = { owner: 0, level: 1, captureReady: false };
    village.ownedBy = 0;
    // AI capital + a small army on the path to the enemy village.
    const capital = tileAt(map, 0, 0)!;
    capital.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    capital.ownedBy = 1;
    capital.unit = makeUnit('cap', 1, 'warrior', 0, 0);
    tileAt(map, 1, 0)!.unit = makeUnit('w1', 1, 'warrior', 1, 0);
    tileAt(map, 2, 0)!.unit = makeUnit('w2', 1, 'warrior', 2, 0);
    tileAt(map, 3, 0)!.unit = makeUnit('w3', 1, 'warrior', 3, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'normal');
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    for (let i = 0; i < 20 && !sim.gameOver; i++) {
      sim.applyCommand({ type: 'endTurn' });
      if (village.settlement!.owner === 1) break;
    }
    expect(village.settlement!.owner).toBe(1);
  });

  it('does not let a raider capture a defended AI capital', () => {
    const map = makeTestMap(6);
    const capital = tileAt(map, 0, 0)!;
    capital.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    capital.ownedBy = 1;
    // AI knight one hex off the capital, ready to garrison/repel.
    tileAt(map, 0, -1)!.unit = makeUnit('knight', 1, 'knight', 0, -1);
    // Enemy raider, two hexes east (human-controlled; we walk it toward the capital each round).
    const raider = makeUnit('raider', 0, 'warrior', 2, 0);
    const raiderTile = tileAt(map, 2, 0)!;
    raiderTile.unit = raider;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'normal');
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    for (let i = 0; i < 8; i++) {
      // Human: walk the raider one step toward the capital and end the turn.
      if (raiderTile.unit === raider) {
        const step = tileAt(map, raider.q - 1, raider.r);
        if (step) sim.applyCommand({ type: 'move', unitId: raider.id, q: step.q, r: step.r });
      }
      sim.applyCommand({ type: 'endTurn' });
    }
    expect(capital.settlement!.owner).toBe(1);
    expect(tileAt(map, 0, 0)!.unit?.owner ?? null).not.toBe(0);
  });

  it('runs a full 30-turn game to completion without errors', () => {
    const map = makeTestMap(6);
    const capital = tileAt(map, 0, 0)!;
    capital.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    capital.ownedBy = 1;
    capital.unit = makeUnit('cap', 1, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'hard');
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(3) });
    sim.startGame();
    for (let i = 0; i < 35 && !sim.gameOver; i++) {
      sim.applyCommand({ type: 'endTurn' });
    }
    expect(sim.gameOver).toBe(true);
    expect(sim.winnerIndex).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/aiBehavior.test.ts`
Expected: PASS. If a scenario is flaky or fails, debug the intent layer (log `analyzeSituation(...).stance` for that map) rather than loosening the assertion blindly — the war scenario must reach the village because the AI outnumbers the empty village, and the defense scenario must hold because a knight can kill the lone raider.

- [ ] **Step 3: Run typecheck and the whole suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 4: Manual QA (play 3 quick games)**

- Single player on Easy: AI visibly makes mistakes but still expands.
- Single player on Hard in capture mode: AI groups and pushes on an enemy village; defends home when raided.
- 30-turn mode: AI keeps units busy and upgrades.
Document anything surprising in the commit message body if you had to tune it.

- [ ] **Step 5: Commit**

```bash
git add tests/aiBehavior.test.ts
git commit -m "test: AI behavior scenarios (war push, defense, 30-turn smoke)"
```

---

## Self-Review Notes

- Spec coverage: Task 1 covers difficulty profiles; Task 2 covers situation analysis/stances/village danger; Task 3 threads mode+difficulty+situation; Task 4 covers favorable trades; Tasks 5/6 cover defense and anti-passivity (hunt); Task 7 covers front cohesion, economy reserve, and Easy mistakes; Task 8 covers settings/players/UI/host; Task 9 covers scenarios and acceptance. Spec Section 6 (acceptance checklist) maps to Task 9 Step 4 manual QA.
- Type consistency: `AiSituation`/`AiStance`/`VillageDanger` names are identical in Tasks 2-7; `planAiActions` 4th arg `mode` defaults to `'capture'` everywhere; `bestAvailableAction` gains two trailing optional params consistently.
- No placeholders: every step has concrete code or an exact fixture description.
