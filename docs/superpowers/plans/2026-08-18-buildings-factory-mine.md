# Buildings (Factory & Mine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-tile wood/stone income with buildable **factories** (wood from adjacent forests) and **mines** (stone from the mountain they stand on), keeping money/wood/stone as the three resources.

**Architecture:** Add `Building` to the `MapTile` model (no owner field — ownership is derived from `tile.ownedBy`, so buildings transfer with the village that owns their tile). New pure module `src/game/buildings.ts` holds costs, placement checks, build action, and end-of-round income. The old tile-income paths (`collectTerrainIncome`, `collectTileResource`, manual collect) are removed; `gameController` wires `buildingIncome` into the turn-end loop. Rendering draws each building as two small squares; the toolbar exposes build buttons.

**Tech Stack:** TypeScript, PixiJS 8, React (toolbar), Zustand (store), Vitest.

## Global Constraints

- Resources stay `{ wood, stone, money }`; `resources.ts` (`canAfford`, `pay`, `START_RESOURCES`, `UPGRADE_COST`) is unchanged.
- Costs: `FACTORY_COST = 10`, `MINE_COST = 15` (money only).
- Factory placement: tile owned by the builder, `isLandType`, no settlement, no building, at least one neighbor (`hexNeighbors`) that is a forest tile (`isForestType`) — the forest's ownership is irrelevant.
- Mine placement: tile owned by the builder, `isMountainType`, no settlement, no building.
- One building per tile; units and buildings coexist; buildings never occupy settlement tiles.
- `Building = { kind: 'factory' | 'mine'; level: number }`, defined in `mapGen.ts`; `MapTile.building: Building | null`.
- Income: wood = Σ per owned factory of `level × (# adjacent forests)`; stone = Σ per owned mine of `level`. A forest adjacent to two factories is counted twice.
- AI does not build (deferred). Build UI is human-only.
- Money income from villages (`villageIncome`) is unchanged.
- Every task ends with `npm run typecheck` green and `npm test` green.

---

### Task 1: Building model + pure logic

**Files:**
- Modify: `src/game/mapGen.ts` (add `Building` interface + `MapTile.building`, init in `generateMap`)
- Create: `src/game/buildings.ts`
- Test: `tests/buildings.test.ts` (new)
- Modify MapTile test literals (add `building: null`): `tests/tilePick.test.ts`, `tests/textureFactory.test.ts`, `tests/claim.test.ts`, `tests/ai.test.ts`, `tests/combat.test.ts`, `tests/village.test.ts`, `tests/selection.test.ts`, `tests/spawn.test.ts`, `tests/capture.test.ts`

**Interfaces:**
- Produces (used by Tasks 2–3):
  - `export interface Building { kind: 'factory' | 'mine'; level: number }` in `mapGen.ts`
  - `MapTile.building: Building | null`
  - `export const FACTORY_COST = 10` / `export const MINE_COST = 15` in `buildings.ts`
  - `canBuildFactory(map: GameMap, tile: MapTile, playerIndex: number): boolean`
  - `canBuildMine(map: GameMap, tile: MapTile, playerIndex: number): boolean`
  - `buildBuilding(map: GameMap, tile: MapTile, kind: 'factory' | 'mine', player: Player): boolean`
  - `buildingIncome(map: GameMap, playerIndex: number): { wood: number; stone: number }`

