# Design: Isometric-looking hex prisms (renderer rework)

Date: 2026-08-17

## Goal

Rework the tile renderer so hexes look like pseudo-3D prisms in isometric projection — each tile drawn as a 2D sprite with a top face and visible side walls, so tiles have thickness. Height varies by terrain: water recessed below land, mountains elevated above it, forests slightly raised.

All game logic (axial grid, hex math, clicks, camera, zoom/pan bounds, selection, combat, AI) stays unchanged. Only the visual tile rendering changes.

## Current behavior

- `textureFactory.ts` generates one flat hexagon texture per tile type (`makeHexTexture`): flat fill of `TILE_TYPE_COLORS` + 2px black border.
- `mapRenderer.ts` draws tiles in `map.tiles` generation order (no painter sorting), one `Sprite` per tile at `hexToPixel(tile, hexSize)`.
- Tile sprites are anchored `(0.5, 0.5)` at the grid point; zoom quality is handled by generating textures at `hexSize * qualityFactor` and drawing sprites at `scale = 1 / qualityFactor`.

## Design

### 1. Prism textures (`textureFactory.ts`)

Each tile-type texture becomes a full hex prism, generated once at `hexSize * qualityFactor` (keeps the existing crisp-at-max-zoom pipeline). Per tile type:

- **Wall silhouette** — the tile hexagon shifted down on screen by the tile's height `h`, filled with the tile color darkened to ~55% brightness, plus a thin dark outline.
- **Top face** — the tile hexagon drawn at the exact grid center, filled with a vertical gradient (tile color lightened ~135% at the top edge, fading to the base `TILE_TYPE_COLORS` color at the bottom edge), plus the existing 2px black outline.

The sprite anchor stays `(0.5, 0.5)` at the grid point, so all click/camera/pan math is untouched. The prism only extends below the grid point, where it is correctly occluded by the tile in front (painter order, below).

### 2. Terrain heights

New pure table `TERRAIN_HEIGHT: Record<TileType, number>` (fraction of hexSize), in `src/game/tileTypes.ts`:

| Tile | Height |
|------|--------|
| Water | 0 |
| Sand | 0.10 |
| Snow | 0.10 |
| Land | 0.15 |
| Forest on land/sand/snow | 0.22 |
| Settlement | 0.15 |
| Mountain | 0.45 |

`makeHexTexture` takes a height parameter; `createTextures` passes `TERRAIN_HEIGHT[type]` for tile textures.

### 3. Painter's order (`mapRenderer.ts`)

Sort `map.tiles` by `hexToPixel(tile, hexSize).y` ascending before drawing. Southern tiles (larger y) draw last/on top — the camera faces south, so each tile's wall bottoms tuck under the tile below. Combined with the height table, mountains rise clearly above neighbors while flat water reads as a basin.

### 4. Overlays unchanged

Villages, units, labels, HP bars, territory borders, and selection/move/attack highlights stay flat at grid positions, drawn after all tiles (already the case in `renderMap`). No changes.

### 5. Recessed water

`Water` height 0 keeps it flat; since every land tile is raised, water naturally sits in a basin. Water also gets a darker face tone to sell the depth: in `makeHexTexture`, water's top-face bottom color is the base water color darkened by a fixed factor (~0.7), keeping `TILE_TYPE_COLORS` untouched.

## Files touched

- `src/game/tileTypes.ts` — new `TERRAIN_HEIGHT` table.
- `src/render/textureFactory.ts` — height parameter on `makeHexTexture`; prism drawing (wall silhouette + gradient top face); optional water darkening.
- `src/render/mapRenderer.ts` — y-sort of tiles before drawing.
- `tests/tileTypes.test.ts` — height table sanity tests.
- `tests/hex.test.ts` (or new small test file) — pure painter-order comparator test, if the comparator is extracted into `src/game/hex.ts` as a pure function `compareTileY(a, b, hexSize)`.

## Testing

- `TERRAIN_HEIGHT`: water = 0, mountain = max, all values ≥ 0.
- Painter order comparator: tiles with larger `hexToPixel().y` sort last.
- Manual via `npm run dev`: map shows raised hex prisms; mountains visibly elevated; water recessed; tiles crisp at max zoom; clicks/camera/pan behave identically.

## Out of scope

- Changing grid layout, hex math, or any game logic.
- True isometric camera/projection transform.
- Animating height or terrain morphing.
