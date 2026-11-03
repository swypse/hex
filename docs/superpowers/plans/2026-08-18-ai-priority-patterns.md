# AI Priority Patterns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the AI to perform every player action (move, upgrade, capture, attack, spawn, build factory/mine/port, open skills, heal), randomly selecting actions until none are available, with three priority patterns running first.

**Architecture:** Shared `aiTypes.ts` defines `AiAction`, `AiPlannerState`, `AiPatternContext`. A data-driven `aiPatterns.ts` exports `AI_PATTERNS` (id, priority, evaluate) — easy to add/re-prioritize. `ai.ts`'s `planAiActions(map, player, rng)` loops: check patterns by priority first, else pick a random available action, mark state, repeat until nothing is available. The controller executes the new action types.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- `AiAction` gains `heal`, `build`, `openSkill` (defined in `aiTypes.ts`).
- `planAiActions(map: GameMap, player: Player, rng: SeededRandom): AiAction[]` — takes the `Player` (skills/resources), not just money.
- Patterns: `defend-empty-village` (priority 100), `defend-hurt-unit` (90), `archer-kite` (80), evaluated highest-priority first; each returns `AiAction[] | null`.
- Threat approximations: enemy can reach a tile iff `hexDistance(enemy, tile) <= UNIT_MOVEMENT[enemy.type]`; can attack next round iff `hexDistance <= UNIT_MOVEMENT + UNIT_ATTACK_DISTANCE`.
- Most-HP spawn order: swordsman (8) > warrior (5) > rider (4) > archer (3), respecting affordability and the swordsman skill.
- Planner state: `{ moved, acted, upgraded, spawned, built, opened, occupied }`; max-iteration guard `MAX_PLAN_STEPS = 200`.
- Every task ends with `npm run typecheck` green and `npm test` green.

---

### Task 1: Action types + pattern module

**Files:**
- Create: `src/game/aiTypes.ts`
- Create: `src/game/aiPatterns.ts`
- Test: `tests/aiPatterns.test.ts` (new)
- Modify: `src/game/ai.ts` (import `AiAction` from `aiTypes`)

**Interfaces:**
- Produces:
  - `src/game/aiTypes.ts`:
    - `export type AiAction = { type: 'upgrade'; q; r } | { type: 'move'; unitId; q; r } | { type: 'attack'; unitId; q; r } | { type: 'spawn'; q; r; unitType: UnitType } | { type: 'capture'; unitId; q; r } | { type: 'heal'; unitId; q; r } | { type: 'build'; q; r; kind: 'factory'|'mine'|'port' } | { type: 'openSkill'; skill: SkillId }`
    - `export interface AiPlannerState { moved: Set<string>; acted: Set<string>; upgraded: Set<string>; spawned: Set<string>; built: Set<string>; opened: Set<SkillId>; occupied: Set<string> }`
  - `src/game/aiPatterns.ts`:
    - `export interface AiPatternContext { map: GameMap; player: Player; rng: SeededRandom; state: AiPlannerState }`
    - `export interface AiPattern { id: string; priority: number; evaluate(ctx: AiPatternContext): AiAction[] | null }`
    - `export const AI_PATTERNS: AiPattern[]`

