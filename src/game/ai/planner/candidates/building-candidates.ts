import { AiActionType, BuildingKind, FoodPressure, SkillId } from '@enums';
import { BUILDING_COSTS, buildingCostAt, canBuildFarm, canBuildForestTemple, canBuildGranary, canBuildMine, canBuildSawmill, canBuildTemple, canBuildUniversity } from '../../../economy/buildings';
import { foodPressure, networkStateOfTile } from '../../../economy/food';
import { canAffordAt } from '../../../economy/stock';
import { axialKey } from '../../../map/hex';
import { hasSkill } from '../../../skills';
import { flagsFor } from '../../config/flags';
import { reserveLastSlotForMine } from '../../economy/mine-slot';
import { key } from '../../util/tile-key';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Food balance a network should have spare (about two more units) before the AI stops adding farms. */
const FOOD_HEADROOM = 6;

/** Sawmill, mine, farm, granary, university, port and temple options on every own tile. */
export function buildingCandidates(ctx: CandidateContext, candidates: Candidate[]): void {
  const { map, player, state, situation, jitter, buildScale, foodStates, foodPlan, universityReserve, agronomyWanted, storage, storageScore, granarySite, storageReserve, openPortSite } = ctx;
  for (const tile of map.tiles) {
    if (tile.ownedBy !== player.index) continue;
    if (state.built.has(key(tile.q, tile.r))) continue;
    const granaryNet = networkStateOfTile(foodStates, tile);
    const needsStorage = granaryNet !== undefined && storage.needy.has(axialKey(granaryNet.villages[0]!));
    // A tile a needy network can put its granary on is not given back to a
    // sawmill, or the AI would demolish it again next turn.
    const granaryTile = needsStorage && canBuildGranary(map, tile, player);
    if (!granaryTile && canBuildSawmill(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.sawmill)) {
      if (!reserveLastSlotForMine(map, player, tile)) {
        candidates.push({ score: 360 + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.SAWMILL } });
      }
    }
    if (canBuildMine(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.mine)) {
      candidates.push({ score: 500 + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.MINE } });
    }
    if (canBuildFarm(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.farm)) {
      const net = networkStateOfTile(foodStates, tile);
      const roadFirst = net !== undefined && foodPlan.linkFirst.has(axialKey(net.villages[0]!));
      const pressure = net?.pressure ?? foodPressure(map, player);
      const baseScore = roadFirst ? 0 : pressure === FoodPressure.URGENT ? 650 : pressure === FoodPressure.LOW ? 450 : (net?.balance ?? 0) < (flagsFor(player).foodHeadroom ? FOOD_HEADROOM : 2) ? 260 : 0;
      // A network that needs a granary needs a farm to put it next to.
      const farmForGranary = !roadFirst && !granarySite && hasSkill(player, SkillId.GRANARY) && net !== undefined && storage.needy.has(axialKey(net.villages[0]!));
      const farmScore = farmForGranary ? Math.max(storageScore - 10, baseScore) : baseScore;
      // A granary that is only short of money comes before a cheaper farm.
      const savingForGranary = hasSkill(player, SkillId.GRANARY) && storageReserve > 0 && farmScore < storageScore && player.resources.money - BUILDING_COSTS.farm.money < storageReserve;
      if (farmScore > 0 && !savingForGranary) candidates.push({ score: farmScore + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.FARM } });
    }
    if (canBuildGranary(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.granary) && (needsStorage || (granaryNet?.balance ?? 0) > 0)) {
      candidates.push({ score: (needsStorage ? storageScore : 120) + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.GRANARY } });
    }
    if (canBuildUniversity(map, tile, player) && canAffordAt(map, player, tile, buildingCostAt(map, player, tile, BuildingKind.UNIVERSITY))) {
      if (!reserveLastSlotForMine(map, player, tile)) {
        // Hunger makes the university worth more: it unlocks Agronomy.
        const score = agronomyWanted ? 470 : universityReserve > 0 ? 320 : 220 * buildScale;
        candidates.push({ score: score + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.UNIVERSITY } });
      }
    }
    if (tile === openPortSite && canAffordAt(map, player, tile, BUILDING_COSTS.port)) {
      if (!reserveLastSlotForMine(map, player, tile) || situation?.navalThreat) {
        candidates.push({ score: (200 * buildScale) + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.PORT } });
      }
    }
    if (canBuildTemple(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.temple)) {
      if (!reserveLastSlotForMine(map, player, tile)) {
        candidates.push({ score: (200 * buildScale) + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.TEMPLE } });
      }
    }
    if (canBuildForestTemple(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.forestTemple)) {
      if (!reserveLastSlotForMine(map, player, tile)) {
        candidates.push({ score: (200 * buildScale) + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.FOREST_TEMPLE } });
      }
    }
  }
}
