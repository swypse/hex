import { AiActionType, BuildingKind, FoodPressure, SkillId } from '@enums';
import { BUILDING_COSTS, canBuildFarm } from '../../../economy/buildings';
import { eatsFarmMaterials, foodPressure } from '../../../economy/food';
import { networkStock, totalStock } from '../../../economy/stock';
import { hasSkill } from '../../../skills';
import type { AiAction } from '../../types/action';
import { actionVillage, discretionaryCost } from '../discretionary-cost';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Drops discretionary spends that would eat what the first farm, granary or university needs. */
export function applyFoodReserve(ctx: CandidateContext, candidates: Candidate[], foodSkillReserve: number): void {
  const { map, player, universityReserve, storageReserve } = ctx;
  // While food is short and a farm site exists, keep what a farm needs: drop
  // discretionary spends of wood/stone, and of money once wood and stone are
  // ready, so the money for the farm is saved.
  const needFood = foodPressure(map, player) !== FoodPressure.NONE || !map.tiles.some((t) => t.ownedBy === player.index && t.building?.kind === BuildingKind.FARM);
  if ((needFood && (!hasSkill(player, SkillId.AGRICULTURE) || map.tiles.some((t) => canBuildFarm(map, t, player)))) || storageReserve > 0 || universityReserve > 0) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      const action = candidates[i]!.action;
      const first: AiAction = Array.isArray(action) ? action[0]! : action;
      const cost = discretionaryCost(map, player, first);
      if (!cost) continue;
      // Wood and stone trickle in slowly: never spend below one farm's worth.
      if (needFood && eatsFarmMaterials(map, player, cost, actionVillage(map, player, first))) {
        candidates.splice(i, 1);
        continue;
      }
      // When money is the only thing missing for the farm, save it too (an
      // urgent defensive spawn still goes ahead).
      const urgentSpawn = first.type === AiActionType.SPAWN && candidates[i]!.score >= 500;
      const home = actionVillage(map, player, first);
      const have = home ? networkStock(map, home) : totalStock(map, player.index);
      const materialsReady = hasSkill(player, SkillId.AGRICULTURE) && have.wood >= BUILDING_COSTS.farm.wood && have.stone >= BUILDING_COSTS.farm.stone;
      const reserve = Math.max(storageReserve, universityReserve, foodSkillReserve > 0 ? foodSkillReserve : needFood && materialsReady ? BUILDING_COSTS.farm.money : 0);
      if (reserve > 0 && !urgentSpawn && player.resources.money - cost.money < reserve) candidates.splice(i, 1);
    }
  }
}