- [ ] **Step 1: Write the failing tests** — create `tests/buildings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import {
  buildBuilding,
  buildingIncome,
  canBuildFactory,
  canBuildMine,
  FACTORY_COST,
  MINE_COST,
} from '../src/game/buildings';

function tile(
  q: number,
  r: number,
  terrain: TileType,
  ownedBy: number | null,
  settlement: Settlement | null = null,
  building: MapTile['building'] = null,
): MapTile {
  return { q, r, terrain, settlement, unit: null, ownedBy, claimedByVillage: null, building };
}

function player(money: number): import('../src/game/players').Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'p',
    resources: { wood: 0, stone: 0, money },
    isActive: true,
  };
}

// (1,0),(1,-1),(0,-1),(-1,0),(-1,1),(0,1) are the neighbors of (0,0).

describe('canBuildFactory', () => {
  it('requires an owned land tile adjacent to a forest', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 1));
    expect(canBuildFactory(map, land, 0)).toBe(true);
  });

  it('rejects unowned, non-land, forestless, settlement, and already-built tiles', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const unowned = tile(0, 0, TileType.GrasslandLand, null);
    map.tiles.push(unowned);
    expect(canBuildFactory(map, unowned, 0)).toBe(false);

    const forest = tile(0, 0, TileType.GrasslandForest, 0);
    map.tiles.push(forest, tile(1, 0, TileType.GrasslandForest, 0));
    expect(canBuildFactory(map, forest, 0)).toBe(false);

    const noForest = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(noForest);
    expect(canBuildFactory(map, noForest, 0)).toBe(false);

    const withSettlement = tile(0, 0, TileType.GrasslandLand, 0, { owner: 0, level: 1, captureReady: false });
    map.tiles.push(withSettlement);
    expect(canBuildFactory(map, withSettlement, 0)).toBe(false);

    const built = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'factory', level: 1 });
    map.tiles.push(built);
    expect(canBuildFactory(map, built, 0)).toBe(false);
  });
});

describe('canBuildMine', () => {
  it('requires an owned mountain tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const mountain = tile(0, 0, TileType.GrasslandMountain, 0);
    map.tiles.push(mountain);
    expect(canBuildMine(map, mountain, 0)).toBe(true);
    const unowned = tile(1, 0, TileType.GrasslandMountain, null);
    map.tiles.push(unowned);
    expect(canBuildMine(map, unowned, 0)).toBe(false);
    const land = tile(0, 1, TileType.GrasslandLand, 0);
    map.tiles.push(land);
    expect(canBuildMine(map, land, 0)).toBe(false);
  });
});

describe('buildBuilding', () => {
  it('builds a factory, deducts 10 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 0));
    const p = player(20);
    expect(buildBuilding(map, land, 'factory', p)).toBe(true);
    expect(p.resources.money).toBe(20 - FACTORY_COST);
    expect(land.building).toEqual({ kind: 'factory', level: 1 });
  });

  it('builds a mine, deducts 15 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const mountain = tile(0, 0, TileType.GrasslandMountain, 0);
    map.tiles.push(mountain);
    const p = player(20);
    expect(buildBuilding(map, mountain, 'mine', p)).toBe(true);
    expect(p.resources.money).toBe(20 - MINE_COST);
    expect(mountain.building).toEqual({ kind: 'mine', level: 1 });
  });

  it('fails without enough money and does not place the building', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 0));
    const p = player(FACTORY_COST - 1);
    expect(buildBuilding(map, land, 'factory', p)).toBe(false);
    expect(land.building).toBeNull();
  });
});

describe('buildingIncome', () => {
  it('factory yields level wood per adjacent forest', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const f1 = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'factory', level: 1 });
    map.tiles.push(
      f1,
      tile(1, 0, TileType.GrasslandForest, 0),
      tile(1, -1, TileType.GrasslandForest, 1),
    );
    expect(buildingIncome(map, 0)).toEqual({ wood: 2, stone: 0 });
  });

  it('two factories near the same forest count it twice', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'factory', level: 1 }),
      tile(1, 0, TileType.GrasslandLand, 0, null, { kind: 'factory', level: 1 }),
      tile(0, 1, TileType.GrasslandForest, 0),
    );
    expect(buildingIncome(map, 0).wood).toBe(2);
  });

  it('factory level multiplies income', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'factory', level: 3 }),
      tile(1, 0, TileType.GrasslandForest, 0),
    );
    expect(buildingIncome(map, 0).wood).toBe(3);
  });

  it('mine yields level stone', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandMountain, 0, null, { kind: 'mine', level: 1 }),
      tile(1, 0, TileType.GrasslandMountain, 0, null, { kind: 'mine', level: 2 }),
    );
    expect(buildingIncome(map, 0)).toEqual({ wood: 0, stone: 3 });
  });

  it('income follows tile ownership (buildings transfer with the village)', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const factoryTile = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'factory', level: 1 });
    map.tiles.push(factoryTile, tile(1, 0, TileType.GrasslandForest, 1));
    expect(buildingIncome(map, 0).wood).toBe(1);
    factoryTile.ownedBy = 1;
    expect(buildingIncome(map, 0).wood).toBe(0);
    expect(buildingIncome(map, 1).wood).toBe(1);
  });

  it('ignores buildings on tiles owned by other players', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, TileType.GrasslandMountain, 1, null, { kind: 'mine', level: 1 }));
    expect(buildingIncome(map, 0)).toEqual({ wood: 0, stone: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/buildings.test.ts`
