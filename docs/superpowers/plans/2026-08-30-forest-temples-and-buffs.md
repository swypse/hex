# Forest Temples + Temple Buffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add forest temples (a new building kind on forest cells, same cost/growth/scoring as water temples) and two player buffs — Water Protection (-1 ship damage) and Forest Protection (-1 damage on forest cells) — earned at 3 owned temples, shown as square icons below the score circle.

**Architecture:** Introduce a new `'forestTemple'` `BuildingKind` and thread it through building, scoring, growth, and rendering. Add a pure `src/game/buffs.ts` that derives active buffs from map ownership and computes per-unit damage reduction; `combat.ts` applies it. Extend `HudScore` to render buff icons with tooltips, and make the `Tooltip` kit render caller-provided text.

**Tech Stack:** TypeScript, PixiJS, React/Zustand, Vite, Vitest.

## Global Constraints

- Forest temple: cost `{ wood: 0, stone: 10, money: 30, ore: 0 }`, built on owned forest cells (`isForestType`) with no settlement/building, requires the `forestTemple` skill; grows like water temples (max level 4, +1 every 2 turns).
- Buff threshold is exactly 3 owned temples of the kind.
- Water Protection: `-1` damage to the player's ship units. Forest Protection: `-1` damage to the player's units standing on any forest cell (ownership of the cell does not matter). Applies to **all** damage received (attack and counter-attack), flooring at 0.
- Buff tooltip text is exactly `Water Protection: -1 dmg for ships` and `Forest Protection: -1 dmg for units in forest`.
- Buff icons are square textures (no background/border), shown below the score circle.
- No comments in code unless asked.
- Commit after every task.

---

### Task 1: Forest temple building (`'forestTemple'` kind)

**Files:**
- Modify: `src/game/events.ts:4`
- Modify: `src/game/mapGen.ts:21`
- Modify: `src/game/aiTypes.ts:11`
- Modify: `src/game/buildings.ts`
- Modify: `src/game/ai.ts`
- Modify: `tests/buildings.test.ts`

**Interfaces:**
- Consumes: `hasSkill`, `isForestType`.
- Produces: `'forestTemple'` added to `BuildingKind` and the `Building`/AI unions; `BUILDING_NAMES.forestTemple`, `BUILDING_COSTS.forestTemple`, `canBuildForestTemple(map, tile, player): boolean`, and `buildBuilding` dispatch. Later tasks consume these.

- [ ] **Step 1: Write the failing test**

Append to `tests/buildings.test.ts` (import `canBuildForestTemple`):

```ts
describe('canBuildForestTemple', () => {
  it('requires the forestTemple skill and an owned forest tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const forest = tile(0, 0, TileType.GrasslandForest, 0);
    map.tiles.push(forest);
    expect(canBuildForestTemple(map, forest, player(100))).toBe(false);
    expect(canBuildForestTemple(map, forest, player(100, ['forestTemple']))).toBe(true);
  });

  it('rejects unowned, non-forest, settlement, and already-built tiles', () => {
    let map: GameMap = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandForest, null)], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0], player(100, ['forestTemple']))).toBe(false);
    map = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandLand, 0)], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0], player(100, ['forestTemple']))).toBe(false);
    map = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandForest, 0, { owner: 0, level: 1, captureReady: false })], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0], player(100, ['forestTemple']))).toBe(false);
    map = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandForest, 0, null, { kind: 'factory', level: 1 })], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0], player(100, ['forestTemple']))).toBe(false);
  });
});

describe('buildBuilding forest temple', () => {
  it('builds a forest temple, deducts 10 stone + 30 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const forest = tile(0, 0, TileType.GrasslandForest, 0);
    map.tiles.push(forest);
    const p = player(100, ['forestTemple']);
    p.resources.stone = 10;
    expect(buildBuilding(map, forest, 'forestTemple', p)).toBe(true);
    expect(p.resources.money).toBe(70);
    expect(p.resources.stone).toBe(0);
    expect(forest.building).toEqual({ kind: 'forestTemple', level: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- buildings.test.ts`
Expected: FAIL (type error: `'forestTemple'` not assignable to `BuildingKind`; `canBuildForestTemple` not found).

