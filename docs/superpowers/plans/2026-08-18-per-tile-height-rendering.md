# Per-Tile Height Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each land/forest/mountain tile as a prism at its own generated Perlin height amplified ×2 (water stays flat), fix the prism anchor so faces center on the grid point, and make the selected-hex red border semi-transparent and aligned with the top face.

**Architecture:** `createTextures` takes the `GameMap` and builds a per-tile `Map<string, TileTexture>` keyed by `axialKey(tile)`; `makeHexTexture`'s anchor is corrected for `HEX_TILT`; `renderMap` looks up each tile's texture/anchor from the map and draws semi-transparent red highlight borders; `TERRAIN_HEIGHT` is removed.

**Tech Stack:** TypeScript, PixiJS 8, Vitest, `tsc --noEmit`, Vite build.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-18-per-tile-height-rendering-design.md`.
- Water tiles render flat: `heightPx = isWaterType(terrain) ? 0 : (tile.height ?? 0) * hexSize * HEIGHT_SCALE` with `HEIGHT_SCALE = 2`.
- Anchor fix: `textureHeight = 2 * hexSize * HEX_TILT + height`; `anchorY = (hexSize * HEX_TILT) / textureHeight`.
- `TextureSet.tileTextures` becomes `Map<string, TileTexture>`; `tileAnchors` is removed.
- `createTextures(app, map: GameMap, hexSize)` — map is the second argument.
- Red highlight borders use `{ width, color: 0xff0000, alpha: 0.6 }` in both the static and animated strokes.
- `TERRAIN_HEIGHT` is deleted from `src/game/tileTypes.ts` and its test.
- Village/unit textures and their creation are unchanged.
- No height bucketing; one texture per tile.
- Must stay green: `npm test`, `npm run typecheck`, `npm run build`.

---

### Task 1: Per-tile prism textures with amplified, anchored heights

**Files:**
- Modify: `src/render/textureFactory.ts`
- Modify: `src/render/mapRenderer.ts:88-98`
- Modify: `src/controller/gameController.ts:80-84,106-120`

**Interfaces:**
- Consumes: `GameMap` from `../game/mapGen`; `isWaterType`, `TILE_TYPE_COLORS` from `../game/tileTypes`; `axialKey` from `../game/hex`.
- Produces:
  - `interface TileTexture { texture: Texture; anchorY: number }`
  - `interface TextureSet { tileTextures: Map<string, TileTexture>; villageTextures: Record<Tribe, Texture>; freeVillageTexture: Texture; unitTextures: Record<Tribe, Record<UnitType, Texture>> }`
  - `createTextures(app: Application, map: GameMap, hexSize = 40): TextureSet`
  - `makeHexTexture` uses the tilt-corrected anchor formula.
  - `renderMap` reads `textures.tileTextures.get(axialKey(tile))` for each tile.

- [ ] **Step 1: Update `src/render/textureFactory.ts`**

Replace the imports block (lines 1-6) with:

```ts
import { Application, FillGradient, Graphics, Texture } from 'pixi.js';
import { axialKey, HEX_TILT } from '../game/hex';
import { GameMap } from '../game/mapGen';
import { isWaterType, TILE_TYPE_COLORS } from '../game/tileTypes';
import { TRIBES, Tribe } from '../game/tribes';
import { UnitType, UNIT_TYPES } from '../game/units';
import { shadeColor } from '../util/color';
```

Replace the `TextureSet` interface (lines 8-14) with:

```ts
export interface TileTexture {
  texture: Texture;
  anchorY: number;
}

export interface TextureSet {
  tileTextures: Map<string, TileTexture>;
  villageTextures: Record<Tribe, Texture>;
  freeVillageTexture: Texture;
  unitTextures: Record<Tribe, Record<UnitType, Texture>>;
}
```

Fix the anchor in `makeHexTexture` (the `textureHeight`/`anchorY` lines, ~50-51):

```ts
  const textureHeight = 2 * hexSize * HEX_TILT + height;
  return { texture, anchorY: (hexSize * HEX_TILT) / textureHeight };
```

Replace the tile-texture loop inside `createTextures` (the `Object.keys(TILE_TYPE_COLORS)` loop, lines ~83-97) with:

```ts
  const tileTextures = new Map<string, TileTexture>();
  for (const tile of map.tiles) {
    const fill = TILE_TYPE_COLORS[tile.terrain];
    const water = isWaterType(tile.terrain);
    const heightPx = water ? 0 : (tile.height ?? 0) * hexSize * HEIGHT_SCALE;
    const bottom = water ? shadeColor(fill, 0.7) : fill;
    tileTextures.set(axialKey(tile), makeHexTexture(app, fill, hexSize, heightPx, bottom));
  }