- [ ] **Step 1: Write the failing tests** — create `tests/aiPatterns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit } from '../src/game/units';
import { SeededRandom } from '../src/util/random';
import { AI_PATTERNS, AiPatternContext } from '../src/game/aiPatterns';
import { AiPlannerState } from '../src/game/aiTypes';

function tile(
  q: number,
  r: number,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
  ownedBy: number | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy, claimedByVillage: null, building: null };
}

function warrior(id: string, owner: number, q: number, r: number, hp = 5): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp, attack: 2, attackDistance: 1, spawnVillage: null };
}

function archer(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'archer', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 3, attack: 1, attackDistance: 2, spawnVillage: null };
}

function player(money: number, skills: Player['skills'] = []): Player {
  return {
    index: 1, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 5, stone: 5, money, ore: 5 },
    score: 0, kills: 0, skills, isActive: true,
  };
}

function state(): AiPlannerState {
  return {
    moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(),
    built: new Set(), opened: new Set(), occupied: new Set(),
  };
}

function ctx(map: GameMap, player: Player, rng: SeededRandom): AiPatternContext {
  return { map, player, rng, state: state() };
}

function findPattern(id: string) {
  return AI_PATTERNS.find((p) => p.id === id)!;
}

describe('AI patterns', () => {
  it('are sorted by priority descending', () => {
    for (let i = 1; i < AI_PATTERNS.length; i++) {
      expect(AI_PATTERNS[i].priority).toBeLessThanOrEqual(AI_PATTERNS[i - 1].priority);
    }
  });

  it('defend-empty-village spawns the most-hp affordable unit on a threatened empty village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false, capital: true }, null, 1);
    map.tiles.push(village, tile(1, 0, null, warrior('enemy', 0, 1, 0)));
    const actions = findPattern('defend-empty-village').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0].type).toBe('spawn');
    if (actions![0].type === 'spawn') expect(actions![0].unitType).toBe('warrior');
  });

  it('defend-empty-village returns null when not threatened', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1), tile(3, 0, null, warrior('enemy', 0, 3, 0)));
    expect(findPattern('defend-empty-village').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('defend-hurt-unit heals or moves out + spawns a threatened hurt unit on its village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, warrior('w', 1, 0, 0, 2), 1);
    map.tiles.push(village, tile(1, 0, null, warrior('enemy', 0, 1, 0)), tile(0, 1));
    const actions = findPattern('defend-hurt-unit').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    if (actions!.length === 1) {
      expect(actions![0].type).toBe('heal');
    } else {
      expect(actions!.length).toBe(2);
      expect(actions![0].type).toBe('move');
      expect(actions![1].type).toBe('spawn');
    }
  });

  it('archer-kite moves to distance 2 then attacks a distance-1 enemy', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, archer('a', 1, 0, 0)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0)),
      tile(2, 0),
    );
    const actions = findPattern('archer-kite').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions!.length).toBe(2);
    expect(actions![0].type).toBe('move');
    if (actions![0].type === 'move') expect(actions![0].q).toBe(2);
    expect(actions![1].type).toBe('attack');
    if (actions![1].type === 'attack') {
      expect(actions![1].q).toBe(1);
      expect(actions![1].r).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/aiPatterns.test.ts`
Expected: FAIL — `Cannot find module '../src/game/aiTypes'`.

- [ ] **Step 3: Create `src/game/aiTypes.ts`**

```ts
import { SkillId } from './skills';
import { UnitType } from './units';

export type AiAction =
  | { type: 'upgrade'; q: number; r: number }
  | { type: 'move'; unitId: string; q: number; r: number }
  | { type: 'attack'; unitId: string; q: number; r: number }
  | { type: 'spawn'; q: number; r: number; unitType: UnitType }
  | { type: 'capture'; q: number; r: number; unitId: string }
  | { type: 'heal'; unitId: string; q: number; r: number }
  | { type: 'build'; q: number; r: number; kind: 'factory' | 'mine' | 'port' }
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

- [ ] **Step 4: Create `src/game/aiPatterns.ts`**

```ts
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford } from './resources';
import { hasSkill } from './skills';
import { reachableTargets } from './selection';
import { UNIT_ATTACK_DISTANCE, UNIT_MOVEMENT, UNIT_TYPES, UnitType } from './units';
import { SeededRandom } from '../util/random';
import { hexDistance } from './hex';
import { AiAction, AiPlannerState } from './aiTypes';

export interface AiPatternContext {
  map: GameMap;
  player: Player;
  rng: SeededRandom;
  state: AiPlannerState;
}

export interface AiPattern {
  id: string;
  priority: number;
  evaluate(ctx: AiPatternContext): AiAction[] | null;
}

function key(q: number, r: number): string {
  return `${q},${r}`;
}

export function enemyCanReach(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  return map.tiles.some(
    (t) =>
      t.unit &&
      t.unit.owner !== playerIndex &&
      hexDistance(tile, t) <= UNIT_MOVEMENT[t.unit.type],
  );
}

