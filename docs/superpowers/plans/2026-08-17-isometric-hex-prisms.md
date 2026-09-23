# Isometric Hex Prisms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework tile rendering so each hex looks like a pseudo-3D isometric prism (top face with vertical gradient + visible side walls), with height varying by terrain (water flat/recessed, mountains tall, forests slightly raised), keeping all game logic unchanged.

**Architecture:** Purely a rendering change. Add a `TERRAIN_HEIGHT` constant table and pure helpers (`shadeColor`, `compareTileY`), then rework the tile texture generation in `textureFactory.ts` to draw wall + gradient top face and expose per-tile anchor Y, and sort tiles by screen-y (painter order) in `mapRenderer.ts`. Sprite anchors keep the top face at the exact grid point, so clicks/camera/pan math is untouched.

**Tech Stack:** TypeScript, PixiJS v8 (`Graphics`, `FillGradient`, `generateTexture`), Vitest.

## Global Constraints

- All game logic (axial grid, hex math, clicks, camera, zoom/pan, selection, combat, AI) stays unchanged.
- Textures must still be generated at `hexSize * qualityFactor` and drawn at `scale = 1 / qualityFactor` (crisp at max zoom).
- `TERRAIN_HEIGHT` values are fractions of hexSize; water = 0; mountain is the max.
- Spec: `docs/superpowers/specs/2026-08-17-isometric-hex-prisms-design.md`.
- Commit after each task. Test command: `npm test`. Typecheck: `npm run typecheck`.

---

### Task 1: `TERRAIN_HEIGHT` table

**Files:**
- Modify: `src/game/tileTypes.ts`
- Test: `tests/tileTypes.test.ts`

**Interfaces:**
- Produces: `TERRAIN_HEIGHT: Record<TileType, number>` — water 0, sand 0.10, snow 0.10, land 0.15, forest land/sand/snow 0.22, settlement 0.15, mountain 0.45.

- [ ] **Step 1: Write the failing test**

Add to `tests/tileTypes.test.ts`:

```ts
import { TERRAIN_HEIGHT } from '../src/game/tileTypes';

  it('TERRAIN_HEIGHT: water is 0, mountain is the max, all >= 0', () => {
    expect(TERRAIN_HEIGHT[TileType.Water]).toBe(0);
    const max = Math.max(...ALL_TILE_TYPES.map((t) => TERRAIN_HEIGHT[t]));
    expect(TERRAIN_HEIGHT[TileType.Mountain]).toBe(max);
    for (const type of ALL_TILE_TYPES) {
      expect(TERRAIN_HEIGHT[type]).toBeGreaterThanOrEqual(0);
    }
  });
```

