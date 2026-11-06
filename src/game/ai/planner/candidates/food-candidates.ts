import { AiActionType, BuildingKind, FoodPressure } from '@enums';
import { BUILDING_COSTS, DESTROY_BUILDING_COST, canBuildPort } from '../../../economy/buildings';
import { canBuildRoad } from '../../../economy/roads';
import { canAffordAt } from '../../../economy/stock';
import { key } from '../../util/tile-key';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Granary space, winter-storage and food-network road and port options. */
export function foodCandidates(ctx: CandidateContext, candidates: Candidate[]): void {
  const { map, player, state, jitter, foodPlan, storage, storageScore, clearings } = ctx;
  for (const { tile, then } of clearings) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    // Only when the replacement can be paid for right after the demolition.
    const next = BUILDING_COSTS[then];
    if (!canAffordAt(map, player, tile, { ...next, money: next.money + DESTROY_BUILDING_COST })) continue;
    candidates.push({ score: storageScore + 5 + jitter(), action: { type: AiActionType.DESTROY_BUILDING, q: tile.q, r: tile.r } });
  }
  for (const { tile } of storage.roads) {
    if (state.built.has(key(tile.q, tile.r)) || !canBuildRoad(map, tile, player)) continue;
    candidates.push({ score: storageScore + jitter(), action: { type: AiActionType.BUILD_ROAD, q: tile.q, r: tile.r } });
  }
  for (const { tile } of storage.ports) {
    if (state.built.has(key(tile.q, tile.r)) || !canBuildPort(map, tile, player) || !canAffordAt(map, player, tile, BUILDING_COSTS.port)) continue;
    candidates.push({ score: storageScore + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.PORT } });
  }
  for (const { tile, pressure } of foodPlan.roads) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildRoad(map, tile, player)) continue;
    candidates.push({ score: (pressure === FoodPressure.URGENT ? 650 : 450) + jitter(), action: { type: AiActionType.BUILD_ROAD, q: tile.q, r: tile.r } });
  }
  for (const { tile, pressure } of foodPlan.ports) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildPort(map, tile, player) || !canAffordAt(map, player, tile, BUILDING_COSTS.port)) continue;
    candidates.push({ score: (pressure === FoodPressure.URGENT ? 650 : 450) + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.PORT } });
  }
}