export function enemyCanAttackNext(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  return map.tiles.some(
    (t) =>
      t.unit &&
      t.unit.owner !== playerIndex &&
      hexDistance(tile, t) <= UNIT_MOVEMENT[t.unit.type] + UNIT_ATTACK_DISTANCE[t.unit.type],
  );
}

export function bestSpawnableUnitType(player: Player): UnitType | null {
  const order: UnitType[] = ['swordsman', 'warrior', 'rider', 'archer'];
  for (const type of order) {
    if (type === 'swordsman' && !hasSkill(player, 'swordsman')) continue;
    const cost = { wood: 0, stone: 0, money: UNIT_TYPES[type].price, ore: UNIT_TYPES[type].priceOre };
    if (canAfford(player.resources, cost)) return type;
  }
  return null;
}

export const AI_PATTERNS: AiPattern[] = [
  {
    id: 'defend-empty-village',
    priority: 100,
    evaluate({ map, player, state }): AiAction[] | null {
      const villages = map.tiles.filter((t) => t.settlement && t.settlement.owner === player.index);
      for (const v of villages) {
        const k = key(v.q, v.r);
        if (state.spawned.has(k)) continue;
        if (v.unit) continue;
        if (!enemyCanReach(map, v, player.index)) continue;
        const type = bestSpawnableUnitType(player);
        if (!type) continue;
        return [{ type: 'spawn', q: v.q, r: v.r, unitType: type }];
      }
      return null;
    },
  },
  {
    id: 'defend-hurt-unit',
    priority: 90,
    evaluate({ map, player, rng, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (!t.settlement || t.settlement.owner !== player.index) continue;
        if (unit.hp > UNIT_TYPES[unit.type].maxHp / 2) continue;
        if (!enemyCanAttackNext(map, t, player.index)) continue;
        if (rng.next() < 0.5) {
          return [{ type: 'heal', unitId: unit.id, q: t.q, r: t.r }];
        }
        const targets = reachableTargets(map, unit).filter(
          (c) =>
            !state.occupied.has(key(c.q, c.r)) &&
            !(c.settlement && c.settlement.owner === player.index),
        );
        if (targets.length === 0) {
          return [{ type: 'heal', unitId: unit.id, q: t.q, r: t.r }];
        }
        const target = targets[Math.floor(rng.next() * targets.length)];
        const spawnType = bestSpawnableUnitType(player);
        if (!spawnType) return [{ type: 'move', unitId: unit.id, q: target.q, r: target.r }];
        return [
          { type: 'move', unitId: unit.id, q: target.q, r: target.r },
          { type: 'spawn', q: t.q, r: t.r, unitType: spawnType },
        ];
      }
      return null;
    },
  },
  {
    id: 'archer-kite',
    priority: 80,
    evaluate({ map, player, rng, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== 'archer') continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement) continue;
        const enemy = map.tiles.find(
          (e) => e.unit && e.unit.owner !== player.index && hexDistance(t, e) === 1,
        );
        if (!enemy) continue;
        const targets = reachableTargets(map, unit).filter(
          (c) => hexDistance(enemy, c) === 2 && !state.occupied.has(key(c.q, c.r)),
        );
        if (targets.length === 0) continue;
        const target = targets[Math.floor(rng.next() * targets.length)];
        return [
          { type: 'move', unitId: unit.id, q: target.q, r: target.r },
          { type: 'attack', unitId: unit.id, q: enemy.q, r: enemy.r },
        ];
      }
      return null;
    },
  },
];
```

- [ ] **Step 5: Update `src/game/ai.ts` to import `AiAction` from `aiTypes`**

Add `import { AiAction } from './aiTypes';` and remove the inline `AiAction` type definition from `ai.ts`. Keep the old `planAiActions` implementation for now.

- [ ] **Step 6: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/aiTypes.ts src/game/aiPatterns.ts tests/aiPatterns.test.ts src/game/ai.ts
git commit -m "feat: add AI action types and priority patterns"
```

---

### Task 2: Planner rework

**Files:**
- Modify: `src/game/ai.ts` (planner loop, random pool, marking)
- Modify: `src/controller/gameController.ts` (call site `planAiActions(this.map, ai, rng)`)
- Test: `tests/ai.test.ts` (rework)

