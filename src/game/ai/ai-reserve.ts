import type { GameMap, MapTile } from '../map/map-gen';
import type { Player } from '../players';
import { UNIT_TYPES } from '../units/units';
import { enemyCanReach } from './ai-pattern-helpers';
import { flagsFor } from './ai-flags';
import type { AiAction } from './ai-types';
import { AiActionType, UnitType } from '@enums';

/** Own villages with no unit on them that an enemy can reach within the garrison horizon. */
export function bareThreatenedVillages(map: GameMap, player: Player): MapTile[] {
  return map.tiles.filter((t) => t.settlement?.owner === player.index && !t.unit && enemyCanReach(map, t, player.index));
}

const SPENDING: ReadonlySet<AiActionType> = new Set([
  AiActionType.UPGRADE,
  AiActionType.BUILD,
  AiActionType.BUILD_ROAD,
  AiActionType.BUILD_BRIDGE,
  AiActionType.OPEN_SKILL,
  AiActionType.UPGRADE_SHIP,
]);

/** Whether `action` spends money that a bare, threatened village needs for its next defender:
 *  while one exists and the money does not cover a warrior, only spawns on bare villages spend. */
export function blockedByGarrisonReserve(map: GameMap, player: Player, action: AiAction, bare: MapTile[]): boolean {
  if (bare.length === 0 || player.resources.money >= UNIT_TYPES[UnitType.WARRIOR].price) return false;
  if (action.type === AiActionType.SPAWN) return !bare.some((v) => v.q === action.q && v.r === action.r);
  return SPENDING.has(action.type);
}

export function garrisonReserveVillages(map: GameMap, player: Player): MapTile[] {
  return flagsFor(player).garrisonReserve ? bareThreatenedVillages(map, player) : [];
}
