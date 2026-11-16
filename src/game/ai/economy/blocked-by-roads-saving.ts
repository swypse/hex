import { AiActionType, FoodPressure, SkillId } from '@enums';
import { foodNetworkStates } from '../../economy/food';
import { unitSpawnCost } from '../../units/units';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { canOpenSkill, hasSkill, skillCost } from '../../skills';
import { flagsFor } from '../config/flags';
import { ownUnitCount } from '../situation/army-power';
import { landEnemyCanReach } from '../situation/enemy-reach';
import type { AiAction } from '../types/action';
import { ARMY_FLOOR_UNITS } from './blocked-by-stone';

/** Price of the skill (Roads, or Forestry before it) the AI is saving for so a starving village can be linked to food, else 0. */
export function roadsSkillSavings(map: GameMap, player: Player): number {
  if (!flagsFor(player).foodLinks || hasSkill(player, SkillId.ROADS)) return 0;
  const states = foodNetworkStates(map, player);
  if (states.length < 2 || !states.some((n) => n.pressure !== FoodPressure.NONE) || !states.some((n) => n.balance > 0)) return 0;
  const next = [SkillId.ROADS, SkillId.FORESTRY].find((id) => canOpenSkill({ ...player, resources: { ...player.resources, money: Infinity } }, id, map));
  return next ? skillCost(next, player.skills.length) : 0;
}

/** A spawn that would leave too little money for the Roads skill waits, unless its village is in danger or the army is below the floor. */
export function blockedByRoadsSaving(map: GameMap, player: Player, action: AiAction, saving: number): boolean {
  if (saving <= 0 || action.type !== AiActionType.SPAWN) return false;
  const village = map.tiles.find((t) => t.q === action.q && t.r === action.r);
  if (village && landEnemyCanReach(map, village, player.index)) return false;
  if (ownUnitCount(map, player.index) < ARMY_FLOOR_UNITS) return false;
  return player.resources.money - unitSpawnCost(action.unitType).money < saving;
}