Expected: FAIL — `Cannot find module '../src/game/buildings'` (and the `building` field does not exist yet).

- [ ] **Step 3: Add `Building` to `src/game/mapGen.ts`**

Add after the `Settlement` interface (line 14):

```ts
export interface Building {
  kind: 'factory' | 'mine';
  level: number;
}
```

Add `building` to `MapTile` (after `settlement`), and `resourceCollected` removal is NOT part of this task:

```ts
  settlement: Settlement | null;
  building: Building | null;
```

Initialize it in `generateMap`'s tile construction (the object literal inside the `for (const t of tiles)` loop, after `settlement: null`):

```ts
      settlement: null,
      building: null,
```

- [ ] **Step 4: Create `src/game/buildings.ts`**

```ts
import { hexNeighbors } from './hex';
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { isForestType, isLandType, isMountainType } from './tileTypes';

export const FACTORY_COST = 10;
export const MINE_COST = 15;

function neighborTile(map: GameMap, n: { q: number; r: number }): MapTile | undefined {
  return map.tiles.find((t) => t.q === n.q && t.r === n.r);
}

export function canBuildFactory(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  if (tile.ownedBy !== playerIndex) return false;
  if (tile.settlement || tile.building) return false;
  if (!isLandType(tile.terrain)) return false;
  return hexNeighbors(tile).some((n) => {
    const t = neighborTile(map, n);
    return t !== undefined && isForestType(t.terrain);
  });
}

export function canBuildMine(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  if (tile.ownedBy !== playerIndex) return false;
  if (tile.settlement || tile.building) return false;
  return isMountainType(tile.terrain);
}

export function buildBuilding(
  map: GameMap,
  tile: MapTile,
  kind: 'factory' | 'mine',
  player: Player,
): boolean {
  const allowed =
    kind === 'factory' ? canBuildFactory(map, tile, player.index) : canBuildMine(map, tile, player.index);
  if (!allowed) return false;
  const cost = kind === 'factory' ? FACTORY_COST : MINE_COST;
  if (player.resources.money < cost) return false;
  player.resources.money -= cost;
  tile.building = { kind, level: 1 };
  return true;
}

export function buildingIncome(
  map: GameMap,
  playerIndex: number,
): { wood: number; stone: number } {
  let wood = 0;
  let stone = 0;
  for (const tile of map.tiles) {
    if (tile.ownedBy !== playerIndex || !tile.building) continue;
    if (tile.building.kind === 'mine') {
      stone += tile.building.level;
      continue;
    }
    const forests = hexNeighbors(tile).filter((n) => {
      const t = neighborTile(map, n);
      return t !== undefined && isForestType(t.terrain);
    }).length;
    wood += tile.building.level * forests;
  }
  return { wood, stone };
}
```

- [ ] **Step 5: Add `building: null` to every MapTile literal helper in tests**

For each file below, append `, building: null` at the end of the MapTile object literal (after `claimedByVillage`). Exact changes:

- `tests/tilePick.test.ts` — in the `tile()` helper return: `claimedByVillage: null,` → `claimedByVillage: null,\n    building: null,`
- `tests/textureFactory.test.ts` — same pattern in its `tile()` helper.
- `tests/claim.test.ts:7` — `return { q, r, terrain: TileType.GrasslandLand, settlement: null, unit: null, ownedBy, claimedByVillage };` → add `, building: null`.
- `tests/ai.test.ts:16` — `return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy, claimedByVillage: null };` → add `, building: null`.
- `tests/combat.test.ts:13` — `return { q, r, terrain, settlement: null, unit, ownedBy: null, claimedByVillage: null };` → add `, building: null`.
- `tests/village.test.ts:12` — `return { q, r, terrain: TileType.GrasslandLand, settlement, unit: null, ownedBy, claimedByVillage: null };` → add `, building: null`.
- `tests/selection.test.ts:22` — `return { q, r, terrain, settlement, unit, ownedBy: null, claimedByVillage: null };` → add `, building: null`.
- `tests/spawn.test.ts:14` — `return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy: settlement ? settlement.owner : null, claimedByVillage: null };` → add `, building: null`.
- `tests/capture.test.ts` — three literals: `makeTile` (line 14), `incomeTile` (line 135), `resourceTile` (line 176) — each `... claimedByVillage: null };` → add `, building: null`.

