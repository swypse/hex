import { UnitType } from '@enums';
import type { GameMap,MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { type Unit,unitMaxHp } from '../../units/units';
import { enemyCanReach } from '../situation/enemy-reach';
import { type WalkField,walkDistance } from '../situation/walk-distances';
import { isSupportUnit } from '../unit-roles/is-support-unit';

/** Land unit that can join a squad: fit, not support/stalker/ship, and not the
 *  last defender of a village an enemy could reach. */
function squadEligible(map: GameMap, player: Player, tile: MapTile): Unit | null {
  const unit = tile.unit;
  if (!unit || unit.owner !== player.index) return null;
  if (isSupportUnit(unit) || unit.type === UnitType.STALKER || unit.type === UnitType.PIRATE) return null;
  if (unit.shipLevel !== undefined) return null;
  if (unit.hp * 2 < unitMaxHp(unit)) return null;
  if (tile.settlement && tile.settlement.owner === player.index && enemyCanReach(map, tile, player.index)) return null;
  return unit;
}

export function squadTiles(map: GameMap, player: Player, field: WalkField): MapTile[] {
  return map.tiles.filter((t) => walkDistance(field, t) < Infinity && squadEligible(map, player, t) !== null);
}