- [ ] **Step 3: Write minimal implementation**

`src/game/events.ts:4`:

```ts
export type BuildingKind = 'factory' | 'mine' | 'port' | 'temple' | 'forestTemple';
```

`src/game/mapGen.ts:21`:

```ts
export interface Building {
  kind: 'factory' | 'mine' | 'port' | 'temple' | 'forestTemple';
  level: number;
  bornTurn?: number;
}
```

`src/game/aiTypes.ts:11`:

```ts
  | { type: 'build'; q: number; r: number; kind: 'factory' | 'mine' | 'port' | 'temple' | 'forestTemple' }
```

`src/game/buildings.ts` — add to `BUILDING_NAMES`:

```ts
  forestTemple: 'Forest temple',
```

Add to `BUILDING_COSTS`:

```ts
  forestTemple: { wood: 0, stone: 10, money: 30, ore: 0 },
```

Add the checker after `canBuildTemple`:

```ts
export function canBuildForestTemple(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'forestTemple')) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  return isForestType(tile.terrain);
}
```

Update `buildBuilding`'s `allowed` dispatch to handle the new kind (replace the final ternary arm):

```ts
        : kind === 'temple'
          ? canBuildTemple(map, tile, player)
          : canBuildForestTemple(map, tile, player);
```

`src/game/ai.ts` — import `canBuildForestTemple` and add a candidate after the water-temple block (around line 140):

```ts
    if (canBuildForestTemple(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.forestTemple)) {
      candidates.push({ score: 200 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'forestTemple' } });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- buildings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/events.ts src/game/mapGen.ts src/game/aiTypes.ts src/game/buildings.ts src/game/ai.ts tests/buildings.test.ts
git commit -m "feat: forest temple building kind"
```

---

### Task 2: Forest temple scoring and growth

**Files:**
- Modify: `src/game/score.ts:31,38`
- Modify: `src/game/simulator.ts:297,307`
- Modify: `tests/score.test.ts`
- Modify: `tests/simulator.test.ts`

**Interfaces:**
- Consumes: `'forestTemple'` kind from Task 1.
- Produces: both temple kinds excluded from generic building score and counted in `awardTempleScores`; both kinds grow to level 4 and get `bornTurn`.

- [ ] **Step 1: Write the failing test**

Append to `tests/score.test.ts`:

```ts
  it('does not count forest temples in the generic building score', () => {
    const map: GameMap = {
      radius: 2,
      tiles: [tile(0, 0, 0, null, null, { kind: 'forestTemple', level: 4 })],
      spawns: [],
    };
    expect(boardScore(map, 0)).toBe(0);
  });

  it('awards end-game temple scores for forest temples', () => {
    const map: GameMap = {
      radius: 2,
      tiles: [
        tile(0, 0, 0, null, null, { kind: 'forestTemple', level: 1 }),
        tile(1, 0, 0, null, null, { kind: 'forestTemple', level: 3 }),
      ],
      spawns: [],
    };
    const p = player();
    awardTempleScores(map, [p]);
    expect(p.score).toBe(10 + 20);
  });
```

Append to `tests/simulator.test.ts` (next to the water-temple growth test at line 78):

```ts
  it('grows a forest temple to level 4', () => {
    const map = makeTestMap(3);
    const forest = tileAt(map, 1, 0)!;
    forest.terrain = TileType.GrasslandForest;
    forest.ownedBy = 0;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0].skills = ['forestTemple'];
    players[0].resources = { wood: 0, stone: 10, money: 30, ore: 0 };
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'build', q: 1, r: 0, kind: 'forestTemple' })).toBe(true);
    expect(tileAt(map, 1, 0)!.building).toEqual({ kind: 'forestTemple', level: 1, bornTurn: 1 });
    for (let i = 0; i < 3; i++) {
      sim.applyCommand({ type: 'endTurn' });
      sim.drainEvents();
    }
    expect(tileAt(map, 1, 0)!.building!.level).toBe(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- score.test.ts simulator.test.ts`
Expected: FAIL (forest temple still counts as a generic building; `awardTempleScores`/`growTemples` skip `forestTemple`).