(Add `TERRAIN_HEIGHT` to the existing import from `../src/game/tileTypes`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tileTypes.test.ts`
Expected: FAIL — `TERRAIN_HEIGHT is not defined` / property access errors.

- [ ] **Step 3: Write minimal implementation**

In `src/game/tileTypes.ts`, add after `TILE_TYPE_NAMES`:

```ts
export const TERRAIN_HEIGHT: Record<TileType, number> = {
  [TileType.Land]: 0.15,
  [TileType.Sand]: 0.1,
  [TileType.Snow]: 0.1,
  [TileType.ForestLand]: 0.22,
  [TileType.ForestSand]: 0.22,
  [TileType.ForestSnow]: 0.22,
  [TileType.Water]: 0,
  [TileType.Mountain]: 0.45,
  [TileType.Settlement]: 0.15,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tileTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/tileTypes.ts tests/tileTypes.test.ts
git commit -m "feat: add terrain height table for prism rendering"
```

---

### Task 2: `shadeColor` color helper

**Files:**
- Create: `src/util/color.ts`
- Test: `tests/color.test.ts`

**Interfaces:**
- Produces: `shadeColor(color: number, factor: number): number` — multiplies each RGB channel by `factor`, clamps to 0..255, preserves the `0xRRGGBB` format.

- [ ] **Step 1: Write the failing test**

Create `tests/color.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shadeColor } from '../src/util/color';

describe('shadeColor', () => {
  it('darkens by multiplying channels', () => {
    expect(shadeColor(0x808080, 0.5)).toBe(0x404040);
    expect(shadeColor(0x4c9a3d, 0.55)).toBe(0x2a5522);
  });

  it('lightens by multiplying channels', () => {
    expect(shadeColor(0x204060, 1.5)).toBe(0x306090);
  });

  it('clamps channels to 0 and 255', () => {
    expect(shadeColor(0x000000, 0.5)).toBe(0x000000);
    expect(shadeColor(0xffffff, 2)).toBe(0xffffff);
    expect(shadeColor(0x0000ff, 1.35)).toBe(0x0000ff);
  });
});
```

Note: channel math — `0x204060 * 1.5` = `0x30, 0x60, 0x90`; `0x4c9a3d * 0.55` = `42, 85, 34` = `0x2a5522`; all rounded with `Math.round`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/color.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/util/color.ts`:

```ts
export function shadeColor(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/color.test.ts`
Expected: PASS. If a channel-rounding expectation differs, update the test literal to match `Math.round` behavior and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/util/color.ts tests/color.test.ts
git commit -m "feat: add shadeColor helper for prism shading"
```

---

### Task 3: `compareTileY` painter-order comparator

**Files:**
- Modify: `src/game/hex.ts`
- Test: `tests/hex.test.ts`

**Interfaces:**
- Produces: `compareTileY(a: { q: number; r: number }, b: { q: number; r: number }, hexSize: number): number` — negative if `a` is above `b` on screen, positive if below. `MapTile` is assignable to `{ q, r }`.

- [ ] **Step 1: Write the failing test**

Add to `tests/hex.test.ts`:

```ts
import { compareTileY } from '../src/game/hex';

  it('compareTileY sorts tiles by screen y ascending', () => {
    const tiles = [
      { q: 1, r: 0 },
      { q: 0, r: 2 },
      { q: 0, r: -1 },
    ];
    const sorted = [...tiles].sort((a, b) => compareTileY(a, b, 40));
    expect(sorted.map((t) => t.r)).toEqual([-1, 0, 2]);
  });

  it('compareTileY returns 0 for the same tile', () => {
    expect(compareTileY({ q: 0, r: 0 }, { q: 0, r: 0 }, 40)).toBe(0);
  });
```

(Add `compareTileY` to the existing import from `../src/game/hex`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hex.test.ts`
Expected: FAIL — `compareTileY is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/game/hex.ts`, add after `hexCorners`:

```ts
export function compareTileY(
  a: { q: number; r: number },
  b: { q: number; r: number },
  hexSize: number,
): number {
  return hexToPixel(a, hexSize).y - hexToPixel(b, hexSize).y;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/hex.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/hex.ts tests/hex.test.ts
git commit -m "feat: add painter-order y comparator for hex tiles"
```

---

### Task 4: Prism tile textures in `textureFactory.ts`

**Files:**
- Modify: `src/render/textureFactory.ts`

**Interfaces:**
- Consumes: `TERRAIN_HEIGHT` from `src/game/tileTypes`; `shadeColor` from `src/util/color`.
- Produces: `TextureSet` gains `tileAnchors: Record<TileType, number>`. `createTextures(app, hexSize)` signature unchanged.
- Only consumer of `tileTextures` / `tileAnchors` is `src/render/mapRenderer.ts` (verified: `textures.tileTextures[tile.terrain]` with `anchor.set(0.5)` there).

- [ ] **Step 1: Extend `TextureSet` and imports**

Update imports:

```ts
import { Application, FillGradient, Graphics, Texture } from 'pixi.js';
import { TERRAIN_HEIGHT, TileType, TILE_TYPE_COLORS } from '../game/tileTypes';
import { TRIBES, Tribe } from '../game/tribes';
import { UnitType, UNIT_TYPES } from '../game/units';
import { shadeColor } from '../util/color';
```

Extend the interface:

```ts
export interface TextureSet {
  tileTextures: Record<TileType, Texture>;
  tileAnchors: Record<TileType, number>;
  villageTextures: Record<Tribe, Texture>;
  freeVillageTexture: Texture;
  unitTextures: Record<Tribe, Record<UnitType, Texture>>;
}
```

- [ ] **Step 2: Replace `makeHexTexture`**

Replace the existing `makeHexTexture` with:

```ts
function makeHexTexture(
  app: Application,
  fill: number,
  hexSize: number,
  height = 0,
  bottom = fill,
): { texture: Texture; anchorY: number } {
  const g = new Graphics();
  if (height > 0) {
    const wallPoints = hexagonPoints(hexSize).map((v, i) => (i % 2 === 0 ? v : v + height));
    g.poly(wallPoints).fill(shadeColor(fill, 0.55)).stroke({ width: 2, color: 0x000000 });
  }
  const gradient = new FillGradient(0, -hexSize, 0, hexSize);
  gradient.addColorStop(0, shadeColor(fill, 1.35));
  gradient.addColorStop(1, bottom);
  g.poly(hexagonPoints(hexSize)).fill(gradient).stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  const textureHeight = 2 * hexSize + height;
  return { texture, anchorY: hexSize / textureHeight };
}
```

The wall silhouette is the same hexagon shifted down by `height`; the gradient top face is drawn at the grid center on top, so only the bottom band of the wall remains visible. `anchorY` keeps the top-face center exactly at the sprite's position (the grid point) despite the wall extending below it.

- [ ] **Step 3: Update `createTextures` tile loop**

Replace the tile loop:

```ts
  const tileTextures = {} as Record<TileType, Texture>;
  const tileAnchors = {} as Record<TileType, number>;
  for (const type of Object.keys(TILE_TYPE_COLORS) as unknown as TileType[]) {
    const fill = TILE_TYPE_COLORS[type];
    const bottom = type === TileType.Water ? shadeColor(fill, 0.7) : fill;
    const { texture, anchorY } = makeHexTexture(
      app,
      fill,
      hexSize,
      TERRAIN_HEIGHT[type] * hexSize,
      bottom,
    );
    tileTextures[type] = texture;
    tileAnchors[type] = anchorY;
  }
```

Update the returned object:

```ts
  return {
    tileTextures,
    tileAnchors,
    villageTextures,
    freeVillageTexture: makeVillageTexture(app, 0x9a9a9a, hexSize),
    unitTextures,
  };
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. `makeHexTexture` is only called from `createTextures`, so the new signature is contained; `tileAnchors` is added, not replaced.

- [ ] **Step 5: Commit**

```bash
git add src/render/textureFactory.ts
git commit -m "feat: generate isometric prism textures for tiles"
```

---

### Task 5: Painter-order rendering in `mapRenderer.ts`

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Consumes: `compareTileY` from `../game/hex`; `textures.tileAnchors` from `TextureSet`.

- [ ] **Step 1: Sort tiles by screen y and use per-tile anchors**

Update the import of `../game/hex`:

```ts
import { axialKey, compareTileY, hexCorners, hexToPixel } from '../game/hex';
```

In `renderMap`, before the tile loop, sort a copy of the tiles:

```ts
  const tiles = [...map.tiles].sort((a, b) => compareTileY(a, b, hexSize));
```

Change the loop header from `for (const tile of map.tiles)` to `for (const tile of tiles)`, and update the terrain sprite anchor:

```ts
    const terrainSprite = new Sprite(textures.tileTextures[tile.terrain]);
    terrainSprite.anchor.set(0.5, textures.tileAnchors[tile.terrain]);
```

Everything else in the loop (settlement, unit, label, hp bar) stays as-is — those sprites are flat and anchored `0.5`/`(0.5, 0)` at the grid point, which is the top face.

- [ ] **Step 2: Typecheck and run full test suite**

Run: `npm run typecheck && npm test`
Expected: both PASS.

- [ ] **Step 3: Manual visual check**

Run: `npm run dev`
Expected: tiles render as hex prisms — visible side walls below each top face, mountains clearly elevated, water flat/recessed, forest slightly raised; tiles crisp at max zoom; clicks, drag/pan, zoom, double-click reset all behave as before.

- [ ] **Step 4: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: render tiles in painter order with prism anchors"
```