- [ ] **Step 6: Run typecheck and full test suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all pass (existing 167 + new buildings tests).

- [ ] **Step 7: Commit**

```bash
git add src/game/mapGen.ts src/game/buildings.ts tests/buildings.test.ts tests/tilePick.test.ts tests/textureFactory.test.ts tests/claim.test.ts tests/ai.test.ts tests/combat.test.ts tests/village.test.ts tests/selection.test.ts tests/spawn.test.ts tests/capture.test.ts
git commit -m "feat: add factory and mine buildings with building income"
```

---

### Task 2: Remove old tile income, wire building income

**Files:**
- Modify: `src/game/units.ts` (remove `hasCollected` field + `canCollect` + guard clauses)
- Modify: `src/game/mapGen.ts` (remove `hasCollected` from unit construction, remove `resourceCollected` from `MapTile`)
- Modify: `src/game/spawn.ts` (remove `hasCollected` from unit construction)
- Modify: `src/game/capture.ts` (remove `tileResourceYield`, `collectTerrainIncome`, `collectTileResource`)
- Modify: `src/controller/gameController.ts` (remove `collectSelectedUnitResources`, replace terrain income with `buildingIncome`, drop `hasCollected`/`resourceCollected` resets)
- Modify: `src/screens/hud/ActionToolbar.tsx` (remove Collect button + unused imports)
- Modify tests: `tests/units.test.ts`, `tests/capture.test.ts`, `tests/ai.test.ts`, `tests/combat.test.ts`, `tests/selection.test.ts`, `tests/spawn.test.ts`

**Interfaces:**
- Consumes: `buildingIncome(map, playerIndex)` from Task 1.
- Produces: `Unit` has no `hasCollected`; `MapTile` has no `resourceCollected`; `capture.ts` no longer exports `tileResourceYield`/`collectTerrainIncome`/`collectTileResource`; `units.ts` no longer exports `canCollect`.

- [ ] **Step 1: Remove `hasCollected` and `canCollect` from `src/game/units.ts`**

Remove `hasCollected: boolean;` from the `Unit` interface (line 27).

Replace `canMove` (lines 62–69) with:

```ts
export function canMove(unit: Unit): boolean {
  return (
    !unit.hasMoved &&
    !unit.hasHealed &&
    (unit.type === 'rider' || !unit.hasAttacked)
  );
}
```

Replace `canAttack` (lines 75–77) with:

```ts
export function canAttack(unit: Unit): boolean {
  return !unit.hasAttacked && !unit.hasHealed;
}
```

Replace `canHeal` (lines 79–87) with:

```ts
export function canHeal(unit: Unit): boolean {
  return (
    !unit.hasMoved &&
    !unit.hasAttacked &&
    !unit.hasHealed &&
    unit.hp < UNIT_TYPES[unit.type].maxHp
  );
}
```

Delete `canCollect` entirely (lines 89–91).

- [ ] **Step 2: Remove `hasCollected` from unit construction in `src/game/mapGen.ts`**

In `generateMap`'s unit construction (around line 163–166), delete the `hasCollected: false,` line. Also delete `resourceCollected?: boolean;` from the `MapTile` interface (line 28).

- [ ] **Step 3: Remove `hasCollected` from `src/game/spawn.ts`**

In the constructed unit (around line 27), delete `hasCollected: true,`.

- [ ] **Step 4: Remove the tile-income functions from `src/game/capture.ts`**

Delete `tileResourceYield`, `collectTerrainIncome`, and `collectTileResource` (lines 20–56). Keep `setCaptureReady`, `villageIncome`, `captureVillage`. After removal, the file imports `isForestType, isMountainType` and `Player`/`Unit` may become unused — verify and prune: keep only what `setCaptureReady`, `villageIncome`, `captureVillage` use (`GameMap`, `MapTile`, `villageCapacity`, `unitsInVillage`; drop `Unit`, `Player`, `isForestType`, `isMountainType`, `TileType`).

