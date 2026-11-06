import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { enemyCanReach } from '../situation/enemy-reach';

/** Own villages with no unit on them that an enemy can reach within the garrison horizon. */
export function bareThreatenedVillages(map: GameMap, player: Player): MapTile[] {
  return map.tiles.filter((t) => t.settlement?.owner === player.index && !t.unit && enemyCanReach(map, t, player.index));
}