**Interfaces:**
- Consumes: `AI_PATTERNS`, `AiPatternContext` from `aiPatterns.ts`; `AiAction`, `AiPlannerState` from `aiTypes.ts`.
- Produces: `planAiActions(map: GameMap, player: Player, rng: SeededRandom): AiAction[]`.

- [ ] **Step 1: Rework `tests/ai.test.ts`**

Replace the file body with property-based tests for the loop-based planner (imports: `planAiActions` from `../src/game/ai`, `AiAction` from `../src/game/aiTypes`):

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { planAiActions } from '../src/game/ai';
import { AiAction } from '../src/game/aiTypes';
import { reachableTargets } from '../src/game/selection';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import { Unit } from '../src/game/units';
import { SeededRandom } from '../src/util/random';

function makeTile(
  q: number,
  r: number,
  ownedBy: number | null = null,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy, claimedByVillage: null, building: null };
}

function makeWarrior(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: null };
}

function aiPlayer(): import('../src/game/players').Player {
  return {
    index: 1, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 5, stone: 5, money: 100, ore: 5 },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

function makeAiMap(): GameMap {
  const village = makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false });
  const warrior = makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }, makeWarrior('w1', 1, 0, 0));
  const target = makeTile(1, 0, null);
  return { radius: 4, tiles: [village, warrior, target], spawns: [] };
}

function planSeeds(map: GameMap, player: import('../src/game/players').Player, seeds: number): AiAction[] {
  const all: AiAction[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    all.push(...planAiActions(map, player, new SeededRandom(seed)));
  }
  return all;
}

