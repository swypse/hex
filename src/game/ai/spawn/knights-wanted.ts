import { UnitType } from '@enums';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { visibleEnemyCatapults } from '../situation/visible-enemy-catapults';

/** Knights are raised against visible enemy catapults, up to two per catapult. */
export function knightsWanted(map: GameMap, player: Player): boolean {
  const catapults = visibleEnemyCatapults(map, player.index);
  if (catapults === 0) return false;
  let knights = 0;
  for (const t of map.tiles) if (t.unit?.owner === player.index && t.unit.type === UnitType.KNIGHT) knights += 1;
  return knights < Math.max(2, catapults * 2);
}
