# Units, Selection, and Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add warrior units to owned villages, click-based selection with priority cycling (unit → village → terrain), blurred tribe-colored glow on selected content, move-target ghost highlighting for the human's unmoved units, and click-to-move.

**Architecture:** Pure, testable game logic in `src/game` (`units.ts`, selection logic in `selection.ts`, `pixelToHex` in `hex.ts`) — the map stores `unit: Unit | null` per tile. Rendering (`textureFactory`, `mapRenderer`) adds a unit sprite, blurred glow textures, and ghost markers; `gameScreen.ts` wires a `pointertap` handler that converts screen→hex, cycles selection, and performs moves, re-rendering the container on each change.

**Tech Stack:** TypeScript, PixiJS 8 (BlurFilter, generateTexture), Vitest.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `Unit = { id: string; owner: number; type: UnitType; q: number; r: number; hasMoved: boolean }` with `type UnitType = 'warrior'` and `UNIT_MOVEMENT: Record<UnitType, number> = { warrior: 1 }`.
- `MapTile` gains `unit: Unit | null`. Every owned settlement (owner !== null) gets a warrior owned by that player; free villages get none.
- Unit texture: small red circle (radius `0.2 * hexSize`), rendered above terrain and village.
- Glow: blurred halo. Color = tribe color for unit/village, gray for neutral village, white for terrain.
- Reachable: within `UNIT_MOVEMENT[type]` hex distance, excluding water and tiles occupied by a unit. Villages allowed if empty of units.
- Only the human's unmoved units show move targets and can be moved (`unit.owner === 0 && !unit.hasMoved`).
- A moved unit cannot move again (`hasMoved`).
- Selection priority: unit → village → terrain. Clicking the same tile cycles down; clicking a different tile resets to its highest priority.
- Tests: `npm test`; typecheck: `npm run typecheck`; dev: `npm run dev`.
- Commit after each task with the exact message shown.

---

### Task 1: Add units to the map

**Files:**
- Create: `src/game/units.ts`
- Modify: `src/game/mapGen.ts`
- Test: `tests/mapGen.test.ts` (add a new test)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 3–5):
  - `type UnitType = 'warrior'`
  - `interface Unit { id: string; owner: number; type: UnitType; q: number; r: number; hasMoved: boolean }`
  - `UNIT_MOVEMENT: Record<UnitType, number> = { warrior: 1 }`
  - `MapTile.unit: Unit | null`

- [ ] **Step 1: Write the failing test**

Append this test to `tests/mapGen.test.ts`:

```ts
  it('places a warrior unit on every owned village and none on free villages', () => {
    const map = generateMap(2, 42);
    const owned = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner !== null);
    const free = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner === null);
    expect(owned.length).toBeGreaterThan(0);
    for (const s of owned) {
      expect(s.unit).not.toBeNull();
      expect(s.unit!.type).toBe('warrior');
      expect(s.unit!.owner).toBe(s.settlement!.owner);
      expect(s.unit!.q).toBe(s.q);
      expect(s.unit!.r).toBe(s.r);
      expect(s.unit!.hasMoved).toBe(false);
    }
    for (const f of free) {
      expect(f.unit).toBeNull();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `MapTile` has no `unit` property (TS compile error) and the new test fails.

- [ ] **Step 3: Create `src/game/units.ts`**

```ts
export type UnitType = 'warrior';

export interface Unit {
  id: string;
  owner: number;
  type: UnitType;
  q: number;
  r: number;
  hasMoved: boolean;
}

export const UNIT_MOVEMENT: Record<UnitType, number> = {
  warrior: 1,
};
```

- [ ] **Step 4: Update `src/game/mapGen.ts`**

Add the import at the top:

```ts
import { Unit } from './units';
```

Change the `MapTile` interface:

```ts
export interface MapTile {
  q: number;
  r: number;
  terrain: TileType;
  settlement: Settlement | null;
  unit: Unit | null;
}
```

Change the tile-initialization loop (line ~70):

```ts
  for (const t of tiles) {
    tileMap.set(axialKey(t), { q: t.q, r: t.r, terrain: TileType.Land, settlement: null, unit: null });
  }
