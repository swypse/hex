# AI Naval Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a naval enemy (pirate or enemy ship) nears an AI player's territory, the AI builds a navy and catapults to defend/attack at sea, stops letting land units get farmed on the coast, and stops building pointless bridges.

**Architecture:** Reuse the existing situation → pattern → fallback planner. `analyzeSituation` computes a per-turn naval threat; new gated `AI_PATTERNS` (inserted between `hunt-idle-enemy` and `explore-frontier`) only fire while the threat is active and drive skills/port/boarding/ship-hunt/ship-upgrade/catapult-positioning. Targeted guards stop coastal farming and pointless bridges. `GAME.md` and game rules are unchanged.

**Tech Stack:** TypeScript, Vitest. Run targeted tests with `npx vitest run tests/aiNaval.test.ts`, the full suite with `npm test`, typecheck with `npm run typecheck`.

## Global Constraints

- Pure decision-logic change: no stat, resource, balance, UI, or rules changes. Do **not** modify `GAME.md`.
- Follow existing code style in `src/game/*.ts` (no comments unless clarifying; 2-space indent; existing helper patterns).
- All new decision logic must live in pure functions / pattern evaluators that return plain data — no simulator access from `aiSituation.ts`.
- Tests go in `tests/aiNaval.test.ts` (created in Task 1) unless noted otherwise.
- Threat detection uses plain hex distance (like the existing `enemyCanAttackNext`); no water-route BFS for threat/exposure decisions.
- Commit after every task with a short `feat:`/`test:` message.
- Reference spec: `docs/superpowers/specs/2026-09-09-ai-naval-response-design.md`.

---

### Task 1: Difficulty knob `navalThreatRadius`

**Files:**
- Modify: `src/game/aiDifficulty.ts:3-22`
- Test: `tests/aiNaval.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AiDifficultyProfile.navalThreatRadius: number` (easy ~6, normal 10, hard ~14) so Task 2's detection can read it.

- [ ] **Step 1: Write the failing test**

Create `tests/aiNaval.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY_PROFILES } from '../src/game/aiDifficulty';

describe('AiDifficulty naval profile', () => {
  it('exposes a navalThreatRadius knob that grows with difficulty', () => {
    const easy = AI_DIFFICULTY_PROFILES.easy.navalThreatRadius;
    const normal = AI_DIFFICULTY_PROFILES.normal.navalThreatRadius;
    const hard = AI_DIFFICULTY_PROFILES.hard.navalThreatRadius;
    expect(easy).toBeLessThan(normal);
    expect(normal).toBeLessThan(hard);
    expect(normal).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: FAIL — `navalThreatRadius` does not exist on the profile type/value.

- [ ] **Step 3: Implement the knob**

In `src/game/aiDifficulty.ts` add the field to the interface and the three profiles:

```ts
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
  /** Hex radius within which a visible naval enemy triggers the naval response. */
  navalThreatRadius: number;
}

