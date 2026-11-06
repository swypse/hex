import { isExploredFor } from '../../map/explore';
import { hexNeighbors } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import { tileAt } from '../../map/tile-index';

/** A trap is only useful where someone walks: on the border of our territory
 *  or adjacent to unexplored ground / an already trapped route. */
export function frontierTile(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  if (!isExploredFor(tile, playerIndex)) return false;
  return hexNeighbors(tile).some((n) => {
    const nt = tileAt(map, n.q, n.r);
    if (!nt) return false;
    if (!isExploredFor(nt, playerIndex)) return true;
    return nt.ownedBy !== null && nt.ownedBy !== playerIndex;
  });
}

export function isFrontierTile(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  if (!isExploredFor(tile, playerIndex)) return false;
  return hexNeighbors(tile).some((n) => {
    const nt = tileAt(map, n.q, n.r);
    return nt !== undefined && !isExploredFor(nt, playerIndex);
  });
}
