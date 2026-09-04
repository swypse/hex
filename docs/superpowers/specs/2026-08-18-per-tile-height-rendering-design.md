# Design: Per-tile height rendering

Date: 2026-08-18

## Goal

Replace the predefined per-type `TERRAIN_HEIGHT` with the generated height map: every land/forest/mountain tile renders as a prism at its own Perlin height, so terrain shows continuous natural relief. Water stays a flat plane.

## Background

Each `MapTile` now carries `height` in `[0, 1]` (from `generateTerrain`). Rendering still uses `TERRAIN_HEIGHT[TileType] * hexSize` via per-type textures created in `textureFactory.createTextures(app, hexSize)` and looked up in `mapRenderer.renderMap` as `textures.tileTextures[tile.terrain]` + `textures.tileAnchors[tile.terrain]`.

## Design decisions (confirmed with user)

1. **Water**: renders flat (height 0, no walls) as today; all land/forest/mountain render at their actual generated height.
2. **Texture strategy**: one texture per tile (127–169 tiles), generated once at game start. No height bucketing.
3. **Integration**: `createTextures` takes the map and builds `tileTextures: Map<string, TileTexture>` keyed by `axialKey(tile)`.
4. **Amplification**: heights multiplied by `HEIGHT_SCALE = 2` for stronger visual relief (peaks ≈ 80px at hexSize 40).
5. **Anchor fix**: `makeHexTexture`'s anchor formula is corrected for `HEX_TILT` so the top face centers exactly on the grid point for raised tiles (`anchorY = hexSize * HEX_TILT / (2 * hexSize * HEX_TILT + height)`).
6. **Selected-hex border**: red highlight position matches the top face (automatic once the anchor is fixed); rendered semi-transparent (`alpha 0.6`) for both the static and pulsing selected border.

## 1. Texture factory (`src/render/textureFactory.ts`)

- New type `TileTexture = { texture: Texture; anchorY: number }`.
- `TextureSet.tileTextures` becomes `Map<string, TileTexture>`; `tileAnchors` is removed.
- `createTextures(app, map: GameMap, hexSize)`:
  - For each tile in `map.tiles`:
    ```
    heightPx = isWaterType(tile.terrain) ? 0 : (tile.height ?? 0) * hexSize * HEIGHT_SCALE
    fill     = TILE_TYPE_COLORS[tile.terrain]
    bottom   = isWaterType(tile.terrain) ? shadeColor(fill, 0.7) : fill
    makeHexTexture(app, fill, hexSize, heightPx, bottom)
    ```
    stored under `axialKey(tile)`.
  - The old `Object.keys(TILE_TYPE_COLORS)` loop is replaced by this per-tile loop.
- `makeHexTexture`: anchor corrected for tilt —
  ```
  textureHeight = 2 * hexSize * HEX_TILT + height
  anchorY       = (hexSize * HEX_TILT) / textureHeight
  ```
  For flat tiles this is still `0.5`; for raised tiles the top face now centers on the grid point.
- `HEIGHT_SCALE = 2` (named constant, tunable).
- Village and unit textures unchanged.
- `TERRAIN_HEIGHT` import removed; `isWaterType` imported from `tileTypes.ts`.

## 2. Renderer (`src/render/mapRenderer.ts`)

Terrain sprite lookup becomes:

```ts
const tex = textures.tileTextures.get(axialKey(tile))!;
const terrainSprite = new Sprite(tex.texture);
terrainSprite.anchor.set(0.5, tex.anchorY);
```

Selected/attackable hex borders: both the static `stroke` and the animated `animateSelectedBorder` stroke use `{ width, color: 0xff0000, alpha: 0.6 }`. Their `hexCorners` polygons are already centered on the grid point, which now coincides with the top face (anchor fix).

## 3. Controller (`src/controller/gameController.ts`)

Both `createTextures(app, HEX_SIZE * this.qualityFactor)` call sites (in `init` and `startGame`) gain `this.map` as the second argument. The map is guaranteed non-null at those call sites.

## 4. Cleanup (`src/game/tileTypes.ts`, `tests/tileTypes.test.ts`)

- Remove `TERRAIN_HEIGHT` (now unused).
- Remove the `TERRAIN_HEIGHT` assertions from `tests/tileTypes.test.ts`.

## Files touched

- `src/render/textureFactory.ts`
- `src/render/mapRenderer.ts`
- `src/controller/gameController.ts`
- `src/game/tileTypes.ts`
- `tests/tileTypes.test.ts`

## Testing

- `npm test` (no new unit tests — texture generation needs a live Pixi renderer; existing suite must stay green), `npm run typecheck`, `npm run build`.
- Manual via `npm run dev`: land rises/falls with the height map, mountains protrude, water stays flat, villages/units/camera/pan unchanged.

## Out of scope

- Height-dependent temperature or any change to map generation.
- Water depth variation (sunken water).
- Smoothing/anti-aliasing between adjacent heights.
- Height bucketing or texture caching reuse.
