import { MapTile } from '../game/map-gen';
import { isIceType, isWaterType } from '../game/tile-types';

const HEIGHT_SCALE = 1;
// 8px step at hexSize 40, expressed as a fraction of tile.height (0..1)
const ELEVATION_STEP = 8 / 40;
/** Ice sits slightly above the surrounding water: half a land step (4px at hexSize 40). */
const ICE_ELEVATION = 4 / 40;

export function tileElevation(tile: MapTile, hexSize: number): number {
  if (isWaterType(tile.terrain)) return 0;
  if (isIceType(tile.terrain)) return ICE_ELEVATION * hexSize * HEIGHT_SCALE;
  const h = tile.height ?? 0;
  return Math.round(h / ELEVATION_STEP) * ELEVATION_STEP * hexSize * HEIGHT_SCALE;
}
