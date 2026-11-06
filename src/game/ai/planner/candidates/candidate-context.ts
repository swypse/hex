import { AiPace, BuildingKind, FoodPressure, Season, SkillId } from '@enums';
import { SeededRandom } from '../../../../util/random';
import { BUILDING_COSTS, buildingCostAt, canBuildGranary, canBuildPort, canBuildUniversity } from '../../../economy/buildings';
import { foodNetworkStates, foodPressure, needsWinterStorage } from '../../../economy/food';
import { canAffordAt } from '../../../economy/stock';
import type { GameMap, MapTile } from '../../../map/map-gen';
import type { Player } from '../../../players';
import { hasSkill, skillCost } from '../../../skills';
import type { AiDifficultyProfile } from '../../config/difficulty';
import { analyzeWater } from '../../economy/analyze-water';
import { bestOpenPortSite } from '../../economy/best-open-port-site';
import { planFoodFixes } from '../../economy/food/plan-food-fixes';
import { planGranarySpace } from '../../economy/food/plan-granary-space';
import { planWinterStorage } from '../../economy/food/plan-winter-storage';
import { reserveLastSlotForMine } from '../../economy/mine-slot';
import type { AiSituation } from '../../situation/situation';
import type { AiDirectives } from '../../types/directives';
import type { AiPlannerState } from '../../types/planner-state';

/** Everything the candidate generators read: the planning inputs plus the food, storage and port analysis of this step. */
export interface CandidateContext {
  map: GameMap;
  player: Player;
  rng: SeededRandom;
  state: AiPlannerState;
  situation: AiSituation | undefined;
  difficulty: AiDifficultyProfile | undefined;
  directives: AiDirectives | undefined;
  /** Random tie-breaker added to every score. */
  jitter: () => number;
  /** Slow and rushed paces scale down discretionary building scores. */
  buildScale: number;
  foodStates: ReturnType<typeof foodNetworkStates>;
  foodPlan: ReturnType<typeof planFoodFixes>;
  universityReserve: number;
  agronomyWanted: boolean;
  storage: ReturnType<typeof planWinterStorage>;
  storageScore: number;
  clearings: ReturnType<typeof planGranarySpace>;
  granarySite: boolean;
  storageReserve: number;
  water: ReturnType<typeof analyzeWater>;
  openPortSite: MapTile | null;
}

export function buildCandidateContext(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  state: AiPlannerState,
  situation: AiSituation | undefined,
  difficulty: AiDifficultyProfile | undefined,
  directives: AiDirectives | undefined,
): CandidateContext {
  const jitter = (): number => rng.next() * 60;
  const buildScale = directives?.pace === AiPace.SLOW ? 0.5 : directives?.pace === AiPace.RUSHED ? 0.6 : 1;
  // Food is planned per network of connected villages: each starving network
  // either gets a farm or a road to a network with a surplus, whichever is
  // cheaper per food gained.
  const foodStates = foodNetworkStates(map, player);
  const foodPlan = planFoodFixes(map, player, foodStates);
  // Agronomy (it needs a university) adds food to the farms of a village that
  // has one and keeps them producing in winter: a way out of hunger once the
  // AI has farms, so it opens the skill, or builds the university it needs.
  // A university the AI can place and pay for in materials: it saves up the
  // money for it (skills and spawns would otherwise keep the purse below 40).
  const universitySite = hasSkill(player, SkillId.SCIENCE)
    ? map.tiles.find((t) => canBuildUniversity(map, t, player) && !reserveLastSlotForMine(map, player, t)
      && canAffordAt(map, player, t, { ...buildingCostAt(map, player, t, BuildingKind.UNIVERSITY), money: 0 }))
    : undefined;
  const universityReserve = universitySite ? BUILDING_COSTS.university.money : 0;
  const hasFarm = map.tiles.some((t) => t.ownedBy === player.index && t.building?.kind === BuildingKind.FARM);
  const agronomyWanted = hasSkill(player, SkillId.AGRICULTURE) && !hasSkill(player, SkillId.AGRONOMY) && hasFarm
    && (foodPressure(map, player) !== FoodPressure.NONE || foodStates.some((n) => needsWinterStorage(map, n)));
  // Farms give nothing in winter: a network with no granary eats from nothing
  // then, so it builds one (or is linked to a network that has one) before.
  const storage = planWinterStorage(map, player, foodStates);
  const storageScore = map.season === Season.SPRING ? 300 : 520;
  // Money kept for the granary (or the skill that unlocks it) a network needs
  // before winter, so other spends do not keep the purse below its price.
  // A network whose farms are boxed in by other buildings demolishes one for it.
  const clearings = planGranarySpace(map, player, foodStates, storage.needy);
  const granarySite = storage.needy.size > 0 && (clearings.length > 0 || map.tiles.some((t) => canBuildGranary(map, t, player)));
  const storageReserve = storage.needy.size === 0 ? 0
    : !hasSkill(player, SkillId.GRANARY) ? (hasSkill(player, SkillId.AGRICULTURE) ? skillCost(SkillId.GRANARY, player.skills.length) : 0)
      : granarySite ? BUILDING_COSTS.granary.money : BUILDING_COSTS.farm.money;
  // A port for its own sake: one site, where it opens the ocean or a way to the enemy (never a pond).
  const water = analyzeWater(map, player.index);
  const openPortSite = hasSkill(player, SkillId.WATER) ? bestOpenPortSite(water, map.tiles.filter((t) => canBuildPort(map, t, player))) : null;
  return { map, player, rng, state, situation, difficulty, directives, jitter, buildScale, foodStates, foodPlan, universityReserve, agronomyWanted, storage, storageScore, clearings, granarySite, storageReserve, water, openPortSite };
}
