import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';

/** Number of the player's own units within `dist` hexes of `tile` (excluding a
 *  unit standing on it). Used to keep the banner inside its aura cluster. */
export function friendlyUnitsWithin(map: GameMap, owner: number, tile: MapTile, dist: number): number {
  let n = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner !== owner) continue;
    if (t.q === tile.q && t.r === tile.r) continue;
    if (hexDistance(tile, t) <= dist) n += 1;
  }
  return n;
}