```

Insert a unit-placement loop right after the settlement-placement loop (after line ~98):

```ts
  let unitId = 0;
  for (const tile of tileMap.values()) {
    if (tile.settlement && tile.settlement.owner !== null) {
      tile.unit = {
        id: `w${unitId}`,
        owner: tile.settlement.owner,
        type: 'warrior',
        q: tile.q,
        r: tile.r,
        hasMoved: false,
      };
      unitId++;
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests, including the new one).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/units.ts src/game/mapGen.ts tests/mapGen.test.ts
git commit -m "feat: place warrior units on owned villages"
```

---

### Task 2: Add pixelToHex inverse conversion

**Files:**
- Modify: `src/game/hex.ts`
- Test: `tests/hex.test.ts` (add a new test)

**Interfaces:**
- Consumes: existing `hexToPixel`, `Axial`.
- Produces (used by Task 5):
  - `pixelToHex(x: number, y: number, hexSize: number): Axial`

- [ ] **Step 1: Write the failing test**

Append this test to `tests/hex.test.ts`:

```ts
  it('pixelToHex inverts hexToPixel', () => {
    const coords = [
      { q: 0, r: 0 },
      { q: 3, r: -2 },
      { q: -1, r: 4 },
      { q: 2, r: 1 },
    ];
    for (const h of coords) {
      const p = hexToPixel(h, 40);
      expect(pixelToHex(p.x, p.y, 40)).toEqual(h);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `pixelToHex` is not exported.

- [ ] **Step 3: Add `pixelToHex` to `src/game/hex.ts`**

Append to the end of the file:

```ts
export function pixelToHex(x: number, y: number, hexSize: number): Axial {
  const r = (2 / 3) * (y / hexSize);
  const q = (x / hexSize - (Math.sqrt(3) / 2) * r) / Math.sqrt(3);
  const s = -q - r;
  let qr = Math.round(q);
  let rr = Math.round(r);
  const sr = Math.round(s);
  const dq = Math.abs(qr - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(sr - s);
  if (dq > dr && dq > ds) {
    qr = -rr - sr;
  } else if (dr > ds) {
    rr = -qr - sr;
  }
  return { q: qr, r: rr };
}
```

- [ ] **Step 4: Update the import in `tests/hex.test.ts`**

Change the import at the top of `tests/hex.test.ts` to include `pixelToHex`:

```ts
import {
  allTiles,
  axialKey,
  hexDistance,
  hexNeighbors,
  hexToPixel,
  pixelToHex,
  ringOf,
  tilesInRange,
} from '../src/game/hex';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (8 hex tests plus all others).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/hex.ts tests/hex.test.ts
git commit -m "feat: add pixelToHex inverse conversion"
```

---

### Task 3: Selection and movement logic

**Files:**
- Create: `src/game/selection.ts`
- Test: `tests/selection.test.ts`

**Interfaces:**
- Consumes: `hex.ts` (`Axial`, `hexDistance`), `mapGen.ts` (`GameMap`, `MapTile`), `tileTypes.ts` (`TileType`), `units.ts` (`Unit`, `UNIT_MOVEMENT`).
- Produces (used by Tasks 4–5):
  - `type SelectionKind = 'unit' | 'village' | 'terrain'`
  - `interface Selection { kind: SelectionKind; q: number; r: number }`
  - `tileAt(map: GameMap, q: number, r: number): MapTile | undefined`
  - `contentLayers(tile: MapTile): SelectionKind[]` — highest priority first
  - `cycleSelection(current: Selection | null, tile: MapTile): Selection`
  - `reachableTargets(map: GameMap, unit: Unit): MapTile[]`
  - `moveUnit(map: GameMap, unit: Unit, target: MapTile): void`

- [ ] **Step 1: Write the failing test**

Create `tests/selection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hexDistance } from '../src/game/hex';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import {
  contentLayers,
  cycleSelection,
  moveUnit,
  reachableTargets,
  tileAt,
} from '../src/game/selection';
import { TileType } from '../src/game/tileTypes';
import { Unit } from '../src/game/units';

function makeTile(
  q: number,
  r: number,
  terrain: TileType,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain, settlement, unit };
}

function makeMap(): GameMap {
  const warrior: Unit = {
    id: 'w0',
    owner: 0,
    type: 'warrior',
    q: 0,
    r: 0,
    hasMoved: false,
  };
  const other: Unit = {
    id: 'w1',
    owner: 1,
    type: 'warrior',
    q: -1,
    r: 0,
    hasMoved: false,
  };
  const tiles: MapTile[] = [
    makeTile(0, 0, TileType.Land, null, warrior),
    makeTile(1, 0, TileType.Water),
    makeTile(0, 1, TileType.Land),
    makeTile(1, -1, TileType.Land, { owner: null }),
    makeTile(-1, 0, TileType.Land, null, other),
  ];
  return { radius: 4, tiles, spawns: [] };
}

describe('tileAt', () => {
  it('returns the tile or undefined', () => {
    const map = makeMap();
    expect(tileAt(map, 0, 0)?.q).toBe(0);
    expect(tileAt(map, 5, 5)).toBeUndefined();
  });
});

describe('contentLayers', () => {
  it('lists present layers highest priority first', () => {
    const map = makeMap();
    expect(contentLayers(map.tiles[0])).toEqual(['unit', 'terrain']);
    expect(contentLayers(map.tiles[1])).toEqual(['terrain']);
    expect(contentLayers(map.tiles[3])).toEqual(['village', 'terrain']);
  });
});

describe('cycleSelection', () => {
  it('selects highest priority on a fresh tile', () => {
    const map = makeMap();
    expect(cycleSelection(null, map.tiles[0]).kind).toBe('unit');
    expect(cycleSelection(null, map.tiles[3]).kind).toBe('village');
  });

  it('cycles down on repeated clicks of the same tile', () => {
    const map = makeMap();
    const first = cycleSelection(null, map.tiles[0]);
    expect(first.kind).toBe('unit');
    const second = cycleSelection(first, map.tiles[0]);
    expect(second.kind).toBe('terrain');
    const third = cycleSelection(second, map.tiles[0]);
    expect(third.kind).toBe('unit');
  });

  it('resets to highest priority when clicking a different tile', () => {
    const map = makeMap();
    const selectedTerrain = { kind: 'terrain' as const, q: 0, r: 0 };
    const next = cycleSelection(selectedTerrain, map.tiles[3]);
    expect(next.kind).toBe('village');
  });
});

describe('reachableTargets', () => {
  it('excludes water, occupied tiles, and self; includes empty land and empty villages', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    const targets = reachableTargets(map, unit);
    const keys = targets.map((t) => `${t.q},${t.r}`);
    expect(keys).toContain('0,1');
    expect(keys).toContain('1,-1');
    expect(keys).not.toContain('1,0');
    expect(keys).not.toContain('-1,0');
    expect(keys).not.toContain('0,0');
  });

  it('respects movement distance', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    for (const t of reachableTargets(map, unit)) {
      expect(hexDistance({ q: 0, r: 0 }, t)).toBeLessThanOrEqual(1);
    }
  });
});

describe('moveUnit', () => {
  it('moves the unit, clears the source, and marks hasMoved', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    const target = tileAt(map, 0, 1)!;
    moveUnit(map, unit, target);
    expect(tileAt(map, 0, 0)!.unit).toBeNull();
    expect(tileAt(map, 0, 1)!.unit).toBe(unit);
    expect(unit.q).toBe(0);
    expect(unit.r).toBe(1);
    expect(unit.hasMoved).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/game/selection'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/selection.ts`:

```ts
import { hexDistance } from './hex';
import { GameMap, MapTile } from './mapGen';
import { TileType } from './tileTypes';
import { Unit, UNIT_MOVEMENT } from './units';

export type SelectionKind = 'unit' | 'village' | 'terrain';

export interface Selection {
  kind: SelectionKind;
  q: number;
  r: number;
}

export function tileAt(map: GameMap, q: number, r: number): MapTile | undefined {
  return map.tiles.find((t) => t.q === q && t.r === r);
}

export function contentLayers(tile: MapTile): SelectionKind[] {
  const layers: SelectionKind[] = [];
  if (tile.unit) layers.push('unit');
  if (tile.settlement) layers.push('village');
  layers.push('terrain');
  return layers;
}

export function cycleSelection(current: Selection | null, tile: MapTile): Selection {
  const layers = contentLayers(tile);
  if (current && current.q === tile.q && current.r === tile.r) {
    const idx = layers.indexOf(current.kind);
    return { kind: layers[(idx + 1) % layers.length], q: tile.q, r: tile.r };
  }
  return { kind: layers[0], q: tile.q, r: tile.r };
}

export function reachableTargets(map: GameMap, unit: Unit): MapTile[] {
  const range = UNIT_MOVEMENT[unit.type];
  return map.tiles.filter((t) => {
    if (hexDistance({ q: unit.q, r: unit.r }, t) > range) return false;
    if (t.terrain === TileType.Water) return false;
    if (t.unit) return false;
    return true;
  });
}

export function moveUnit(map: GameMap, unit: Unit, target: MapTile): void {
  const source = tileAt(map, unit.q, unit.r)!;
  source.unit = null;
  target.unit = unit;
  unit.q = target.q;
  unit.r = target.r;
  unit.hasMoved = true;
}
```

Note: `reachableTargets` returns the unit's own tile? No — the unit's own tile has `t.unit` truthy, so it is excluded by the `if (t.unit) return false` guard.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all selection tests plus others).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/selection.ts tests/selection.test.ts
git commit -m "feat: add selection cycling and unit movement logic"
```

---

### Task 4: Render units, glow, and move-target ghosts

**Files:**
- Modify: `src/render/textureFactory.ts`
- Modify: `src/render/mapRenderer.ts`
- Test: manual — headless screenshot; `npm test` and `npm run typecheck` must stay green.

**Interfaces:**
- Consumes: `mapGen.ts` (`GameMap`, `MapTile`), `players.ts` (`Player`), `selection.ts` (`Selection`), `tileTypes.ts` (`TileType`), `tribes.ts` (`TRIBES`, `Tribe`), `hex.ts` (`axialKey`, `hexToPixel`).
- Produces (consumed by Task 5):
  - `TextureSet` gains `unitTexture: Texture` and `glowTextures: { byTribe: Record<Tribe, Texture>; white: Texture; gray: Texture }`.
  - `renderMap(app, map, textures, players, selection: Selection | null, reachableKeys: Set<string>, hexSize = 40): Container`

- [ ] **Step 1: Update `src/render/textureFactory.ts`**

Replace the entire file contents with:

```ts
import { Application, BlurFilter, Graphics, Texture } from 'pixi.js';
import { TileType, TILE_TYPE_COLORS } from '../game/tileTypes';
import { TRIBES, Tribe } from '../game/tribes';

export interface GlowTextures {
  byTribe: Record<Tribe, Texture>;
  white: Texture;
  gray: Texture;
}

export interface TextureSet {
  tileTextures: Record<TileType, Texture>;
  villageTexture: Texture;
  unitTexture: Texture;
  glowTextures: GlowTextures;
}

function hexagonPoints(size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(size * Math.cos(angle), size * Math.sin(angle));
  }
  return points;
}

function makeHexTexture(app: Application, fill: number, hexSize: number): Texture {
  const g = new Graphics();
  g.poly(hexagonPoints(hexSize)).fill(fill);
  g.stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}

function makeVillageTexture(app: Application, hexSize: number): Texture {
  const g = new Graphics();
  g.circle(0, 0, hexSize * 0.3).fill(0x000000);
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}

function makeUnitTexture(app: Application, hexSize: number): Texture {
  const g = new Graphics();
  g.circle(0, 0, hexSize * 0.2).fill(0xff3b30);
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}

function makeGlowTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  g.circle(0, 0, hexSize * 0.6).fill({ color, alpha: 0.5 });
  g.filters = [new BlurFilter({ strength: 12 })];
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}

export function createTextures(app: Application, hexSize = 40): TextureSet {
  const tileTextures = {} as Record<TileType, Texture>;
  for (const type of Object.keys(TILE_TYPE_COLORS) as unknown as TileType[]) {
    tileTextures[type] = makeHexTexture(app, TILE_TYPE_COLORS[type], hexSize);
  }
  const glowTextures: GlowTextures = {
    byTribe: {} as Record<Tribe, Texture>,
    white: makeGlowTexture(app, 0xffffff, hexSize),
    gray: makeGlowTexture(app, 0x9a9a9a, hexSize),
  };
  for (const tribe of TRIBES) {
    glowTextures.byTribe[tribe.id] = makeGlowTexture(app, tribe.color, hexSize);
  }
  return {
    tileTextures,
    villageTexture: makeVillageTexture(app, hexSize),
    unitTexture: makeUnitTexture(app, hexSize),
    glowTextures,
  };
}
```

- [ ] **Step 2: Update `src/render/mapRenderer.ts`**

Replace the entire file contents with:

```ts
import { Application, Container, Sprite } from 'pixi.js';
import { axialKey, hexToPixel } from '../game/hex';
import { GameMap, MapTile } from '../game/mapGen';
import { Player } from '../game/players';
import { Selection } from '../game/selection';
import { TextureSet } from './textureFactory';

function glowTextureFor(
  tile: MapTile,
  selection: Selection,
  textures: TextureSet,
  players: Player[],
) {
  if (selection.kind === 'terrain') return textures.glowTextures.white;
  if (selection.kind === 'village') {
    const owner = tile.settlement!.owner;
    return owner === null
      ? textures.glowTextures.gray
      : textures.glowTextures.byTribe[players[owner].tribe];
  }
  return textures.glowTextures.byTribe[players[tile.unit!.owner].tribe];
}

export function renderMap(
  app: Application,
  map: GameMap,
  textures: TextureSet,
  players: Player[],
  selection: Selection | null,
  reachableKeys: Set<string>,
  hexSize = 40,
): Container {
  const container = new Container();
  container.position.set(app.screen.width / 2, app.screen.height / 2);

  for (const tile of map.tiles) {
    const p = hexToPixel(tile, hexSize);
    const key = axialKey(tile);

    const terrainSprite = new Sprite(textures.tileTextures[tile.terrain]);
    terrainSprite.anchor.set(0.5);
    terrainSprite.position.set(p.x, p.y);
    container.addChild(terrainSprite);

    if (tile.settlement) {
      const villageSprite = new Sprite(textures.villageTexture);
      villageSprite.anchor.set(0.5);
      villageSprite.position.set(p.x, p.y);
      container.addChild(villageSprite);
    }

    if (tile.unit) {
      const unitSprite = new Sprite(textures.unitTexture);
      unitSprite.anchor.set(0.5);
      unitSprite.position.set(p.x, p.y);
      container.addChild(unitSprite);
    }

    if (selection && selection.q === tile.q && selection.r === tile.r) {
      const glow = new Sprite(glowTextureFor(tile, selection, textures, players));
      glow.anchor.set(0.5);
      glow.position.set(p.x, p.y);
      container.addChild(glow);
    }

    if (reachableKeys.has(key)) {
      const ghost = new Sprite(textures.unitTexture);
      ghost.anchor.set(0.5);
      ghost.alpha = 0.5;
      ghost.position.set(p.x, p.y);
      container.addChild(ghost);
    }
  }

  return container;
}
```

Note: `renderMap` currently has no `players` parameter — this new signature is consumed by Task 5, which is updated in the same commit flow, so `gameScreen.ts` (Task 5) must be updated together. Do NOT run `npm run typecheck` between Steps 2 and 5 of Task 5.

- [ ] **Step 3: Verify build tooling still compiles tests**

Run: `npm test`
Expected: all unit tests PASS (they do not import the render modules).

Note: `npm run typecheck` will fail here because `gameScreen.ts` still calls the old `renderMap` signature. That is expected; it is fixed in Task 5 Step 2.

- [ ] **Step 4: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts
git commit -m "feat: add unit, glow, and move-ghost textures"
```

---

### Task 5: Wire click interaction in the game screen

**Files:**
- Modify: `src/screens/gameScreen.ts`
- Test: manual — headless CDP click simulation; `npm test` and `npm run typecheck` must stay green.

**Interfaces:**
- Consumes: `hex.ts` (`axialKey`, `pixelToHex`), `mapGen.ts` (`generateMap`, `GameMap`), `players.ts` (`Player`), `selection.ts` (`cycleSelection`, `moveUnit`, `reachableTargets`, `tileAt`, `Selection`), `tribes.ts` (`TRIBES`), `render/mapRenderer.ts` (`renderMap`), `render/textureFactory.ts` (`createTextures`).
- Produces: interactive game screen — click selects (unit → village → terrain), human unmoved units show ghosts, clicking a ghost moves the unit.

- [ ] **Step 1: Rewrite `src/screens/gameScreen.ts`**

Replace the entire file contents with:

```ts
import { Application, Container } from 'pixi.js';
import { axialKey, pixelToHex } from '../game/hex';
import { generateMap, GameMap } from '../game/mapGen';
import { Player } from '../game/players';
import { cycleSelection, moveUnit, reachableTargets, Selection, tileAt } from '../game/selection';
import { TRIBES } from '../game/tribes';
import { renderMap } from '../render/mapRenderer';
import { createTextures } from '../render/textureFactory';

const HEX_SIZE = 40;

export function initGameScreen(app: Application, players: Player[]): void {
  document.getElementById('game-root')!.appendChild(app.canvas);

  const list = document.getElementById('players-list')!;
  list.innerHTML = players
    .map((p) => {
      const tribe = TRIBES.find((t) => t.id === p.tribe)!;
      const color = `#${tribe.color.toString(16).padStart(6, '0')}`;
      const role = p.isHuman ? ' (you)' : ' (AI)';
      return `<div style="color:${color}">${tribe.name}${role}</div>`;
    })
    .join('');

  const map: GameMap = generateMap(players.length, Math.floor(Math.random() * 100000));
  const textures = createTextures(app);

  let selection: Selection | null = null;
  let reachableKeys = new Set<string>();
  let mapContainer: Container | null = null;

  const render = (): void => {
    if (mapContainer) app.stage.removeChild(mapContainer);

    reachableKeys = new Set<string>();
    if (selection && selection.kind === 'unit') {
      const tile = tileAt(map, selection.q, selection.r)!;
      const unit = tile.unit!;
      if (unit.owner === 0 && !unit.hasMoved) {
        reachableKeys = new Set(reachableTargets(map, unit).map((t) => axialKey(t)));
      }
    }

    mapContainer = renderMap(app, map, textures, players, selection, reachableKeys, HEX_SIZE);
    mapContainer.eventMode = 'static';
    mapContainer.on('pointertap', (e) => {
      const local = mapContainer!.toLocal(e.global);
      const h = pixelToHex(local.x, local.y, HEX_SIZE);
      const tile = tileAt(map, h.q, h.r);
      if (!tile) return;

      if (
        selection &&
        selection.kind === 'unit' &&
        reachableKeys.has(axialKey(tile))
      ) {
        const unit = tileAt(map, selection.q, selection.r)!.unit!;
        moveUnit(map, unit, tile);
        selection = null;
        render();
        return;
      }

      selection = cycleSelection(selection, tile);
      render();
    });

    app.stage.addChild(mapContainer);
  };

  render();
}
```

- [ ] **Step 2: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS (all tests).

- [ ] **Step 3: Verify manually with a headless screenshot of the initial map**

```bash
timeout 30 npm run dev > /tmp/p4rth-opencode/vite-u.log 2>&1 &
sleep 5
timeout 40 google-chrome --headless --disable-gpu --remote-debugging-port=9222 --no-sandbox --remote-allow-origins=* about:blank > /tmp/p4rth-opencode/chrome-u.log 2>&1 &
sleep 4
python3 - <<'EOF'
import json, requests, websocket, time, base64
BASE = "http://127.0.0.1:9222"
ws_headers = {"Origin": "http://127.0.0.1:9222"}
page = requests.put(f"{BASE}/json/new?http://localhost:5173/").json()
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=10, header=ws_headers)
idc = [0]
def send(method, params=None):
    idc[0] += 1
    mid = idc[0]
    ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == mid:
            return msg.get("result", {})