export const AI_DIFFICULTY_PROFILES: Record<AiDifficulty, AiDifficultyProfile> = {
  easy: { mistakeChance: 0.25, guardWindow: 1, warRatio: 2.5, checkTrades: false, spawnReserve: 8, navalThreatRadius: 6 },
  normal: { mistakeChance: 0, guardWindow: 2, warRatio: 1.5, checkTrades: true, spawnReserve: 4, navalThreatRadius: 10 },
  hard: { mistakeChance: 0, guardWindow: 3, warRatio: 1.0, checkTrades: true, spawnReserve: 0, navalThreatRadius: 14 },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/aiDifficulty.ts tests/aiNaval.test.ts
git commit -m "feat(ai): add navalThreatRadius difficulty knob"
```

---

### Task 2: Naval threat detection in the situation analysis

**Files:**
- Modify: `src/game/aiSituation.ts`
- Test: `tests/aiNaval.test.ts`

**Interfaces:**
- Consumes: `AiDifficultyProfile.navalThreatRadius` (Task 1); `visibleEnemies` already in this file.
- Produces:
  - `export interface NavalEnemy { tile: MapTile; unit: Unit; distance: number }`
  - `export function isNavalEnemy(unit: Unit): boolean`
  - `export function navalCanStrikeTile(tile: MapTile, navalEnemies: NavalEnemy[]): boolean`
  - `export function coastExposedTile(map: GameMap, tile: MapTile, navalEnemies: NavalEnemy[]): boolean`
  - `AiSituation` gains `navalThreat: boolean`, `navalEnemies: NavalEnemy[]`, `nearestNaval: NavalEnemy | null`.
  - Later tasks consume `situation.navalThreat`, `situation.navalEnemies`, `situation.nearestNaval`.

- [ ] **Step 1: Write the failing test**

Append to `tests/aiNaval.test.ts`. Note: `makeTestMap(radius)` returns every tile with `terrain: GrasslandLand`, `ownedBy: null`, `exploredBy: [0,1,2,3]` — mutate terrain/ownership as needed.

```ts
import { planAiActions } from '../src/game/ai';
import { analyzeSituation, isNavalEnemy } from '../src/game/aiSituation';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import type { Player } from '../src/game/players';
import { SeededRandom } from '../src/util/random';
import { PIRATE_OWNER, type Unit } from '../src/game/units';
import { hexDistance } from '../src/game/hex';

function aiPlayer(over: Partial<Player> = {}): Player {
  return {
    index: 1,
    tribe: Tribe.Villagers,
    isHuman: false,
    name: 'AI',
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    score: 0,
    kills: 0,
    skills: [],
    isActive: true,
    difficulty: 'normal',
    ...over,
  };
}

function pirate(id: string, q: number, r: number): Unit {
  return {
    id, owner: PIRATE_OWNER, type: 'pirate', q, r,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 20, attack: 30, attackDistance: 3, defense: 10, spawnVillage: null,
  };
}

function shipUnit(id: string, owner: number, q: number, r: number): Unit {
  const u = makeUnit(id, owner, 'warrior', q, r);
  u.shipLevel = 1;
  return u;
}

describe('Naval threat detection', () => {
  it('isNavalEnemy flags pirates and ships but not land units', () => {
    const p = pirate('p', 0, 0);
    const s = shipUnit('s', 0, 0, 0);
    const w = makeUnit('w', 0, 'warrior', 0, 0);
    expect(isNavalEnemy(p)).toBe(true);
    expect(isNavalEnemy(s)).toBe(true);
    expect(isNavalEnemy(w)).toBe(false);
  });

  it('reports a naval threat when a pirate is near an AI unit or settlement', () => {
    const map = makeTestMap(8);
    const aiCap = tileAt(map, 0, 0)!;
    aiCap.settlement = { owner: 1, level: 1, captureReady: false };
    aiCap.ownedBy = 1;
    tileAt(map, 3, 0)!.terrain = TileType.Water;
    tileAt(map, 3, 0)!.unit = pirate('p1', 3, 0);
    const player = aiPlayer({ resources: { wood: 0, stone: 0, money: 100, ore: 0 } });
    const s = analyzeSituation(map, player, 'capture', { ...AI_DIFFICULTY_PROFILES.normal, navalThreatRadius: 10 });
    expect(s.navalThreat).toBe(true);
    expect(s.navalEnemies.length).toBe(1);
    expect(s.nearestNaval!.distance).toBe(3);
  });

  it('also counts an enemy ship as a naval threat', () => {
    const map = makeTestMap(8);
    const aiCap = tileAt(map, 0, 0)!;
    aiCap.settlement = { owner: 1, level: 1, captureReady: false };
    aiCap.ownedBy = 1;
    tileAt(map, 2, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.unit = shipUnit('enemy-ship', 0, 2, 0);
    const s = analyzeSituation(map, aiPlayer(), 'capture', { ...AI_DIFFICULTY_PROFILES.normal, navalThreatRadius: 10 });
    expect(s.navalThreat).toBe(true);
    expect(s.navalEnemies.length).toBe(1);
  });

  it('reports no threat when the pirate is beyond the radius', () => {
    const map = makeTestMap(12);
    const aiCap = tileAt(map, 0, 0)!;
    aiCap.settlement = { owner: 1, level: 1, captureReady: false };
    aiCap.ownedBy = 1;
    tileAt(map, 11, 0)!.terrain = TileType.Water;
    tileAt(map, 11, 0)!.unit = pirate('p1', 11, 0);
    const s = analyzeSituation(map, aiPlayer(), 'capture', { ...AI_DIFFICULTY_PROFILES.normal, navalThreatRadius: 6 });
    expect(s.navalThreat).toBe(false);
    expect(s.navalEnemies).toEqual([]);
  });
});
```

Note: `analyzeSituation` takes a full `AiDifficultyProfile`; the detection tests spread `AI_DIFFICULTY_PROFILES.normal` and only override `navalThreatRadius`. The behaviour tests use real players via `planAiActions`, where the profile comes from the player's difficulty.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: FAIL — `isNavalEnemy` / new `AiSituation` fields do not exist.

- [ ] **Step 3: Implement detection**

In `src/game/aiSituation.ts`:

Update imports:

```ts
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { GameMode } from './gameMode';
import { AiDifficultyProfile } from './aiDifficulty';
import { isExploredFor } from './explore';
import { hexDistance, hexNeighbors } from './hex';
import { isShip, shipAttackDistance, shipMovement } from './ship';
import { UNIT_ATTACK_DISTANCE, UNIT_MOVEMENT, Unit, UnitType } from './units';
import { isWaterType } from './tileTypes';
import { attackDamage } from './combat';
```

Add the exported type, predicate and helpers below the existing interfaces:

```ts
export interface NavalEnemy {
  tile: MapTile;
  unit: Unit;
  distance: number;
}

/** A unit that fights from water: a pirate or any unit currently on a ship. */
export function isNavalEnemy(unit: Unit): boolean {
  return unit.type === 'pirate' || unit.shipLevel !== undefined;
}

/** Farthest range from which a naval enemy can hit a tile this turn. */
function navalStrikeRange(unit: Unit): number {
  return isShip(unit) ? shipAttackDistance(unit) : UNIT_ATTACK_DISTANCE[unit.type];
}

/** True when a tile lies within the attack range of any listed naval enemy
 *  (terrain-ignoring). Used to keep fresh spawns and land units out of a
 *  pirate's reach. */
export function navalCanStrikeTile(tile: MapTile, navalEnemies: NavalEnemy[]): boolean {
  return navalEnemies.some((e) => hexDistance(tile, e.tile) <= navalStrikeRange(e.unit));
}

/** True when `tile` is a land tile bordering water that a naval enemy in
 *  `navalEnemies` can currently hit with an attack. */
export function coastExposedTile(map: GameMap, tile: MapTile, navalEnemies: NavalEnemy[]): boolean {
  if (isWaterType(tile.terrain)) return false;
  const isCoast = hexNeighbors(tile).some((n) => {
    const nt = map.tiles.find((t) => t.q === n.q && t.r === n.r);
    return nt !== undefined && isWaterType(nt.terrain);
  });
  if (!isCoast) return false;
  return navalCanStrikeTile(tile, navalEnemies);
}

function nearestOwnNavalTarget(map: GameMap, playerIndex: number, from: MapTile): number {
  let best = Infinity;
  for (const t of map.tiles) {
    const ownUnit = t.unit !== null && t.unit.owner === playerIndex;
    const ownSettlement = t.settlement !== null && t.settlement.owner === playerIndex;
    const ownPort = t.building !== null && t.building.kind === 'port' && t.ownedBy === playerIndex;
    if (ownUnit || ownSettlement || ownPort) {
      const d = hexDistance(from, t);
      if (d < best) best = d;
    }
  }
  return best;
}

function collectNavalThreats(map: GameMap, playerIndex: number, enemies: EnemyUnit[], radius: number): NavalEnemy[] {
  const out: NavalEnemy[] = [];
  for (const e of enemies) {
    if (!isNavalEnemy(e.unit)) continue;
    const distance = nearestOwnNavalTarget(map, playerIndex, e.tile);
    if (distance <= radius) out.push({ tile: e.tile, unit: e.unit, distance });
  }
  return out.sort((a, b) => a.distance - b.distance);
}
```

Add fields to the `AiSituation` interface:

```ts
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
  navalThreat: boolean;
  navalEnemies: NavalEnemy[];
  nearestNaval: NavalEnemy | null;
}
```

In `analyzeSituation` compute and return the naval state:

```ts
  const navalEnemies = collectNavalThreats(map, player.index, enemies, profile.navalThreatRadius);
  const navalThreat = navalEnemies.length > 0;
  const nearestNaval = navalEnemies[0] ?? null;

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
    navalThreat,
    navalEnemies,
    nearestNaval,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and full test sweep**

Run: `npm run typecheck && npx vitest run tests/aiSituation.test.ts tests/ai.test.ts tests/aiBehavior.test.ts tests/aiBehavior2.test.ts tests/aiCapture.test.ts tests/aiDifficulty.test.ts tests/aiEconomy.test.ts tests/aiPatterns.test.ts`
Expected: PASS — no existing AI test regressed.

- [ ] **Step 6: Commit**

```bash
git add src/game/aiSituation.ts tests/aiNaval.test.ts
git commit -m "feat(ai): detect naval threats in situation analysis"
```

---

### Task 3: `naval-open-skills` pattern

**Files:**
- Modify: `src/game/aiPatterns.ts`
- Test: `tests/aiNaval.test.ts`

**Interfaces:**
- Consumes: `situation.navalThreat` (Task 2); existing `hasSkill`, `canOpenSkill`, `SkillId` from `./skills`; `state.opened`.
- Produces: nothing new — behavior only. All later naval patterns read the same `situation` fields.

- [ ] **Step 1: Write the failing test**

Append to `tests/aiNaval.test.ts`:

```ts
describe('Naval skill priority', () => {
  function coastalMap(): ReturnType<typeof makeTestMap> {
    const map = makeTestMap(6);
    // The AI settlement at (0,0) anchors the threat measurement; water is off
    // the coast with a pirate further out at (3,0).
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 3, 0)!.terrain = TileType.Water;
    tileAt(map, 3, 0)!.unit = pirate('p1', 3, 0);
    return map;
  }

  it('opens Water first while threatened instead of the economy order', () => {
    const player = aiPlayer({ resources: { wood: 0, stone: 0, money: 10, ore: 0 } });
    const actions = planAiActions(coastalMap(), player, new SeededRandom(1), 'capture');
    const firstSkill = actions.find((a) => a.type === 'openSkill');
    expect(firstSkill).toBeDefined();
    if (firstSkill && firstSkill.type === 'openSkill') expect(firstSkill.skill).toBe('water');
  });

  it('opens Navigation when Water is already open and the coast is threatened', () => {
    const player = aiPlayer({
      skills: ['water'],
      resources: { wood: 0, stone: 0, money: 40, ore: 0 },
    });
    const actions = planAiActions(coastalMap(), player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'openSkill' && a.skill === 'navigation')).toBe(true);
  });

  it('does not prioritize Water when no naval enemy is near', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    const player = aiPlayer({ resources: { wood: 0, stone: 0, money: 10, ore: 0 } });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const firstSkill = actions.find((a) => a.type === 'openSkill');
    // Without a threat the economy order leads with Forestry, never Water.
    expect(firstSkill).toBeDefined();
    if (firstSkill && firstSkill.type === 'openSkill') expect(firstSkill.skill).toBe('forestry');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: FAIL — the first planned skill under threat is `forestry` (the old static order), not `water`.

- [ ] **Step 3: Implement the pattern**

In `src/game/aiPatterns.ts`, extend the `./skills` import (currently only `hasSkill`) to include `canOpenSkill` and `SkillId`:

```ts
import { canOpenSkill, hasSkill, SkillId } from './skills';
```

Then insert the new pattern object into the `AI_PATTERNS` array **immediately after the `hunt-idle-enemy` object and before `explore-frontier`**:

```ts
  {
    id: 'naval-open-skills',
    priority: 78,
    evaluate({ player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat) return null;
      const chain: SkillId[] = ['water', 'navigation', 'catapult'];
      for (const skill of chain) {
        if (state.opened.has(skill)) continue;
        if (skill === 'catapult' && !hasSkill(player, 'science')) {
          if (!state.opened.has('science') && canOpenSkill(player, 'science')) {
            return [{ type: 'openSkill', skill: 'science' }];
          }
          continue;
        }
        if (canOpenSkill(player, skill)) return [{ type: 'openSkill', skill }];
      }
      return null;
    },
  },
```

`SkillId` is already imported in this file? Yes — add it to the existing `./skills` import if not present:

```ts
import { canOpenSkill, hasSkill, SkillId } from './skills';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/aiPatterns.ts tests/aiNaval.test.ts
git commit -m "feat(ai): open naval skills first while threatened"
```

---

### Task 4: `naval-build-port` pattern + reserve-slot bypass

**Files:**
- Modify: `src/game/aiPatterns.ts`, `src/game/ai.ts`
- Test: `tests/aiNaval.test.ts`

**Interfaces:**
- Consumes: `canBuildPort`, `BUILDING_COSTS` from `./buildings`; `situation.navalThreat`, `situation.nearestNaval`.
- Produces: behavior only.

- [ ] **Step 1: Write the failing test**

Append to `tests/aiNaval.test.ts`:

```ts
describe('Naval port building', () => {
  it('builds a port on the threatened coast when Water is known', () => {
    const map = makeTestMap(6);
    // Owned coast: land (0,0) with the AI settlement (so a naval threat is
    // detected) + water (1,0), with the pirate further out.
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.ownedBy = 1;
    tileAt(map, 4, 0)!.terrain = TileType.Water;
    tileAt(map, 4, 0)!.unit = pirate('p1', 4, 0);
    const player = aiPlayer({
      skills: ['water'],
      resources: { wood: 20, stone: 0, money: 100, ore: 5 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const build = actions.find((a) => a.type === 'build');
    expect(build).toBeDefined();
    if (build && build.type === 'build') {
      expect(build.kind).toBe('port');
      expect(build.q).toBe(1);
      expect(build.r).toBe(0);
    }
  });

  it('builds the port on the coast nearest the pirate when several are possible', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    // Two candidate own-coast water tiles: (1,0) next to the settlement and
    // (0,2) next to owned land (0,1).
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.ownedBy = 1;
    tileAt(map, 0, 1)!.ownedBy = 1;
    tileAt(map, 0, 2)!.terrain = TileType.Water;
    tileAt(map, 0, 2)!.ownedBy = 1;
    // Pirate is closer to (0,2) than to (1,0).
    tileAt(map, 0, 4)!.terrain = TileType.Water;
    tileAt(map, 0, 4)!.unit = pirate('p1', 0, 4);
    const player = aiPlayer({
      skills: ['water'],
      resources: { wood: 20, stone: 0, money: 100, ore: 5 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const build = actions.find((a) => a.type === 'build');
    expect(build).toBeDefined();
    if (build && build.type === 'build') {
      expect(build.kind).toBe('port');
      expect(build.q).toBe(0);
      expect(build.r).toBe(2);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: FAIL — no port build action is planned.

- [ ] **Step 3: Implement the pattern + fallback bypass**

In `src/game/aiPatterns.ts`:
- Extend the `./buildings` import (currently `canBuildSawmill, canBuildMine, BUILDING_COSTS`) to include `canBuildPort`.
- `canAfford` is already imported; `key` local helper already exists.

Insert after `naval-open-skills` (still before `explore-frontier`):

```ts
  {
    id: 'naval-build-port',
    priority: 77,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat || !situation.nearestNaval) return null;
      if (!hasSkill(player, 'water')) return null;
      const naval = situation.nearestNaval;
      let best: MapTile | null = null;
      let bestDist = Infinity;
      for (const tile of map.tiles) {
        if (state.built.has(key(tile.q, tile.r))) continue;
        if (!canBuildPort(map, tile, player)) continue;
        if (!canAfford(player.resources, BUILDING_COSTS.port)) continue;
        const d = hexDistance(tile, naval.tile);
        if (d < bestDist) {
          bestDist = d;
          best = tile;
        }
      }
      if (!best) return null;
      return [{ type: 'build', q: best.q, r: best.r, kind: 'port' }];
    },
  },
```

In `src/game/ai.ts` `bestAvailableAction`, the port candidate currently sits behind the `reserveLastSlotForMine` guard. Bypass that guard while threatened (pass `situation` is already a parameter):

```ts
    if (canBuildPort(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.port)) {
      if (!reserveLastSlotForMine(map, player, tile) || situation?.navalThreat) {
        candidates.push({ score: 200 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'port' } });
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: PASS.

- [ ] **Step 5: Full AI test sweep**

Run: `npx vitest run tests/ai.test.ts tests/aiEconomy.test.ts tests/aiBehavior.test.ts tests/aiBehavior2.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/aiPatterns.ts src/game/ai.ts tests/aiNaval.test.ts
git commit -m "feat(ai): build a port on the threatened coast"
```

---

### Task 5: `naval-board-ship` pattern + `landEnemyCanReach`

**Files:**
- Modify: `src/game/aiPatterns.ts`
- Test: `tests/aiNaval.test.ts`

**Interfaces:**
- Consumes: `canDock = navigation` via `reachableTargets(..., true)`; `situation.navalThreat`; existing `enemyCanReach`.
- Produces: `export function landEnemyCanReach(map, tile, playerIndex): boolean` — same as `enemyCanReach` but ignores pirates (owner `-1`), because pirates cannot capture/occupy villages.

- [ ] **Step 1: Write the failing test**

Append to `tests/aiNaval.test.ts`:

```ts
describe('Naval boarding', () => {
  it('walks a spare unit onto an owned port to become a ship', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.unit = makeUnit('crew', 1, 'warrior', 0, 0);
    tileAt(map, 0, 1)!.terrain = TileType.Water;
    tileAt(map, 0, 1)!.ownedBy = 1;
    tileAt(map, 0, 1)!.building = { kind: 'port', level: 1 };
    tileAt(map, 4, 0)!.terrain = TileType.Water;
    tileAt(map, 4, 0)!.unit = pirate('p1', 4, 0);
    const player = aiPlayer({
      skills: ['water', 'navigation'],
      resources: { wood: 0, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const board = actions.find((a) => a.type === 'move' && a.unitId === 'crew');
    expect(board).toBeDefined();
    if (board && board.type === 'move') {
      expect(board.q).toBe(0);
      expect(board.r).toBe(1);
    }
  });

  it('does not board when the AI already has a ship', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.unit = makeUnit('crew', 1, 'warrior', 0, 0);
    tileAt(map, 0, 1)!.terrain = TileType.Water;
    tileAt(map, 0, 1)!.ownedBy = 1;
    tileAt(map, 0, 1)!.building = { kind: 'port', level: 1 };
    tileAt(map, 2, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.unit = shipUnit('s1', 1, 2, 0);
    tileAt(map, 4, 0)!.terrain = TileType.Water;
    tileAt(map, 4, 0)!.unit = pirate('p1', 4, 0);
    const player = aiPlayer({
      skills: ['water', 'navigation'],
      resources: { wood: 0, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'move' && a.unitId === 'crew')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: FAIL — the crew unit never plans a move onto the port.

- [ ] **Step 3: Implement `landEnemyCanReach` + the boarding pattern**

In `src/game/aiPatterns.ts`, next to `enemyCanReach` add:

```ts
/** Like `enemyCanReach` but ignoring pirates (owner -1): pirates never
 *  capture or occupy villages, so garrison/spawn decisions ignore them. */
export function landEnemyCanReach(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  return map.tiles.some(
    (t) =>
      t.unit &&
      t.unit.owner >= 0 &&
      t.unit.owner !== playerIndex &&
      isExploredFor(t, playerIndex) &&
      hexDistance(tile, t) <= UNIT_MOVEMENT[t.unit.type],
  );
}
```

Insert the pattern after `naval-build-port`:

```ts
  {
    id: 'naval-board-ship',
    priority: 76,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat) return null;
      if (!hasSkill(player, 'navigation')) return null;
      const port = map.tiles.find((t) => t.building !== null && t.building.kind === 'port' && t.ownedBy === player.index);
      if (!port) return null;
      if (state.occupied.has(key(port.q, port.r))) return null;
      const hasShip = map.tiles.some((t) => t.unit && t.unit.owner === player.index && t.unit.shipLevel !== undefined);
      if (hasShip) return null;
      const canClimb = hasSkill(player, 'climbing');
      let best: { unit: Unit; step: MapTile; dist: number } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // A unit that can strike an enemy this turn is pressing that fight.
        if (attackableTargets(map, unit, player.index).length > 0) continue;
        // Don't strip the last defender from a village a land enemy can reach.
        if (t.settlement && t.settlement.owner === player.index && landEnemyCanReach(map, t, player.index)) continue;
        const before = hexDistance(unit, port);
        for (const c of reachableTargets(map, unit, undefined, canClimb, true, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement && c.settlement.owner === player.index) continue;
          const after = hexDistance(c, port);
          if (after >= before) continue;
          if (!best || after < best.dist) best = { unit, step: c, dist: after };
        }
      }
      if (!best) return null;
      return [{ type: 'move', unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  },
```

`attackableTargets` is already imported (line 9); `Unit` is already imported (line 6); `hexDistance` is imported (line 8).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: PASS.

- [ ] **Step 5: Full AI test sweep**

Run: `npx vitest run tests/ai.test.ts tests/aiPatterns.test.ts tests/aiBehavior.test.ts tests/aiBehavior2.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/aiPatterns.ts tests/aiNaval.test.ts
git commit -m "feat(ai): board units onto a port while threatened"
```

---

### Task 6: `naval-hunt` pattern (ships sail & attack)

**Files:**
- Modify: `src/game/aiPatterns.ts`
- Test: `tests/aiNaval.test.ts`

**Interfaces:**
- Consumes: `situation.navalEnemies`; `shipAttackDistance` from `./ship`; existing `reachableTargets`, `hexDistance`.
- Produces: behavior only.

- [ ] **Step 1: Write the failing test**

Append to `tests/aiNaval.test.ts`:

```ts
describe('Naval hunting', () => {
  it('sails a ship into firing range of a pirate and attacks without stopping adjacent', () => {
    const map = makeTestMap(6);
    // Continuous water row r=0: ship at (0,0), pirate at (3,0). The ship has
    // move 2 and attack range 2, so the only reachable firing tile is (1,0)
    // (distance 2 from the pirate). It must NOT stop at (2,0), which is
    // adjacent to the pirate and invites a capture attempt.
    for (let q = 0; q <= 3; q++) tileAt(map, q, 0)!.terrain = TileType.Water;
    tileAt(map, 3, 0)!.unit = pirate('p1', 3, 0);
    tileAt(map, 0, 0)!.unit = shipUnit('ship1', 1, 0, 0);
    const player = aiPlayer({
      skills: ['water', 'navigation'],
      resources: { wood: 0, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const moveIdx = actions.findIndex((a) => a.type === 'move' && a.unitId === 'ship1');
    const attackIdx = actions.findIndex((a) => a.type === 'attack' && a.unitId === 'ship1');
    expect(moveIdx).toBeGreaterThanOrEqual(0);
    expect(attackIdx).toBe(moveIdx + 1);
    const move = actions[moveIdx]!;
    if (move.type === 'move') {
      expect(hexDistance({ q: move.q, r: move.r }, { q: 3, r: 0 })).toBe(2);
    }
    const attack = actions[attackIdx]!;
    if (attack.type === 'attack') {
      expect(attack.q).toBe(3);
      expect(attack.r).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: FAIL — the ship does not plan a move+attack toward the pirate.

- [ ] **Step 3: Implement the pattern**

In `src/game/aiPatterns.ts` add to the `./ship` import `shipAttackDistance` and `isShip` (create the import if it does not exist yet):

```ts
import { isShip, shipAttackDistance } from './ship';
```

Insert the pattern after `naval-board-ship`:

```ts
  {
    id: 'naval-hunt',
    priority: 75,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat) return null;
      if (situation.navalEnemies.length === 0) return null;
      const pirates = situation.navalEnemies.filter((e) => e.unit.type === 'pirate');
      const safeTile = (c: MapTile): boolean => !pirates.some((p) => hexDistance(c, p.tile) < 2);
      const canClimb = hasSkill(player, 'climbing');
      let best: { action: AiAction[]; score: number } | null = null;
      for (const t of map.tiles) {
        const ship = t.unit;
        if (!ship || ship.owner !== player.index || ship.shipLevel === undefined) continue;
        if (state.acted.has(ship.id) || state.moved.has(ship.id)) continue;
        const range = shipAttackDistance(ship);
        for (const e of situation.navalEnemies) {
          const enemyTile = e.tile;
          if (!enemyTile.unit) continue;
          const dist = hexDistance(ship, enemyTile);
          if (dist >= 2 && dist <= range) {
            const score = 600 - dist * 10;
            if (!best || score > best.score) {
              best = { action: [{ type: 'attack', unitId: ship.id, q: enemyTile.q, r: enemyTile.r }], score };
            }
            continue;
          }
          for (const c of reachableTargets(map, ship, undefined, canClimb, true, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (!safeTile(c)) continue;
            const nd = hexDistance(c, enemyTile);
            const moveDist = hexDistance(ship, c);
            if (nd >= 2 && nd <= range) {
              const score = 550 - nd * 10 - moveDist;
              if (!best || score > best.score) {
                best = {
                  action: [
                    { type: 'move', unitId: ship.id, q: c.q, r: c.r },
                    { type: 'attack', unitId: ship.id, q: enemyTile.q, r: enemyTile.r },
                  ],
                  score,
                };
              }
            } else if (nd < dist && nd >= 2) {
              const score = 250 - nd * 10 - moveDist;
              if (!best || score > best.score) {
                best = { action: [{ type: 'move', unitId: ship.id, q: c.q, r: c.r }], score };
              }
            }
          }
        }
      }
      if (!best) return null;
      return best.action;
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/aiPatterns.ts tests/aiNaval.test.ts
git commit -m "feat(ai): sail ships into range and hunt naval enemies"
```

---

### Task 7: `upgradeShip` AI action + `naval-upgrade-ship` pattern

**Files:**
- Modify: `src/game/aiTypes.ts`, `src/game/ai.ts`, `src/game/simulator.ts`, `src/game/aiPatterns.ts`
- Test: `tests/aiNaval.test.ts`

**Interfaces:**
- Consumes: `canUpgradeShip(unit, tile, player)` from `./ship` (already exists).
- Produces: `AiAction` union gains `{ type: 'upgradeShip'; unitId: string }`; the planner's `markUsed` and the simulator's AI turn execute it. Later tasks rely on the new `AiAction` member compiling cleanly.

- [ ] **Step 1: Write the failing test**

Append to `tests/aiNaval.test.ts`:

```ts
describe('Naval ship upgrades', () => {
  it('plans to upgrade an idle ship while threatened and affordable', () => {
    const map = makeTestMap(6);
    // Owned water tile under the ship so it may be upgraded there.
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 0)!.unit = shipUnit('ship1', 1, 0, 0);
    tileAt(map, 3, 0)!.terrain = TileType.Water;
    tileAt(map, 3, 0)!.unit = pirate('p1', 3, 0);
    const player = aiPlayer({
      skills: ['water', 'navigation'],
      resources: { wood: 10, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const up = actions.find((a) => a.type === 'upgradeShip' && a.unitId === 'ship1');
    expect(up).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: FAIL (test errors) — `upgradeShip` is not a valid `AiAction` type.

- [ ] **Step 3: Implement the action plumbing**

In `src/game/aiTypes.ts` add to the `AiAction` union:

```ts
  | { type: 'upgradeShip'; unitId: string }
```

In `src/game/ai.ts` `markUsed` add a case:

```ts
    case 'upgradeShip':
      state.acted.add(action.unitId);
      break;
```

In `src/game/simulator.ts` `runAiTurn` switch add:

```ts
        case 'upgradeShip':
          this.doUpgradeShip(a.unitId);
          break;
```

In `src/game/aiPatterns.ts`, extend the `./ship` import with `canUpgradeShip`, and insert this pattern after `naval-hunt`:

```ts
  {
    id: 'naval-upgrade-ship',
    priority: 74,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat) return null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.shipLevel === undefined || unit.shipLevel >= 3) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (!canUpgradeShip(unit, t, player)) continue;
        return [{ type: 'upgradeShip', unitId: unit.id }];
      }
      return null;
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + simulator test sweep**

Run: `npm run typecheck && npx vitest run tests/simulator.test.ts tests/ship.test.ts tests/optimisticUpdate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/aiTypes.ts src/game/ai.ts src/game/simulator.ts src/game/aiPatterns.ts tests/aiNaval.test.ts
git commit -m "feat(ai): upgrade ships while threatened"
```

---

### Task 8: Catapult response — `naval` spawn preference + `naval-position-catapult`

**Files:**
- Modify: `src/game/aiPatterns.ts`, `src/game/ai.ts`
- Test: `tests/aiNaval.test.ts`

**Interfaces:**
- Consumes: `situation.navalThreat`, `situation.nearestNaval`, `situation.navalEnemies`; `coastExposedTile`/`isNavalEnemy` (Task 2); `bestSpawnableUnitType`; `attackableTargets`.
- Produces: `SpawnPreference` union gains `'naval'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/aiNaval.test.ts`:

```ts
describe('Naval catapults', () => {
  function catapultMap(): ReturnType<typeof makeTestMap> {
    const map = makeTestMap(6);
    // Catapult at (0,0), pirate at (5,0): distance 5, out of range. The only
    // land step that closes to firing range (distance 4) is (1,0); the two
    // alternate approach tiles (1,1) and (1,-1) are water so the choice is
    // deterministic. (1,0) is distance 4 -> safe from the pirate's range 3.
    tileAt(map, 0, 0)!.unit = makeUnit('cat1', 1, 'catapult', 0, 0);
    tileAt(map, 1, 0);
    tileAt(map, 1, 1)!.terrain = TileType.Water;
    tileAt(map, 1, -1)!.terrain = TileType.Water;
    tileAt(map, 5, 0)!.terrain = TileType.Water;
    tileAt(map, 5, 0)!.unit = pirate('p1', 5, 0);
    return map;
  }

  it('moves an idle catapult into firing range of the pirate', () => {
    const player = aiPlayer({
      skills: ['science', 'catapult'],
      resources: { wood: 0, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(catapultMap(), player, new SeededRandom(1), 'capture');
    const move = actions.find((a) => a.type === 'move' && a.unitId === 'cat1');
    expect(move).toBeDefined();
    if (move && move.type === 'move') {
      expect(move.q).toBe(1);
      expect(move.r).toBe(0);
    }
  });

  it('spawns a catapult instead of a land attacker while the coast is threatened', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 1)!.ownedBy = 1;
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.ownedBy = 1;
    tileAt(map, 4, 0)!.terrain = TileType.Water;
    tileAt(map, 4, 0)!.unit = pirate('p1', 4, 0);
    const player = aiPlayer({
      skills: ['science', 'catapult', 'water'],
      resources: { wood: 100, stone: 0, money: 100, ore: 10 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'spawn' && a.unitType === 'catapult')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: FAIL — catapult unit neither moves to the firing tile nor is spawned as a catapult.

- [ ] **Step 3: Implement the spawn preference and the positioning pattern**

In `src/game/aiPatterns.ts`:

Extend `SpawnPreference` and `SPAWN_ORDER`:

```ts
export type SpawnPreference = 'offense' | 'defense' | 'scout' | 'naval';

const SPAWN_ORDER: Record<SpawnPreference, UnitType[]> = {
  offense: ['knight', 'swordsman', 'catapult', 'warrior', 'rider', 'archer', 'shield'],
  defense: ['shield', 'knight', 'catapult', 'archer', 'swordsman', 'warrior', 'rider'],
  scout: ['rider', 'knight', 'swordsman', 'warrior', 'archer', 'shield', 'catapult'],
  naval: ['catapult', 'archer', 'shield', 'warrior', 'rider', 'swordsman', 'knight'],
};
```

Extend the `./aiSituation` import with the new helpers:

```ts
import { AiSituation, coastExposedTile, isMelee, isNavalEnemy } from './aiSituation';
```

Insert the pattern after `naval-upgrade-ship`:

```ts
  {
    id: 'naval-position-catapult',
    priority: 73,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat || !situation.nearestNaval) return null;
      if (!hasSkill(player, 'catapult')) return null;
      const naval = situation.nearestNaval;
      const canClimb = hasSkill(player, 'climbing');
      let best: { unit: Unit; step: MapTile; score: number } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== 'catapult') continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // Already able to fire: leave it to the attack logic.
        if (attackableTargets(map, unit, player.index).some((a) => a.unit && isNavalEnemy(a.unit))) continue;
        for (const c of reachableTargets(map, unit, undefined, canClimb, false, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement) continue;
          const after = hexDistance(c, naval.tile);
          const before = hexDistance(unit, naval.tile);
          if (after >= before || after > 4) continue;
          if (coastExposedTile(map, c, situation.navalEnemies)) continue;
          const score = -after;
          if (!best || score > best.score) best = { unit, step: c, score };
        }
      }
      if (!best) return null;
      return [{ type: 'move', unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  },
```

In `src/game/ai.ts` `bestAvailableAction`, change the spawn `prefer` selection to prefer `'naval'` while threatened (after land threats, before scout/offense):

```ts
      const prefer =
        threatened || situation?.stance === 'defend'
          ? 'defense'
          : situation?.navalThreat
            ? 'naval'
            : situation?.stance === 'settle' && freeVillageToGrab
              ? 'scout'
              : 'offense';
```

`threatened` is already computed above as `enemyCanReach(map, v, player.index)`. Replace that line so pirates no longer force a pure-defense spawn (pirates cannot capture villages — this is the farming fix):

```ts
      const threatened = landEnemyCanReach(map, v, player.index);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: PASS.

- [ ] **Step 5: Full AI sweep + typecheck**

Run: `npm run typecheck && npx vitest run tests/ai.test.ts tests/aiBehavior.test.ts tests/aiPatterns.test.ts tests/aiEconomy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/aiPatterns.ts src/game/ai.ts tests/aiNaval.test.ts
git commit -m "feat(ai): use catapults to shell naval threats from the shore"
```

---

### Task 9: Defensive guards — no coastal farming, no naval chases, bridge gating

**Files:**
- Modify: `src/game/aiPatterns.ts`, `src/game/ai.ts`, `src/game/bridges.ts`
- Test: `tests/aiNaval.test.ts`

**Interfaces:**
- Consumes: `isNavalEnemy`, `coastExposedTile`, `isShip`, existing `enemyCanReach`/`enemyCanAttackNext`.
- Produces: no new public symbols (one new export `bridgeLeadsSomewhere` is optional and private is fine).

- [ ] **Step 1: Write the failing tests**

Append to `tests/aiNaval.test.ts`:

```ts
describe('Naval defensive guards', () => {
  it('keeps a melee unit from marching toward or attacking an unreachable pirate', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.unit = makeUnit('w1', 1, 'warrior', 0, 0);
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.unit = pirate('p1', 2, 0);
    const player = aiPlayer({ resources: { wood: 0, stone: 0, money: 100, ore: 0 } });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'attack' && a.q === 2 && a.r === 0)).toBe(false);
    const start = hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 });
    for (const a of actions) {
      if (a.type === 'move' && a.unitId === 'w1') {
        expect(hexDistance({ q: a.q, r: a.r }, { q: 2, r: 0 })).toBeGreaterThanOrEqual(start);
      }
    }
  });

  it('does not drop a fresh unit into an empty coastal village a pirate can hit', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.unit = pirate('p1', 1, 0);
    const player = aiPlayer({
      skills: ['shields'],
      resources: { wood: 0, stone: 0, money: 100, ore: 3 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'spawn')).toBe(false);
  });

  it('skips bridge building while a naval threat is active', () => {
    const map = makeTestMap(6);
    // Two own land tiles with a water gap between them -> buildable bridge.
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 2, 0)!.ownedBy = 1;
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    // Pirate elsewhere on the coast to create the threat.
    tileAt(map, 0, -3)!.terrain = TileType.Water;
    tileAt(map, 0, -3)!.unit = pirate('p1', 0, -3);
    tileAt(map, 0, 0)!.unit = makeUnit('w1', 1, 'warrior', 0, 0);
    const player = aiPlayer({
      skills: ['riding', 'bridges'],
      resources: { wood: 100, stone: 100, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'buildBridge')).toBe(false);
  });

  it('does not build a pointless bridge across a gap between two quiet own tiles when unthreatened', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 2, 0)!.ownedBy = 1;
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    const player = aiPlayer({
      skills: ['riding', 'bridges'],
      resources: { wood: 100, stone: 100, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'buildBridge')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/aiNaval.test.ts`
Expected: FAIL — under current behavior the village spawns a shield (feeding the pirate) and the unthreatened bridge test plans a bridge.

- [ ] **Step 3: Implement the guards**

In `src/game/aiPatterns.ts`:

1. `hunt-idle-enemy` (currently priority 78) — skip naval enemies entirely; they cannot be reached by land chases and ships have their own `naval-hunt` pattern. In its `evaluate`, inside `for (const e of situation.enemies)` add as the first line:

```ts
          if (isNavalEnemy(e.unit)) continue;
```

2. `explore-frontier` — add `situation` to its destructured params and skip exposed tiles for land units that are not catapults/ships:

```ts
    evaluate({ map, player, state, situation }): AiAction[] | null {
      ...
        for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (situation?.navalThreat && !isShip(unit) && unit.type !== 'catapult' && coastExposedTile(map, c, situation.navalEnemies)) continue;
          ...
        }
```

3. `defend-empty-village` and `garrison-empty-village` — use `landEnemyCanReach` instead of `enemyCanReach` (pirates can't occupy villages, so don't feed them garrisons):

```ts
        if (!landEnemyCanReach(map, v, player.index)) continue;
```

in both places where they currently call `enemyCanReach(map, v, player.index)`.

Also update the `./ship` import if `isShip` was not added in Task 6:

```ts
import { canUpgradeShip, isShip, shipAttackDistance } from './ship';
```

In `src/game/ai.ts`:

4. Generic move scoring — add the exposure penalty. Add a constant near the top:

```ts
/** Strong penalty for idle land units standing where a naval enemy can hit. */
const NAVAL_EXPOSURE_PENALTY = 400;
```

In `bestAvailableAction`, inside the candidate move loop, right before the `if (s > bestMoveScore)` comparison in the no-attack branch, apply the penalty (a land catapult is exempt; ships can't stand on land):

```ts
      if (situation?.navalThreat && !isShip(unit) && unit.type !== 'catapult' && coastExposedTile(map, c, situation.navalEnemies)) {
        const canStrike = attackableTargets(map, ghost, unit.owner).some((a) => a.unit && isNavalEnemy(a.unit));
        if (!canStrike && !(c.settlement && c.settlement.owner === unit.owner)) s -= NAVAL_EXPOSURE_PENALTY;
      }
```

Add to imports in `ai.ts`:
- from `./combat`: add `attackableTargets` to the existing `chooseBestAttack, tradeIsFavorable` import.
- from `./aiSituation`: add `coastExposedTile`, `isNavalEnemy` to the existing `AiSituation, analyzeSituation` import.
- from `./ship`: add `isShip` (new import line).

5. Spawn guard — don't feed pirates. A freshly spawned unit cannot act the
   turn it is created, so spawning one in an empty village that a pirate can
   already hit just feeds the pirate. In `bestAvailableAction`, right where the
   spawn candidate is pushed (after `const threatened = ...`), skip the spawn
   when the village is under pirate guns and no *land* enemy justifies it:

```ts
      if (
        situation?.navalThreat &&
        !threatened &&
        navalCanStrikeTile(v, situation.navalEnemies)
      ) {
        continue;
      }
```

   (`threatened` is computed from `landEnemyCanReach` — see Task 8 — so a real
   land threat still permits a defender spawn.) Import `navalCanStrikeTile`
   from `./aiSituation` in `ai.ts`.

6. Bridge gating. Add a local helper above `bestAvailableAction`:

```ts
/** A bridge pays off only when its far shore leads to something worth
 *  crossing for: unexplored ground, a foreign/free settlement, or foreign
 *  territory. */
function bridgeLeadsSomewhere(map: GameMap, tile: MapTile, player: Player): boolean {
  const dir = bridgeDirFor(map, tile);
  if (!dir) return false;
  for (const o of bridgeCoastOffsets(dir)) {
    const shore = tileAt(map, tile.q + o.q, tile.r + o.r);
    if (!shore) continue;
    if (!isExploredFor(shore, player.index)) return true;
    if (shore.settlement && shore.settlement.owner !== player.index) return true;
    if (shore.ownedBy !== null && shore.ownedBy !== player.index) return true;
  }
  return false;
}
```

Then in the bridge candidate loop, add the threat skip and the worth gate:

```ts
  for (const tile of map.tiles) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildBridge(map, tile, player)) continue;
    if (!canAfford(player.resources, BRIDGE_COST)) continue;
    if (situation?.navalThreat) continue;
    const touchesOwnNetwork = hexNeighbors(tile).some((n) => {
      const t = tileAt(map, n.q, n.r);
      return t !== undefined && (t.ownedBy === player.index || t.roadOwner === player.index);
    });
    if (!touchesOwnNetwork) continue;
    if (!bridgeLeadsSomewhere(map, tile, player)) continue;
    candidates.push({ score: 250 + jitter(), action: { type: 'buildBridge', q: tile.q, r: tile.r } });
  }
```

Extend the `./bridges` import in `ai.ts`:

```ts
import { bridgeCoastOffsets, bridgeDirFor, canBuildBridge, BRIDGE_COST } from './bridges';
```

Note: the existing test in `tests/ai.test.ts`, "plans a bridge over a water gap when it has the skill and owns a shore", spans a water tile between two AI-owned land tiles with no far-shore value, so the new worth gate would reject it. Update its map so the far shore carries a free settlement — replace this line:

```ts
  const tiles = [makeTile(0, 0, 1), makeTile(1, 0, null), makeTile(2, 0, 1)];
```

with:

```ts
  const tiles = [makeTile(0, 0, 1), makeTile(1, 0, null), makeTile(2, 0, 1, { owner: null, level: 1, captureReady: false })];
```

The test's assertion (`actions.some((a) => a.type === 'buildBridge')`) stays unchanged.

- [ ] **Step 4: Run tests to verify they pass, and fix the existing bridge test**

Run: `npx vitest run tests/aiNaval.test.ts tests/ai.test.ts`
Expected: PASS. In `tests/ai.test.ts` the bridge test at line ~204 now needs a valuable far shore (see note) — adjust its map (e.g. put a free village `{ owner: null }` on tile (2,0)) and re-run.

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/aiPatterns.ts src/game/ai.ts src/game/bridges.ts tests/aiNaval.test.ts tests/ai.test.ts
git commit -m "feat(ai): stop coastal farming and gate pointless bridges"
```

---

### Task 10: Integration and acceptance

**Files:** none (verification + optional tweaks).

- [ ] **Step 1: Full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 2: Review the diff for unintended behavior**

Read the diff: `git diff master -- src/game/ai.ts src/game/aiPatterns.ts src/game/aiSituation.ts src/game/aiDifficulty.ts src/game/aiTypes.ts src/game/simulator.ts`
Check:
- No new pattern fires outside `situation.navalThreat`.
- No `GAME.md`, balance, or UI files changed.
- Threat stand-down is automatic: every naval pattern is gated on the freshly computed `situation.navalThreat`, so no explicit teardown code is needed.

- [ ] **Step 3: Commit any residual tweaks**

```bash
git add -u
git commit -m "chore(ai): final naval response integration"
```
