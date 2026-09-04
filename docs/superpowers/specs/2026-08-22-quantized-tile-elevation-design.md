# Quantized Tile Elevation Design

Date: 2026-08-22

## Problem

Tile texture generation uses per-tile elevation as the cache key and wall height. Because
land heights come from continuous Perlin noise, nearly every land tile has a unique
elevation, producing ~170 unique land textures on typical maps. Combined with the texture
resolution, this is a large GPU-memory cost (previously caused a mobile freeze before the
quality cap).

## Design

Quantize `tileElevation` to 8px steps in `src/render/elevation.ts`:

```ts
export const ELEVATION_STEP = 8;

export function tileElevation(tile: MapTile, hexSize: number): number {
  if (isWaterType(tile.terrain)) return 0;
  return Math.round(((tile.height ?? 0) * hexSize * HEIGHT_SCALE) / ELEVATION_STEP) * ELEVATION_STEP;
}
```

Because every consumer reads `tileElevation`, this single change keeps all systems
consistent with no other code edits:

- `textureFactory.ts` — cache key (`terrain|heightPx|anchor`) and wall height now use
  quantized values, so tiles whose heights fall in the same 8px bucket share one texture.
- `mapRenderer.ts` — sprite/unit/highlight/territory positioning all use the same quantized
  elevation, so units and borders stay aligned with the tile faces.
- `tilePick.ts` — hit-testing uses the same value, so clicks stay accurate.
- `gameController.ts` — move-animation and fog-reveal sprite positions use the same value.

### Expected effect

From measured data (maps of 2/3/4 players):
- Unique land textures drop from ~170 to ~20-40 total (about 2-4 buckets per terrain
  type × 15 land terrain types, with most buckets unused per map).
- Visual: hill faces step in 8px increments instead of smoothly — a mild terracing effect.

## Files touched

- `src/render/elevation.ts`

## Testing

- Existing suite (290 tests) + `npm run typecheck` pass. `tests/textureFactory.test.ts`
  (tileElevation assertions) may need updating to the quantized values.
- Manual: map renders with slightly stepped hill heights; units, borders, and clicks align
  with tiles; GPU memory is visibly lower.