- [ ] **Step 5: Update `src/controller/gameController.ts`**

Delete the `collectSelectedUnitResources()` method (lines 495–510).

Import `buildingIncome`:

```ts
import { buildingIncome } from '../game/buildings';
```

In `runAiPhase`, remove `t.unit.hasCollected = false;` (line 628) and `t.resourceCollected = false;` (line 630) from the reset loop.

Replace the terrain income block (lines 640–642):

```ts
      const terrain = collectTerrainIncome(this.map, player.index);
      player.resources.wood += terrain.wood;
      player.resources.stone += terrain.stone;
```

with:

```ts
      const buildings = buildingIncome(this.map, player.index);
      player.resources.wood += buildings.wood;
      player.resources.stone += buildings.stone;
```

- [ ] **Step 6: Update `src/screens/hud/ActionToolbar.tsx`**

Remove the imports `canCollect` and `tileResourceYield`. Change the import line to:

```ts
import { canHeal, UNIT_TYPES } from '../../game/units';
```

and delete `import { tileResourceYield } from '../../game/capture';`.

Remove the `gained` computation and the whole Collect button block (lines 52, 58–63), leaving only the Heal button:

```ts
  if (unit && unit.owner === 0) {
    canHeal(unit) && buttons.push(
      <button key="heal" disabled={!canHeal(unit)} onClick={() => gameController.healSelectedUnit()}>
        Heal +2 HP
      </button>,
    );
  }
```

- [ ] **Step 7: Update the affected tests**

`tests/units.test.ts`:
- Remove `canCollect,` from the import.
- Delete `hasCollected: false,` from `makeUnit`.
- Delete these assertions: line 46 (`canMove(makeUnit({ hasCollected: true }))`), line 59 (`canAttack(makeUnit({ hasCollected: true }))`), line 67 (`canHeal(makeUnit({ hp: 3, hasCollected: true }))`).
- Delete the whole `'canCollect: only as a first action'` test (lines 70–76).

`tests/capture.test.ts`:
- Change the import (line 6) to: `import { captureVillage, setCaptureReady, villageIncome } from '../src/game/capture';`
- Delete `hasCollected: false,` from `makeUnit` (line 18).
- Delete the `collectTerrainIncome`, `tileResourceYield`, and `collectTileResource` describe blocks (lines 133–225) — that is, everything from `describe('collectTerrainIncome'` to the end of the file.

`tests/ai.test.ts` (line 20): delete `hasCollected: false,` from the unit literal.
`tests/combat.test.ts` (lines 17, 87, 98): delete `hasCollected: false,` from the three unit literals.
`tests/selection.test.ts` (lines 35, 50, 143): delete `hasCollected: false,` from the unit literals.
`tests/spawn.test.ts` (lines 40, 42, 62, 71): delete `hasCollected: false,` from the unit literals; change line 92 from `expect(village.unit!.hasCollected).toBe(true);` to `expect(village.unit!.hasMoved).toBe(true);`.

- [ ] **Step 8: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass (buildings tests + remaining suite).

- [ ] **Step 9: Commit**

```bash
git add src/game/units.ts src/game/mapGen.ts src/game/spawn.ts src/game/capture.ts src/controller/gameController.ts src/screens/hud/ActionToolbar.tsx tests/units.test.ts tests/capture.test.ts tests/ai.test.ts tests/combat.test.ts tests/selection.test.ts tests/spawn.test.ts
git commit -m "feat: replace tile income with building income, remove manual collect"
```

---

### Task 3: Build action, toolbar buttons, and rendering

**Files:**
- Modify: `src/render/textureFactory.ts` (add `factoryTexture`/`mineTexture` to `TextureSet`)
- Modify: `src/render/mapRenderer.ts` (draw building sprite)
- Modify: `src/controller/gameController.ts` (add `buildSelectedBuilding`)
- Modify: `src/screens/hud/ActionToolbar.tsx` (add Build buttons)

**Interfaces:**
- Consumes: `buildBuilding`, `canBuildFactory`, `canBuildMine`, `FACTORY_COST`, `MINE_COST` from `buildings.ts`; `Building` from `mapGen.ts`.
- Produces: `TextureSet.factoryTexture: Texture`, `TextureSet.mineTexture: Texture`; `gameController.buildSelectedBuilding(kind: 'factory' | 'mine'): void`.