describe('planAiActions', () => {
  it('returns a bounded list of actions', () => {
    const actions = planAiActions(makeAiMap(), aiPlayer(), new SeededRandom(1));
    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.length).toBeLessThan(200);
  });

  it('moves only to reachable tiles', () => {
    const map = makeAiMap();
    const unit = map.tiles.find((t) => t.unit)!.unit!;
    const reachable = new Set(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`));
    for (const a of planSeeds(map, aiPlayer(), 10)) {
      if (a.type === 'move') expect(reachable.has(`${a.q},${a.r}`)).toBe(true);
    }
  });

  it('does not plan moves for other players units', () => {
    for (const a of planSeeds(makeAiMap(), aiPlayer(), 10)) {
      if (a.type === 'move') expect(a.unitId).toBe('w1');
    }
  });

  it('spawns and upgrades across seeds', () => {
    const all = planSeeds(makeAiMap(), aiPlayer(), 40);
    expect(all.some((a) => a.type === 'spawn')).toBe(true);
    expect(all.some((a) => a.type === 'upgrade')).toBe(true);
  });

  it('plans a capture when parked on a capture-ready foreign village', () => {
    const map = makeAiMap();
    map.tiles[0].settlement!.owner = 0;
    map.tiles[0].settlement!.captureReady = true;
    map.tiles[0].unit = makeWarrior('ai1', 1, 0, 0);
    expect(planSeeds(map, aiPlayer(), 40).some((a) => a.type === 'capture')).toBe(true);
  });

  it('plans an attack when an enemy is adjacent', () => {
    const map = makeAiMap();
    map.tiles.push(makeTile(0, 1, 0, null, makeWarrior('enemy', 0, 0, 1)));
    expect(planSeeds(map, aiPlayer(), 40).some((a) => a.type === 'attack')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ai.test.ts`
Expected: FAIL — the planner signature/behavior doesn't match yet.

- [ ] **Step 3: Rewrite `src/game/ai.ts`**

Replace the file with:

```ts
import { attackableTargets } from './combat';
import { canBuildFactory, canBuildMine, canBuildPort, BUILDING_COSTS } from './buildings';
import { hexDistance } from './hex';
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford, UPGRADE_COST } from './resources';
import { canOpenSkill, hasSkill, SKILLS, SkillId } from './skills';
import { reachableTargets } from './selection';
import { canHeal, UNIT_TYPES, Unit, UnitType } from './units';
import { SeededRandom } from '../util/random';
import { AI_PATTERNS, AiPatternContext } from './aiPatterns';
import { AiAction, AiPlannerState } from './aiTypes';

const MAX_PLAN_STEPS = 200;

function key(q: number, r: number): string {
  return `${q},${r}`;
}

function nearestEnemyDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === owner) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

function nearestVillageDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === owner) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

function hasForeignVillage(map: GameMap, owner: number): boolean {
  return map.tiles.some((t) => t.settlement && t.settlement.owner !== owner);
}

function spawnableTypes(player: Player): UnitType[] {
  return (Object.keys(UNIT_TYPES) as UnitType[]).filter((type) => {
    if (type === 'swordsman' && !hasSkill(player, 'swordsman')) return false;
    const cost = { wood: 0, stone: 0, money: UNIT_TYPES[type].price, ore: UNIT_TYPES[type].priceOre };
    return canAfford(player.resources, cost);
  });
}

function greedyMoveTarget(
  map: GameMap,
  unit: Unit,
  state: AiPlannerState,
): MapTile | undefined {
  const targets = reachableTargets(map, unit).filter(
    (t) => !state.occupied.has(key(t.q, t.r)) && !(t.settlement && t.settlement.owner === unit.owner),
  );
  if (targets.length === 0) return undefined;
  const towardVillages = hasForeignVillage(map, unit.owner);
  let best: MapTile | undefined;
  let bestDist = Infinity;
  for (const t of targets) {
    const d = towardVillages
      ? nearestVillageDistanceFrom(map, unit.owner, t)
      : nearestEnemyDistanceFrom(map, unit.owner, t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function randomAvailableAction(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  state: AiPlannerState,
): AiAction[] | null {
  const pool: AiAction[] = [];
  const villages = map.tiles.filter((t) => t.settlement && t.settlement.owner === player.index);
  for (const v of villages) {
    const k = key(v.q, v.r);
    if (!state.upgraded.has(k) && canAfford(player.resources, UPGRADE_COST)) {
      pool.push({ type: 'upgrade', q: v.q, r: v.r });
    }
    if (!state.spawned.has(k) && !v.unit) {
      for (const type of spawnableTypes(player)) {
        pool.push({ type: 'spawn', q: v.q, r: v.r, unitType: type });
      }
    }
  }

  for (const t of map.tiles) {
    const unit = t.unit;
    if (!unit || unit.owner !== player.index) continue;
    if (state.acted.has(unit.id)) continue;
    if (t.settlement && t.settlement.owner !== unit.owner && t.settlement.captureReady) {
      pool.push({ type: 'capture', q: t.q, r: t.r, unitId: unit.id });
      continue;
    }
    const attacks = attackableTargets(map, unit);
    if (attacks.length > 0) {
      pool.push({ type: 'attack', unitId: unit.id, q: attacks[0].q, r: attacks[0].r });
      continue;
    }
    if (state.moved.has(unit.id)) continue;
    if (canHeal(unit)) {
      pool.push({ type: 'heal', unitId: unit.id, q: t.q, r: t.r });
      continue;
    }
    const target = greedyMoveTarget(map, unit, state);
    if (target) pool.push({ type: 'move', unitId: unit.id, q: target.q, r: target.r });
  }

  for (const tile of map.tiles) {
    if (tile.ownedBy !== player.index) continue;
    if (state.built.has(key(tile.q, tile.r))) continue;
    const kinds: ('factory' | 'mine' | 'port')[] = [];
    if (canBuildFactory(map, tile, player)) kinds.push('factory');
    if (canBuildMine(map, tile, player)) kinds.push('mine');
    if (canBuildPort(map, tile, player)) kinds.push('port');
    for (const kind of kinds) {
      if (canAfford(player.resources, BUILDING_COSTS[kind])) {
        pool.push({ type: 'build', q: tile.q, r: tile.r, kind });
      }
    }
  }

  for (const id of Object.keys(SKILLS) as SkillId[]) {
    if (state.opened.has(id)) continue;
    if (canOpenSkill(player, id)) pool.push({ type: 'openSkill', skill: id });
  }

  if (pool.length === 0) return null;
  return [pool[Math.floor(rng.next() * pool.length)]];
}

function markUsed(state: AiPlannerState, action: AiAction): void {
  switch (action.type) {
    case 'move':
      state.moved.add(action.unitId);
      state.occupied.add(key(action.q, action.r));
      break;
    case 'attack':
    case 'heal':
    case 'capture':
      state.acted.add(action.unitId);
      break;
    case 'spawn':
      state.spawned.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
      break;
    case 'upgrade':
      state.upgraded.add(key(action.q, action.r));
      break;
    case 'build':
      state.built.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
      break;
    case 'openSkill':
      state.opened.add(action.skill);
      break;
  }
}

export function planAiActions(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
): AiAction[] {
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
    const ctx: AiPatternContext = { map, player, rng, state };
    let next: AiAction[] | null = null;
    for (const pattern of AI_PATTERNS) {
      next = pattern.evaluate(ctx);
      if (next) break;
    }
    if (!next) next = randomAvailableAction(map, player, rng, state);
    if (!next) break;
    for (const a of next) {
      actions.push(a);
      markUsed(state, a);
    }
  }
  return actions;
}
```

- [ ] **Step 4: Update the controller call site**

In `runAiPhase`, change:

```ts
      const actions = planAiActions(this.map, ai.index, ai.resources.money, new SeededRandom(Math.floor(Math.random() * 100000)));
```

to:

```ts
      const actions = planAiActions(this.map, ai, new SeededRandom(Math.floor(Math.random() * 100000)));
```

- [ ] **Step 5: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/ai.ts src/controller/gameController.ts tests/ai.test.ts
git commit -m "feat: loop-based AI planner with random actions"
```

---

### Task 3: Execute heal / build / openSkill actions

**Files:**
- Modify: `src/controller/gameController.ts` (action switch handlers)

**Interfaces:**
- Consumes: `healUnit`, `canHeal` from `units.ts`; `buildBuilding` from `buildings.ts`; `applySkill` (imported as `openSkill as applySkill`), `SKILLS` from `skills.ts`; `SKILL_SCORE` from `score.ts`.

- [ ] **Step 1: Add the imports**

- `units.ts` import currently: `import { canAttack, canHeal, canMove, healUnit, moveRange, UNIT_TYPE_NAMES, UnitType, Unit } from '../game/units';` — already includes `canHeal` and `healUnit`. ✓ (verify)
- Add `SKILLS` to the skills import: `import { hasSkill, openSkill as applySkill, SKILLS, type SkillId } from '../game/skills';`

- [ ] **Step 2: Add handlers to the AI action switch in `runAiPhase`**

After the `capture` branch and before the `move` branch, add:

```ts
        } else if (action.type === 'heal') {
          const unit = this.map.tiles.find((t) => t.unit && t.unit.id === action.unitId)?.unit;
          if (unit && canHeal(unit)) {
            healUnit(unit);
            showPopup(`${ai.name} heals a unit`, { background: tribeBackground(ai) });
          }
        } else if (action.type === 'build') {
          const tile = tileAt(this.map, action.q, action.r)!;
          if (buildBuilding(this.map, tile, action.kind, ai)) {
            showPopup(`${ai.name} builds a ${action.kind}`, { background: tribeBackground(ai) });
          }
        } else if (action.type === 'openSkill') {
          if (applySkill(ai, action.skill)) {
            awardScore(ai, SKILL_SCORE);
            showPopup(`${ai.name} learns ${SKILLS[action.skill].name}`, { background: tribeBackground(ai) });
          }
        } else if (action.type === 'move') {
```

- [ ] **Step 3: Run typecheck, tests, and build**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: builds successfully.

- [ ] **Step 4: Manual browser verification**

Run: `npm run dev`. Verify:
- The AI defends an empty threatened village by spawning the most-HP affordable unit.
- A hurt AI unit on a threatened village either heals or vacates + spawns.
- An AI archer kites a distance-1 enemy to distance 2 then attacks.
- The AI randomly moves/attacks/upgrades/spawns/builds (factory/mine/port after unlocking skills) and opens skills; plays a full turn and stops.

- [ ] **Step 5: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: execute AI heal, build and open-skill actions"
```