def evaljs(expr):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return r.get("result", {}).get("value")
send("Runtime.enable")
send("Page.enable")
time.sleep(2)
evaljs("document.getElementById('start-btn').click()")
time.sleep(0.3)
evaljs("document.getElementById('setup-start-btn').click()")
time.sleep(2)
shot = send("Page.captureScreenshot", {"format": "png"})
open("/tmp/p4rth-opencode/units-initial.png", "wb").write(base64.b64decode(shot["data"]))
ws.close()
EOF
convert /tmp/p4rth-opencode/units-initial.png -format "%c" histogram:info:- 2>/dev/null | grep -E "#FF3B30|#C0392B|#8B5A2B|#E07B22" | head -5
```

Expected: the unit color `#FF3B30` (bright red circles) appears; tribe colors still present. Kill the dev server and Chrome afterwards.

- [ ] **Step 4: Verify selection and move behavior via CDP**

With the dev server and Chrome still running, run this script. It clicks a known human warrior tile, then a neighbor, and asserts the unit moved. The human's starting village is the spawn at `map.spawns[0].start`, which is exposed to the page's JS module scope. Because the map container is centered on screen, compute pixel coordinates from the hex via the same math the game uses.

```bash
python3 - <<'EOF'
import json, requests, websocket, time
import math
BASE = "http://127.0.0.1:9222"
ws_headers = {"Origin": "http://127.0.0.1:9222"}
page = requests.put(f"{BASE}/json/new?http://localhost:5173/").json()
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=10, header=ws_headers)
idc = [0]
def send(method, params=None):
    idc[0] += 1
    mid = idc[0]
    ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == mid:
            return msg.get("result", {})
def evaljs(expr):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return r.get("result", {}).get("value")
send("Runtime.enable")
time.sleep(2)
evaljs("document.getElementById('start-btn').click()")
time.sleep(0.3)
evaljs("document.getElementById('setup-start-btn').click()")
time.sleep(2)
# Read the map data injected for testing: expose spawns via a temporary global
print("spawn0:", evaljs("window.__test ? JSON.stringify(window.__test) : 'no-hook'"))
ws.close()
EOF
```

