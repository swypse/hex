import { hexCorners, pointInPolygon } from '../game/hex';
import { MapTile } from '../game/mapGen';
import { tileElevation } from './elevation';

export function pickTileAt(
  x: number,
  y: number,
  hexSize: number,
  tiles: MapTile[],
): MapTile | null {
  let best: MapTile | null = null;
  for (const tile of tiles) {
    const elev = tileElevation(tile, hexSize);
    const face = hexCorners(tile, hexSize).map((c) => ({ x: c.x, y: c.y - elev }));
    if (pointInPolygon(x, y, face) && (!best || tile.r > best.r)) {
      best = tile;
    }
  }
  return best;
}
