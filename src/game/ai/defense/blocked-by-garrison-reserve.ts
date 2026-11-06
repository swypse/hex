import { AiActionType, UnitType } from '@enums';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { UNIT_TYPES } from '../../units/units';
import type { AiAction } from '../types/action';

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