- [ ] **Step 1: Add building textures to `src/render/textureFactory.ts`**

Add `factoryTexture: Texture;` and `mineTexture: Texture;` to the `TextureSet` interface.

Add a factory function after `makeUnitTexture`:

```ts
function makeBuildingTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  const s = hexSize * 0.12;
  const gap = hexSize * 0.04;
  g.rect(-s - gap / 2, -s / 2, s, s).fill(color).stroke({ width: 2, color: 0x000000 });
  g.rect(gap / 2, -s / 2, s, s).fill(color).stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

In `createTextures`, build them and include in the returned object:

```ts
  const factoryTexture = makeBuildingTexture(app, 0x9aa3b5, hexSize);
  const mineTexture = makeBuildingTexture(app, 0x7a5c3e, hexSize);
  ...
  return {
    tileTextures,
    villageTextures,
    freeVillageTexture: makeVillageTexture(app, 0x9a9a9a, hexSize),
    unitTextures,
    factoryTexture,
    mineTexture,
  };
```

- [ ] **Step 2: Draw buildings in `src/render/mapRenderer.ts`**

In the tile loop, after the settlement sprite block and before the unit sprite block, add:

```ts
    if (tile.building) {
      const buildingSprite = new Sprite(
        tile.building.kind === 'factory' ? textures.factoryTexture : textures.mineTexture,
      );
      buildingSprite.anchor.set(0.5);
      buildingSprite.scale.set(spriteScale);
      buildingSprite.position.set(p.x, y);
      container.addChild(buildingSprite);
    }
```

- [ ] **Step 3: Add `buildSelectedBuilding` to `src/controller/gameController.ts`**

Import `buildBuilding` (add to the existing `../game/buildings` import; if none exists yet, add):

```ts
import { buildBuilding } from '../game/buildings';
```

Add the method after `upgradeSelectedVillageFromToolbar`:

```ts
  buildSelectedBuilding(kind: 'factory' | 'mine'): void {
    if (!this.map) return;
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    const tile = tileAt(this.map, selection.q, selection.r)!;
    const player = store.players[0];
    if (buildBuilding(this.map, tile, kind, player)) {
      store.setPlayers([...store.players]);
      showPopup(
        `${player.name} builds a ${kind}`,
        { background: tribeBackground(player) },
      );
      this.render();
    }
  }
```

- [ ] **Step 4: Add build buttons to `src/screens/hud/ActionToolbar.tsx`**

Add imports:

```ts
import { canBuildFactory, canBuildMine, FACTORY_COST, MINE_COST } from '../../game/buildings';
```

After the settlement block (the `if (settlement) { ... }`) and before the unit block, add:

```ts
  if (settlement === null) {
    const player = players[0];
    if (canBuildFactory(map, tile, 0)) {
      const disabled = player.resources.money < FACTORY_COST;
      buttons.push(
        <button key="factory" disabled={disabled}
                onClick={() => gameController.buildSelectedBuilding('factory')}>
          Build factory ({FACTORY_COST})
        </button>,
      );
    }
    if (canBuildMine(map, tile, 0)) {
      const disabled = player.resources.money < MINE_COST;
      buttons.push(
        <button key="mine" disabled={disabled}
                onClick={() => gameController.buildSelectedBuilding('mine')}>
          Build mine ({MINE_COST})
        </button>,
      );
    }
  }
```

- [ ] **Step 5: Run typecheck, tests, and build**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: builds successfully.

- [ ] **Step 6: Manual browser verification**

Run: `npm run dev`. Verify:
- Selecting an owned land tile adjacent to a forest shows "Build factory (10)"; owned mountain tile shows "Build mine (15)"; buttons disabled when money is insufficient; other tiles show no build button.
- Building places two small squares at the tile center; money is deducted; a popup appears.
- After ending the turn, wood/stone income reflects the buildings (factory = level × adjacent forests, mine = level); old automatic per-tile income is gone; the "Collect resources" button is gone.
- Capturing a village transfers building income to the new owner.

- [ ] **Step 7: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts src/controller/gameController.ts src/screens/hud/ActionToolbar.tsx
git commit -m "feat: build factory/mine from toolbar and render buildings"
```
