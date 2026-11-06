import { AiActionType, BuildingKind, FoodPressure } from '@enums';
import { foodPressure } from '../../economy/food';
import type { GameMap } from '../../map/map-gen';
import { tileAt } from '../../map/tile-index';
import type { Player } from '../../players';
import { isClaimedBy } from '../situation/is-claimed-by';
import type { AiSituation } from '../situation/situation';
import type { AiAction } from '../types/action';
import type { AiPlannerState } from '../types/planner-state';
import { STAGE_BUILDING } from './opening-stage';
import { pendingSettleVillages } from './settle-stage';

/** Whether `action` builds something other than the sawmill or mine a captured village still waits for. */
export function blockedBySettle(map: GameMap, player: Player, action: AiAction, situation?: AiSituation, planned?: AiPlannerState): boolean {
  if (action.type !== AiActionType.BUILD) return false;
  const tile = tileAt(map, action.q, action.r);
  if (!tile) return false;
  const pending = pendingSettleVillages(map, player, planned).find((p) => isClaimedBy(tile, p.village));
  if (!pending || STAGE_BUILDING[pending.stage] === action.kind) return false;
  if (action.kind === BuildingKind.PORT && situation?.navalThreat) return false;
  // Hunger overrides the order: a farm or granary may come early.
  return !((action.kind === BuildingKind.FARM || action.kind === BuildingKind.GRANARY) && foodPressure(map, player) === FoodPressure.URGENT);
}
