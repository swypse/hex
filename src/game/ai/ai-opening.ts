import { BUILDING_COSTS, canBuildFarm, canBuildGranary, canBuildMine, canBuildSawmill } from '../economy/buildings';
import { canAffordAt, capitalOf } from '../economy/stock';
import { villageUpgradeCost } from '../economy/resources';
import type { AiSituation } from './ai-situation';
import type { AiAction, AiPlannerState } from './ai-types';
import type { GameMap, MapTile } from '../map/map-gen';
import type { Player } from '../players';
import { canOpenSkill, hasSkill } from '../skills';
import { isForestType, isMountainType } from '../map/tile-types';
import { hexNeighbors } from '../map/hex';
import { foodPressure } from '../economy/food';
import { nearestEnemyDistanceFrom } from './ai-patterns';
import { AiActionType, BuildingKind, FoodPressure, OpeningStage, SkillId } from '@enums';

/** Level the first village is raised to before anything is built (two slots:
 *  a sawmill and a mine). */
const OPENING_VILLAGE_LEVEL = 2;

/** Skills a stage needs, in the order they are learned. */
const STAGE_SKILLS: Record<OpeningStage, SkillId[]> = {
  [OpeningStage.UPGRADE]: [],
  [OpeningStage.SAWMILL]: [SkillId.FORESTRY],
  [OpeningStage.MINE]: [SkillId.CLIMBING, SkillId.SMITHERY],
  [OpeningStage.FARM]: [SkillId.AGRICULTURE],
  [OpeningStage.GRANARY]: [SkillId.GRANARY],
};

const STAGE_BUILDING: Partial<Record<OpeningStage, BuildingKind>> = {
  [OpeningStage.SAWMILL]: BuildingKind.SAWMILL,
  [OpeningStage.MINE]: BuildingKind.MINE,
  [OpeningStage.FARM]: BuildingKind.FARM,
  [OpeningStage.GRANARY]: BuildingKind.GRANARY,
};

function claimedBy(map: GameMap, v: MapTile): MapTile[] {
  return map.tiles.filter((t) => t.claimedByVillage && t.claimedByVillage.q === v.q && t.claimedByVillage.r === v.r);
}

/** Whether the terrain around the village allows the stage's building at all
 *  (a village with no forest or mountain skips that stage). */
function stageFeasible(map: GameMap, v: MapTile, stage: OpeningStage): boolean {
  const tiles = claimedBy(map, v);
  if (stage === OpeningStage.SAWMILL) {
    return tiles.some((t) => !t.building && !t.settlement && hexNeighbors(t).some((n) => {
      const nt = map.tiles.find((x) => x.q === n.q && x.r === n.r);
      return nt !== undefined && isForestType(nt.terrain);
    }));
  }
  if (stage === OpeningStage.MINE) return tiles.some((t) => !t.building && !t.settlement && isMountainType(t.terrain));
  return true;
}

const CAN_BUILD: Record<string, typeof canBuildMine> = {
  [BuildingKind.SAWMILL]: canBuildSawmill,
  [BuildingKind.MINE]: canBuildMine,
  [BuildingKind.FARM]: canBuildFarm,
  [BuildingKind.GRANARY]: canBuildGranary,
};

/** The first stage of the opening order the player's first village has not
 *  reached yet (null once it has a granary, or it has no first village). */
function openingStage(map: GameMap, player: Player, planned?: AiPlannerState): OpeningStage | null {
  const v = capitalOf(map, player.index);
  if (!v?.settlement) return null;
  if (v.settlement.level < OPENING_VILLAGE_LEVEL && !planned?.upgraded.has(`${v.q},${v.r}`)) return OpeningStage.UPGRADE;
  const tiles = claimedBy(map, v);
  for (const stage of [OpeningStage.SAWMILL, OpeningStage.MINE, OpeningStage.FARM, OpeningStage.GRANARY]) {
    if (tiles.some((t) => t.building?.kind === STAGE_BUILDING[stage]) || planned?.plannedKinds?.has(STAGE_BUILDING[stage]!)) continue;
    if (!stageFeasible(map, v, stage)) continue;
    // Skills learned and still no place to build it (slots full): skip rather than wait forever.
    if (STAGE_SKILLS[stage].every((sk) => hasSkill(player, sk)) && !tiles.some((t) => CAN_BUILD[STAGE_BUILDING[stage]!]!(map, t, player))) continue;
    return stage;
  }
  return null;
}

/** The next step towards the current stage: build it when possible, otherwise
 *  learn the skill it needs. Null while waiting for money or materials. */
export function openingAction(map: GameMap, player: Player, done: AiPlannerState): AiAction[] | null {
  const stage = openingStage(map, player, done);
  const v = capitalOf(map, player.index);
  if (!stage || !v?.settlement) return null;
  if (stage === OpeningStage.UPGRADE) {
    if (done.upgraded.has(`${v.q},${v.r}`)) return null;
    return canAffordAt(map, player, v, villageUpgradeCost(v.settlement.level)) ? [{ type: AiActionType.UPGRADE, q: v.q, r: v.r }] : null;
  }
  const skill = STAGE_SKILLS[stage].find((s) => !hasSkill(player, s));
  if (skill) return !done.opened.has(skill) && canOpenSkill(player, skill, map) ? [{ type: AiActionType.OPEN_SKILL, skill }] : null;
  const kind = STAGE_BUILDING[stage]!;
  const tiles = claimedBy(map, v).filter((t) => !done.built.has(`${t.q},${t.r}`) && CAN_BUILD[kind]!(map, t, player));
  const site = tiles[0];
  if (!site || !canAffordAt(map, player, site, BUILDING_COSTS[kind as keyof typeof BUILDING_COSTS])) return null;
  return [{ type: AiActionType.BUILD, q: site.q, r: site.r, kind }];
}

/** Whether `action` spends on a building or upgrade that is not the current
 *  opening step, so it waits until the first village has its granary. */
export function blockedByOpening(map: GameMap, player: Player, action: AiAction, situation?: AiSituation, planned?: AiPlannerState): boolean {
  const stage = openingStage(map, player, planned);
  if (!stage) return false;
  const v = capitalOf(map, player.index);
  if (action.type === AiActionType.UPGRADE) {
    if (v !== null && action.q === v.q && action.r === v.r) return stage !== OpeningStage.UPGRADE;
    const front = map.tiles.find((t) => t.q === action.q && t.r === action.r);
    return !(front && nearestEnemyDistanceFrom(map, player.index, front) <= 4);
  }
  if (action.type === AiActionType.BUILD) {
    if (STAGE_BUILDING[stage] === action.kind) return false;
    if (action.kind === BuildingKind.PORT && situation?.navalThreat) return false;
    // Hunger overrides the order: a farm or granary may come early.
    return !((action.kind === BuildingKind.FARM || action.kind === BuildingKind.GRANARY) && foodPressure(map, player) === FoodPressure.URGENT);
  }
  return false;
}
