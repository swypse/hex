import { isExploredFor } from '../../map/explore';
import type { GameMap, MapTile } from '../../map/map-gen';
import { tileAt } from '../../map/tile-index';
import type { Player } from '../../players';

export function enemyVillageAt(map: GameMap, player: Player, target: { q: number; r: number }): MapTile | null {
  const t = tileAt(map, target.q, target.r);
  if (!t?.settlement || t.settlement.owner === null || t.settlement.owner === player.index) return null;
  return isExploredFor(t, player.index) ? t : null;
}
