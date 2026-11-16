import { AiActionType, BuildingKind, FoodPressure } from '@enums';
import { BUILDING_COSTS, canBuildPort } from '../../../economy/buildings';
import { foodNetworkStates } from '../../../economy/food';
import { canBuildRoad } from '../../../economy/roads';
import { canAffordAt } from '../../../economy/stock';
import { flagsFor } from '../../config/flags';
import { planFoodFixes } from '../../economy/food/plan-food-fixes';
import { planWinterStorage } from '../../economy/food/plan-winter-storage';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

/** Builds the next road or port that links a starving village network to food (or to a granary), before any unit
 *  acts: starving units are weak, and a link costs little compared with the hunger it ends. */
export const FOOD_LINK_PATTERN: AiPattern = {
  id: 'food-link',
  priority: 400,
  evaluate({ map, player, state }): AiAction[] | null {
    if (!flagsFor(player).foodLinks) return null;
    const states = foodNetworkStates(map, player);
    if (states.length < 2 || !states.some((n) => n.pressure !== FoodPressure.NONE)) return null;
    const plan = planFoodFixes(map, player, states);
    const storage = planWinterStorage(map, player, states);
    const roads = [...plan.roads, ...storage.roads].sort((a, b) => Number(b.pressure === FoodPressure.URGENT) - Number(a.pressure === FoodPressure.URGENT));
    for (const { tile } of roads) {
      if (state.built.has(key(tile.q, tile.r)) || !canBuildRoad(map, tile, player)) continue;
      return [{ type: AiActionType.BUILD_ROAD, q: tile.q, r: tile.r }];
    }
    for (const { tile } of [...plan.ports, ...storage.ports]) {
      if (state.built.has(key(tile.q, tile.r)) || !canBuildPort(map, tile, player) || !canAffordAt(map, player, tile, BUILDING_COSTS.port)) continue;
      return [{ type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.PORT }];
    }
    return null;
  },
};
