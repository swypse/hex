import { bridgeCoastOffsets, bridgeDirFor } from '../../economy/bridges';
import { isExploredFor } from '../../map/explore';
import type { GameMap, MapTile } from '../../map/map-gen';
import { tileAt } from '../../map/tile-index';
import type { Player } from '../../players';

/** A bridge pays off only when its far shore leads to something worth
 *  crossing for: unexplored ground, a foreign/free settlement, or foreign
 *  territory. */
export function bridgeLeadsSomewhere(map: GameMap, tile: MapTile, player: Player): boolean {
  const dir = bridgeDirFor(map, tile);
  if (!dir) return false;
  for (const o of bridgeCoastOffsets(dir)) {
    const shore = tileAt(map, tile.q + o.q, tile.r + o.r);
    if (!shore) continue;
    if (!isExploredFor(shore, player.index)) return true;
    if (shore.settlement && shore.settlement.owner !== player.index) return true;
    if (shore.ownedBy !== null && shore.ownedBy !== player.index) return true;
  }
  return false;
}
