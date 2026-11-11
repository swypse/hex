import { AiActionType, BuildingKind, FoodPressure, OpeningStage } from '@enums';
import { foodPressure } from '../../economy/food';
import { capitalOf } from '../../economy/stock';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { flagsFor } from '../config/flags';
import { isClaimedBy } from '../situation/is-claimed-by';
import { nearestEnemyDistanceFrom } from '../situation/nearest-distances';
import type { AiSituation } from '../situation/situation';
import type { AiAction } from '../types/action';
import type { AiPlannerState } from '../types/planner-state';
import { blockedBySettle } from './blocked-by-settle';
import { openingStage, STAGE_BUILDING } from './opening-stage';

/** Whether `action` spends on a building or upgrade that is not the current
 *  opening step, so it waits until the first village has its granary. */
export function blockedByOpening(map: GameMap, player: Player, action: AiAction, situation?: AiSituation, planned?: AiPlannerState): boolean {
  const stage = openingStage(map, player, planned);
  if (!stage) return blockedBySettle(map, player, action, situation, planned);
  const v = capitalOf(map, player.index);
  if (action.type === AiActionType.UPGRADE) {
    if (v !== null && action.q === v.q && action.r === v.r) return stage !== OpeningStage.UPGRADE;
    const front = map.tiles.find((t) => t.q === action.q && t.r === action.r);
    return !(front && nearestEnemyDistanceFrom(map, player.index, front) <= 4);
  }
  if (action.type === AiActionType.BUILD) {
    // Land of another village is not part of the capital's opening: only that village's own settle order applies.
    const site = map.tiles.find((t) => t.q === action.q && t.r === action.r);
    if (flagsFor(player).localOpening && v !== null && site && !isClaimedBy(site, v)) return blockedBySettle(map, player, action, situation, planned);
    if (STAGE_BUILDING[stage] === action.kind) return false;
    if (action.kind === BuildingKind.PORT && situation?.navalThreat) return false;
    // Hunger overrides the order: a farm or granary may come early.
    const pressure = foodPressure(map, player);
    if (flagsFor(player).earlyFoodFarm && action.kind === BuildingKind.FARM && pressure !== FoodPressure.NONE) return false;
    return !((action.kind === BuildingKind.FARM || action.kind === BuildingKind.GRANARY) && pressure === FoodPressure.URGENT);
  }
  return false;
}