- [ ] **Step 3: Write minimal implementation**

`src/game/score.ts:31`:

```ts
    if (tile.building && tile.building.kind !== 'temple' && tile.building.kind !== 'forestTemple') score += BUILDING_SCORE;
```

`src/game/score.ts:38`:

```ts
    if (!tile.building || (tile.building.kind !== 'temple' && tile.building.kind !== 'forestTemple') || tile.ownedBy === null) continue;
```

`src/game/simulator.ts:297` (in `doBuild`):

```ts
      if (tile.building?.kind === 'temple' || tile.building?.kind === 'forestTemple') tile.building.bornTurn = this.turn;
```

`src/game/simulator.ts:307` (in `growTemples`):

```ts
      if (!b || (b.kind !== 'temple' && b.kind !== 'forestTemple') || b.level >= 4) continue;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- score.test.ts simulator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/score.ts src/game/simulator.ts tests/score.test.ts tests/simulator.test.ts
git commit -m "feat: forest temple scoring and growth"
```

---

### Task 3: Forest temple rendering and toolbar

**Files:**
- Modify: `src/render/textureFactory.ts`
- Modify: `src/render/mapRenderer.ts:272-281`
- Modify: `src/render/tileSignature.ts:50`
- Modify: `src/ui/hud/toolbarSpecs.ts:55-72`
- Modify: `src/ui/hud/HudToolbar.ts:12-22`
- Modify: `tests/mapRenderer.test.ts:27-61`

**Interfaces:**
- Consumes: `'forestTemple'` kind from Task 1.
- Produces: `TextureSet.forestTempleTextures: Record<1|2|3|4, TileTexture>`; the map picks the temple texture by kind; the toolbar lists "Build forest temple (10s, 30)".

- [ ] **Step 1: Write the failing test**

Update `tests/mapRenderer.test.ts` `buildTextures` — add the new required field after `templeTextures` (line ~56):

```ts
    forestTempleTextures: {
      1: tileTex(40, 40, 0.7),
      2: tileTex(40, 40, 0.7),
      3: tileTex(40, 40, 0.7),
      4: tileTex(40, 40, 0.7),
    },
```

Add a rendering test at the end of the temple texture test group (near line 449, which asserts `templeTextures[3]`), following the same inline-map pattern:

```ts
  it('renders the forest temple texture matching the temple level', () => {
    const t: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandForest, height: 0.1, settlement: null,
      building: { kind: 'forestTemple', level: 3 }, roadOwner: null, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [t] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tv = (v as unknown as { tileViews: Map<string, { buildingSprite: Sprite | null }> }).tileViews.get('0,0')!;
    expect(tv.buildingSprite?.texture).toBe(textures.forestTempleTextures[3].texture);
    v.destroy();
  });
```