```

Add the constant near the top of the file (after imports):

```ts
const HEIGHT_SCALE = 2;
```

Update the function signature to `export function createTextures(app: Application, map: GameMap, hexSize = 40): TextureSet {`.

Remove `tileAnchors` from the returned object (return `{ tileTextures, villageTextures, freeVillageTexture, unitTextures }`).

- [ ] **Step 2: Update `src/render/mapRenderer.ts`**

Replace the terrain sprite creation (lines 88-98):

```ts
  for (const tile of tiles) {
    const p = hexToPixel(tile, hexSize);
    const tex = textures.tileTextures.get(axialKey(tile))!;
    const terrainSprite = new Sprite(tex.texture);
    terrainSprite.anchor.set(0.5, tex.anchorY);
    terrainSprite.scale.set(spriteScale);
    terrainSprite.position.set(p.x, p.y);
    container.addChild(terrainSprite);
```

(`axialKey` is already imported in this file.)

- [ ] **Step 3: Update `src/controller/gameController.ts`**

In `init` (lines 80-84), pass the map via a local so the type narrows:

```ts
        if (this.map) {
          const map = this.map;
          this.applyFitToScreen();
          this.textures = createTextures(app, map, HEX_SIZE * this.qualityFactor);
          this.render();
        }
```

In `startGame` (lines 110-114), keep a local reference:

```ts
    const map = generateMap(players.length, Math.floor(Math.random() * 100000));
    this.map = map;
    if (this.app) {
      this.applyFitToScreen();
      this.textures = createTextures(this.app, map, HEX_SIZE * this.qualityFactor);
    }
```

- [ ] **Step 4: Verify typecheck, tests, and build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, all 161 tests pass, build succeeds.

- [ ] **Step 5: Manual visual check**

Run: `npm run dev`, start a game.
Expected: land/forest/mountain tiles rise and fall with amplified relief (peaks ≈80px); water stays flat; tiles/units/villages sit on faces centered at their grid points.

- [ ] **Step 6: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts src/controller/gameController.ts
git commit -m "feat: render tiles at amplified generated height with tilt-corrected anchor"
```

---

### Task 2: Semi-transparent selected-hex red border

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: highlight strokes draw with `alpha: 0.6`. The `hexCorners` border already sits on the top face thanks to the Task 1 anchor fix.

- [ ] **Step 1: Make the static highlight border semi-transparent**

In `drawHighlights`, change the attackable/selected border stroke:

```ts
    border.poly(points).stroke({ width: 4, color: 0xff0000, alpha: 0.6 });
```

- [ ] **Step 2: Make the animated border semi-transparent**

In `animateSelectedBorder`, change the `draw` closure:

```ts
  const draw = (width: number): void => {
    border.clear();
    border.poly(points).stroke({ width, color: 0xff0000, alpha: 0.6 });
  };
```

- [ ] **Step 3: Verify typecheck, tests, and build**

Run: `npm run typecheck && npm test && npm run build`
Expected: ALL PASS, typecheck clean, build succeeds.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`.
Expected: selecting a hex shows a semi-transparent red outline that hugs the tile's top face (no gap on raised tiles).

- [ ] **Step 5: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: semi-transparent selected-hex border aligned with tile face"
```

---

### Task 3: Remove `TERRAIN_HEIGHT`

**Files:**
- Modify: `src/game/tileTypes.ts`
- Test: `tests/tileTypes.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TERRAIN_HEIGHT` no longer exists in `tileTypes.ts`. The other exports (`TileType`, `ALL_TILE_TYPES`, `TILE_TYPE_COLORS`, `TILE_TYPE_NAMES`, `isLandType`, `isForestType`, `isMountainType`, `isWaterType`) are unchanged.

- [ ] **Step 1: Update the test — remove the `TERRAIN_HEIGHT` test**

In `tests/tileTypes.test.ts`:
- Remove `TERRAIN_HEIGHT` from the import (line 6).
- Delete the `'TERRAIN_HEIGHT: water is 0, mountain is the max, all >= 0'` test (the last `it` block).
- Optionally add a compile-time sanity check that the other exports still exist:

```ts
  it('still exposes tile classification helpers', () => {
    expect(typeof isLandType).toBe('function');
    expect(typeof isForestType).toBe('function');
    expect(typeof isMountainType).toBe('function');
    expect(typeof isWaterType).toBe('function');
  });
```

- [ ] **Step 2: Run test to verify it passes with the block removed**

Run: `npm test -- tests/tileTypes.test.ts`
Expected: PASS.

- [ ] **Step 3: Remove `TERRAIN_HEIGHT` from `src/game/tileTypes.ts`**

Delete the entire `TERRAIN_HEIGHT` export block at the end of the file.

- [ ] **Step 4: Verify full suite + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: ALL PASS, typecheck clean, build succeeds (confirms nothing else references `TERRAIN_HEIGHT`).

- [ ] **Step 5: Commit**

```bash
git add src/game/tileTypes.ts tests/tileTypes.test.ts
git commit -m "refactor: remove predefined TERRAIN_HEIGHT"
```