If no test hook is available, verify manually in a browser: click the human's village (ringed brown), confirm red ghost circles appear on neighboring non-water tiles, click one ghost, confirm the unit moved there and the source is empty. Then take a screenshot and confirm via histogram that ghost tiles show red.

- [ ] **Step 5: Commit**

```bash
git add src/screens/gameScreen.ts
git commit -m "feat: wire selection and unit movement clicks"
```

---

## Self-Review Notes

- **Spec coverage:** units on owned villages — Task 1; `pixelToHex` — Task 2; selection priority/cycling, reachable rules (water/occupied/self excluded, empty villages allowed, distance respected), `moveUnit` + `hasMoved` — Task 3; unit texture, blurred tribe/gray/white glow, ghost highlights — Task 4; click-to-select, ghost-for-human-unmoved-only, click-to-move, full re-render — Task 5. All spec points covered.
- **Placeholder scan:** No TBD/TODO; every step has concrete code/commands.
- **Type consistency:** `Unit.owner`, `MapTile.unit`, `Selection.kind`, `reachableKeys`, `cycleSelection`, `moveUnit`, `reachableTargets`, `tileAt`, `axialKey`, `pixelToHex`, `glowTextures.byTribe[players[owner].tribe]` — names identical across tasks. `renderMap` signature change is coordinated between Task 4 and Task 5; typecheck is only required green after Task 5 Step 2.
- **Known manual-verification gap:** Task 5 Step 4 relies on the human's starting spawn. The map seed is random per game, so the test script cannot locate the unit without a hook; verification is described for manual browser use (the same steps an engineer would click).