(The `players` variable and `textures` come from the enclosing `describe` `beforeEach`; the helper `MapView`, `Sprite`, `Application`, `MapTile`, `GameMap`, `TileType` are already imported in this file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mapRenderer.test.ts`
Expected: FAIL (`forestTempleTextures` missing on `TextureSet`).

- [ ] **Step 3: Write minimal implementation**

`src/render/textureFactory.ts` — add after `TEMPLE_IMAGE_FILES`:

```ts
const FOREST_TEMPLE_IMAGE_FILES: Record<1 | 2 | 3 | 4, string> = {
  1: 'forest-temple-1.png',
  2: 'forest-temple-2.png',
  3: 'forest-temple-3.png',
  4: 'forest-temple-4.png',
};
```

Add to the `TextureSet` interface (near `templeTextures`):

```ts
  forestTempleTextures: Record<1 | 2 | 3 | 4, TileTexture>;
```

In `createTextures`, after the `templeTextures` loop:

```ts
  const forestTempleTextures = {} as Record<1 | 2 | 3 | 4, TileTexture>;
  for (const lvl of [1, 2, 3, 4] as const) {
    const img = await loadImageTexture(TEXTURE_BASE + FOREST_TEMPLE_IMAGE_FILES[lvl]);
    forestTempleTextures[lvl] =
      makeUnitImageTexture(app, img, hexSize) ??
      { texture: makeBuildingTexture(app, 0x2e6b24, hexSize), anchorY: 0.5 };
  }
```

Add to the returned object (near `templeTextures`):

```ts
    forestTempleTextures,
```

`src/render/mapRenderer.ts:272-281` — update `buildingIsTemple` and the texture selection:

```ts
    const buildingIsTemple = tile.building !== null && (tile.building.kind === 'temple' || tile.building.kind === 'forestTemple');
    const buildingTileTex = buildingIsFactory
      ? this.textures.factoryTexture
      : buildingIsTemple
        ? tile.building!.kind === 'forestTemple'
          ? this.textures.forestTempleTextures[tile.building!.level as 1 | 2 | 3 | 4]
          : this.textures.templeTextures[tile.building!.level as 1 | 2 | 3 | 4]
        : tile.building !== null && !buildingIsPort
          ? this.textures.mineTexture
          : null;
```

`src/render/tileSignature.ts:50`:

```ts
    tile.building?.kind === 'temple' || tile.building?.kind === 'forestTemple' ? String(tile.building.level) : '',
```

`src/ui/hud/toolbarSpecs.ts:55-72` — import `canBuildForestTemple`, widen the kinds array, and extend the dispatch:

```ts
    const kinds: Array<{ kind: 'factory' | 'mine' | 'port' | 'temple' | 'forestTemple'; label: string }> = [
      { kind: 'factory', label: 'Build factory (10)' },
      { kind: 'mine', label: 'Build mine (15)' },
      { kind: 'port', label: 'Build port (10w, 30, 2 ore)' },
      { kind: 'temple', label: 'Build water temple (10s, 30)' },
      { kind: 'forestTemple', label: 'Build forest temple (10s, 30)' },
    ];
    for (const { kind, label } of kinds) {
      const ok = kind === 'factory'
        ? canBuildFactory(map, tile, player)
        : kind === 'mine'
          ? canBuildMine(map, tile, player)
          : kind === 'port'
            ? canBuildPort(map, tile, player)
            : kind === 'temple'
              ? canBuildTemple(map, tile, player)
              : canBuildForestTemple(map, tile, player);
```

`src/ui/hud/HudToolbar.ts` — add to `ICON_ACTIONS`:

```ts
  forestTemple: 'build.png',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- mapRenderer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts src/render/tileSignature.ts src/ui/hud/toolbarSpecs.ts src/ui/hud/HudToolbar.ts tests/mapRenderer.test.ts
git commit -m "feat: render and build forest temples"
```

---

### Task 4: Buffs module

**Files:**
- Create: `src/game/buffs.ts`
- Create: `tests/buffs.test.ts`

**Interfaces:**
- Consumes: `GameMap`/`MapTile` from `./mapGen`, `isShip` from `./ship`, `isForestType` from `./tileTypes`, `Unit` from `./units`.
- Produces:
  - `type BuffId = 'waterProtection' | 'forestProtection'`
  - `BUFF_INFO: Record<BuffId, { name: string; icon: string; tooltip: string }>`
  - `activeBuffs(map: GameMap, playerIndex: number): BuffId[]`
  - `damageReduction(map: GameMap, unit: Unit, tile: MapTile): number`
  Task 5 consumes `damageReduction`; Task 6 consumes `activeBuffs` and `BUFF_INFO`.

- [ ] **Step 1: Write the failing test**

Create `tests/buffs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { activeBuffs, damageReduction, BUFF_INFO } from '../src/game/buffs';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Unit } from '../src/game/units';

function tile(q: number, r: number, terrain: TileType, ownedBy: number | null, building: MapTile['building'] = null): MapTile {
  return { q, r, terrain, settlement: null, building, unit: null, ownedBy, claimedByVillage: null };
}

function makeWaterMap(): GameMap {
  return {
    radius: 4,
    tiles: [
      tile(0, 0, TileType.Water, 0, { kind: 'temple', level: 1 }),
      tile(1, 0, TileType.Water, 0, { kind: 'temple', level: 1 }),
      tile(2, 0, TileType.Water, 0, { kind: 'temple', level: 1 }),
      tile(3, 0, TileType.Water, 1, { kind: 'temple', level: 1 }),
    ],
    spawns: [],
  };
}

function makeForestMap(): GameMap {
  return {
    radius: 4,
    tiles: [
      tile(0, 0, TileType.GrasslandForest, 0, { kind: 'forestTemple', level: 1 }),
      tile(1, 0, TileType.GrasslandForest, 0, { kind: 'forestTemple', level: 1 }),
      tile(2, 0, TileType.GrasslandForest, 0, { kind: 'forestTemple', level: 1 }),
    ],
    spawns: [],
  };
}

function makeUnit(id: string, owner: number, q: number, r: number, ship: boolean): Unit {
  return {
    id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    ...(ship ? { shipLevel: 1 as const } : {}),
  };
}

describe('activeBuffs', () => {
  it('gives no buff below 3 temples', () => {
    expect(activeBuffs(makeWaterMap(), 1)).toEqual([]);
  });

  it('gives water protection at 3 owned water temples', () => {
    expect(activeBuffs(makeWaterMap(), 0)).toContain('waterProtection');
  });

  it('gives forest protection at 3 owned forest temples', () => {
    expect(activeBuffs(makeForestMap(), 0)).toContain('forestProtection');
  });
});

describe('damageReduction', () => {
  it('reduces ship damage with water protection', () => {
    const map = makeWaterMap();
    const ship = makeUnit('s', 0, 0, 0, true);
    expect(damageReduction(map, ship, tile(0, 0, TileType.Water, 0))).toBe(1);
  });

  it('reduces forest-cell damage with forest protection', () => {
    const map = makeForestMap();
    const unit = makeUnit('u', 0, 0, 0, false);
    expect(damageReduction(map, unit, tile(0, 0, TileType.GrasslandForest, 1))).toBe(1);
  });

  it('returns 0 for a protected player unit not on a forest tile', () => {
    const map = makeForestMap();
    const unit = makeUnit('u', 0, 0, 0, false);
    expect(damageReduction(map, unit, tile(0, 0, TileType.GrasslandLand, 0))).toBe(0);
  });

  it('returns 0 for units of a player without the buff', () => {
    const map = makeWaterMap();
    const unit = makeUnit('u', 1, 3, 0, true);
    expect(damageReduction(map, unit, tile(3, 0, TileType.Water, 1))).toBe(0);
  });

  it('defines the requested tooltip texts', () => {
    expect(BUFF_INFO.waterProtection.tooltip).toBe('Water Protection: -1 dmg for ships');
    expect(BUFF_INFO.forestProtection.tooltip).toBe('Forest Protection: -1 dmg for units in forest');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- buffs.test.ts`
Expected: FAIL (module `../src/game/buffs` not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/game/buffs.ts`:

```ts
import { GameMap, MapTile } from './mapGen';
import { isShip } from './ship';
import { isForestType } from './tileTypes';
import { Unit } from './units';

export type BuffId = 'waterProtection' | 'forestProtection';

export const TEMPLE_BUFF_THRESHOLD = 3;

export const BUFF_INFO: Record<BuffId, { name: string; icon: string; tooltip: string }> = {
  waterProtection: { name: 'Water Protection', icon: 'water-protection.png', tooltip: 'Water Protection: -1 dmg for ships' },
  forestProtection: { name: 'Forest Protection', icon: 'forest-protection.png', tooltip: 'Forest Protection: -1 dmg for units in forest' },
};

export function activeBuffs(map: GameMap, playerIndex: number): BuffId[] {
  let water = 0;
  let forest = 0;
  for (const t of map.tiles) {
    if (t.ownedBy !== playerIndex || !t.building) continue;
    if (t.building.kind === 'temple') water++;
    else if (t.building.kind === 'forestTemple') forest++;
  }
  const buffs: BuffId[] = [];
  if (water >= TEMPLE_BUFF_THRESHOLD) buffs.push('waterProtection');
  if (forest >= TEMPLE_BUFF_THRESHOLD) buffs.push('forestProtection');
  return buffs;
}

export function damageReduction(map: GameMap, unit: Unit, tile: MapTile): number {
  if (unit.owner < 0) return 0;
  const buffs = activeBuffs(map, unit.owner);
  let reduction = 0;
  if (buffs.includes('waterProtection') && isShip(unit)) reduction += 1;
  if (buffs.includes('forestProtection') && isForestType(tile.terrain)) reduction += 1;
  return reduction;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- buffs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/buffs.ts tests/buffs.test.ts
git commit -m "feat: temple buffs module"
```

---

### Task 5: Combat damage reduction

**Files:**
- Modify: `src/game/combat.ts`
- Modify: `tests/combat.test.ts`

**Interfaces:**
- Consumes: `damageReduction(map, unit, tile)` from Task 4.
- Produces: `performAttack` reduces damage to the defender by the defender's reduction and counter damage to the attacker by the attacker's reduction.

- [ ] **Step 1: Write the failing test**

Append to `tests/combat.test.ts` (uses the existing `makeMap`/`makeTile`/`makeWarrior`/`noMiss` helpers):

```ts
describe('temple protection', () => {
  function waterProtectedMap(): GameMap {
    const map = makeMap();
    const b = map.tiles.find((t) => t.unit?.id === 'b')!;
    b.unit!.shipLevel = 1;
    b.terrain = TileType.Water;
    map.tiles.push(
      makeTile(2, 0, TileType.Water, null),
      makeTile(3, 0, TileType.Water, null),
      makeTile(4, 0, TileType.Water, null),
    );
    for (const t of map.tiles) {
      if (t.unit?.id !== 'b') {
        if (t.q >= 2 && t.terrain === TileType.Water) t.ownedBy = 1;
      }
    }
    map.tiles[2].building = { kind: 'temple', level: 1 };
    map.tiles[3].building = { kind: 'temple', level: 1 };
    map.tiles[4].building = { kind: 'temple', level: 1 };
    return map;
  }

  it('reduces damage the target receives when it has water protection', () => {
    const map = waterProtectedMap();
    const attacker = map.tiles.find((t) => t.unit?.id === 'a')!.unit!;
    const target = map.tiles.find((t) => t.unit?.id === 'b')!;
    const result = performAttack(map, attacker, target, noMiss);
    expect(result.targetDamage).toBe(Math.max(0, attackDamage(attacker) - 1));
  });

  it('reduces counter damage when the attacker has water protection', () => {
    const map = waterProtectedMap();
    const attacker = map.tiles.find((t) => t.unit?.id === 'b')!.unit!;
    const target = map.tiles.find((t) => t.unit?.id === 'a')!;
    const result = performAttack(map, attacker, target, noMiss);
    expect(result.targetDamage).toBe(Math.max(0, counterAttackDamage(target.unit!) - 1));
  });
});
```

Note: `makeTile` builds tiles with `exploredBy: [0]` and `ownedBy: null`; the temples must be `ownedBy === 1` (the defender's player). Verify `makeMap()` tiles: `a` = player 0 at (0,0), `b` = player 1 at (1,0). Player 1 owns the `b` unit, so player 1 needs 3 water temples.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- combat.test.ts`
Expected: FAIL (no reduction applied).

- [ ] **Step 3: Write minimal implementation**

`src/game/combat.ts` — add the import:

```ts
import { damageReduction } from './buffs';
```

Rewrite `performAttack` to compute the attacker's tile up front and apply both reductions:

```ts
export function performAttack(
  map: GameMap,
  attacker: Unit,
  target: MapTile,
  rng: () => number = Math.random,
): AttackResult {
  const targetUnit = target.unit!;
  const attackerTile = map.tiles.find((t) => t.unit === attacker);

  if (rng() < MISS_CHANCE) {
    attacker.hasAttacked = true;
    return {
      attackerDamage: 0,
      targetDamage: 0,
      attackerDied: false,
      targetDied: false,
      missed: true,
    };
  }

  const attackerDamage = Math.max(0, attackDamage(attacker) - damageReduction(map, targetUnit, target));
  const targetDied = targetUnit.hp - attackerDamage <= 0;
  targetUnit.hp = Math.max(0, targetUnit.hp - attackerDamage);
  attacker.hasAttacked = true;

  let targetDamage = 0;
  let attackerDied = false;
  const distance = hexDistance(
    { q: attacker.q, r: attacker.r },
    { q: target.q, r: target.r },
  );
  if (!targetDied && distance <= targetUnit.attackDistance) {
    const counterReduction = attackerTile ? damageReduction(map, attacker, attackerTile) : 0;
    targetDamage = Math.max(0, counterAttackDamage(targetUnit) - counterReduction);
    attackerDied = attacker.hp - targetDamage <= 0;
    attacker.hp = Math.max(0, attacker.hp - targetDamage);
  }

  if (targetDied) {
    target.unit = null;
    if (attackerTile && attacker.type !== 'archer' && attacker.type !== 'pirate' && targetUnit.type !== 'pirate' && !isShip(attacker) && !isShip(targetUnit)) {
      attackerTile.unit = null;
      attacker.q = target.q;
      attacker.r = target.r;
      target.unit = attacker;
    }
  }
  if (attackerDied) {
    if (attackerTile) attackerTile.unit = null;
  }

  return { attackerDamage, targetDamage, attackerDied, targetDied, missed: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- combat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.ts tests/combat.test.ts
git commit -m "feat: temple buffs reduce combat damage"
```

---

### Task 6: Buff display and tooltip

**Files:**
- Modify: `src/ui/kit/tooltip.ts`
- Modify: `src/ui/hud/HudMoney.ts:80,82`
- Modify: `src/ui/hud/HudScore.ts`
- Modify: `tests/tooltip.test.ts` (no content change expected)
- Create: `tests/hudScore.test.ts`

**Interfaces:**
- Consumes: `activeBuffs`, `BUFF_INFO` from Task 4, `Tooltip` kit.
- Produces: `Tooltip` renders caller-provided secondary text; `HudScore` shows square buff icons below the score circle with tooltips.

- [ ] **Step 1: Write the failing test**

Create `tests/hudScore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container, Sprite, Text } from 'pixi.js';
import { HudScore } from '../src/ui/hud/HudScore';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';
import { type UIHost } from '../src/ui/host';
import { makeTestMap, tileAt } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';
import { TileType } from '../src/game/tileTypes';

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 }, stage: new Container(), ticker: { add: () => {} } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudScore buff icons', () => {
  let hud: HudScore;
  let root: Container;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const mount = (waterTemples: number): Container => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const tile = tileAt(map, 1, 0)!;
    tile.terrain = TileType.Water;
    tile.ownedBy = 0;
    tile.building = { kind: 'temple', level: 1 };
    tileAt(map, 2, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.building = { kind: 'temple', level: 1 };
    if (waterTemples >= 3) {
      tileAt(map, 3, 0)!.terrain = TileType.Water;
      tileAt(map, 3, 0)!.ownedBy = 0;
      tileAt(map, 3, 0)!.building = { kind: 'temple', level: 1 };
    }
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });
    root = new Container();
    hud = new HudScore();
    hud.mount(makeHost(), root);
    return root;
  };

  afterEach(() => {
    hud.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  const allSprites = (r: Container): Sprite[] => {
    const out: Sprite[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Sprite) out.push(ch as Sprite);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(r);
    return out;
  };

  it('shows a water protection icon when the player has 3 water temples', () => {
    const r = mount(3);
    expect(allSprites(r).length).toBeGreaterThan(0);
  });

  it('shows no buff icon with only 2 water temples', () => {
    const r = mount(2);
    expect(allSprites(r).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hudScore.test.ts`
Expected: FAIL (HudScore shows no buff icons).

- [ ] **Step 3: Write minimal implementation**

`src/ui/kit/tooltip.ts:93` — remove the hardcoded prefix:

```ts
    this.text.text = text;
```

`src/ui/hud/HudMoney.ts:80,82` — pass the full line:

```ts
        icon.on('pointerover', () => this.tooltip!.showForAfter(icon, info.name, `Required for ${info.requiredFor}`, 500));
```

```ts
        icon.on('pointerdown', () => this.tooltip!.showFor(icon, info.name, `Required for ${info.requiredFor}`));
```

`src/ui/hud/HudScore.ts` — extend with a buff row. Add imports:

```ts
import { activeBuffs, BUFF_INFO } from '../../game/buffs';
import { makeIcon } from '../kit/icon';
import { Tooltip } from '../kit/tooltip';
```

Add fields and rendering. The full new implementation:

```ts
export class HudScore implements Widget {
  private el: Container | null = null;
  private text: Text | null = null;
  private buffRow: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private lastScore = 0;
  private tooltip: Tooltip | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const size = 64;
    const pad = 8;
    const bg = new Graphics();
    bg.circle(0, 0, size / 2).fill(0xd4a017);
    const text = makeLabel('0', { fontSize: 24, fill: 0x1a1a2e, fontWeight: '800' });
    text.anchor.set(0.5, 0.5);
    const buffRow = new Container();
    el.addChild(bg, text, buffRow);
    root.addChild(el);
    this.el = el;
    this.text = text;
    this.buffRow = buffRow;
    this.tooltip = new Tooltip(host.app);
    host.app.stage.addChild(this.tooltip.el);
    this.lastScore = this.readScore();
    this.layout();
    window.addEventListener('resize', this.layout);
    this.unsub = useGameStore.subscribe(() => {
      this.update();
      this.updateBuffs();
    });
    this.update();
    this.updateBuffs();
  }

  private layout = (): void => {
    if (!this.el || !this.host || !this.buffRow) return;
    const size = 64;
    const pad = 8;
    const centerX = this.host.app.screen.width - pad - size / 2;
    const centerY = pad + size / 2;
    this.el.position.set(centerX, centerY);
    const n = this.buffRow.children.length;
    const iconSize = 32;
    const gap = 6;
    const totalW = n * iconSize + Math.max(0, n - 1) * gap;
    this.buffRow.position.set(-totalW / 2, size / 2 + 6);
  };

  private readScore(): number {
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const human = s.players[s.localPlayerIndex];
    if (!human) return 0;
    return map ? totalScore(map, human) : human.score;
  }

  private update(): void {
    if (!this.text || !this.el) return;
    const score = this.readScore();
    if (score === this.lastScore) return;
    this.lastScore = score;
    this.text.text = String(score);
    this.bounce();
  }

  private updateBuffs(): void {
    if (!this.buffRow || !this.host) return;
    this.buffRow.removeChildren();
    const s = useGameStore.getState();
    const map = gameController.getMap();
    if (!map) return;
    const buffs = activeBuffs(map, s.localPlayerIndex);
    let x = 0;
    const iconSize = 32;
    const gap = 6;
    for (const buff of buffs) {
      const info = BUFF_INFO[buff];
      const icon = makeIcon(info.icon, iconSize);
      icon.position.set(x, 0);
      icon.eventMode = 'static';
      icon.on('pointerover', () => this.tooltip!.showForAfter(icon, info.tooltip, '', 500));
      icon.on('pointerout', () => this.tooltip!.hideAfter(500));
      icon.on('pointerdown', () => this.tooltip!.showFor(icon, info.tooltip, ''));
      this.buffRow.addChild(icon);
      x += iconSize + gap;
    }
    this.layout();
  }

  private bounce(): void {
    if (!this.host || !this.el) return;
    const start = performance.now();
    const fn = (): void => {
      const t = Math.min(1, (performance.now() - start) / 300);
      const s = 1 + 0.2 * Math.sin(t * Math.PI);
      this.el!.scale.set(s, s);
      if (t >= 1) {
        this.el!.scale.set(1, 1);
        this.host!.app.ticker.remove(fn);
      }
    };
    this.host.app.ticker.add(fn);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    window.removeEventListener('resize', this.layout);
    this.tooltip?.destroy();
    this.tooltip = null;
    this.unsub = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.text = null;
    this.buffRow = null;
    this.host = null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- hudScore.test.ts tooltip.test.ts hudMoney.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/kit/tooltip.ts src/ui/hud/HudMoney.ts src/ui/hud/HudScore.ts tests/hudScore.test.ts
git commit -m "feat: show temple buff icons with tooltips under the score"
```

---

### Task 7: Full verification

**Files:**
- None.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Confirm nothing stray was left uncommitted**

Run: `git status`
Expected: no modified tracked files.
