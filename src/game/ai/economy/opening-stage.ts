import { BuildingKind, OpeningStage, SkillId } from '@enums';
import { canBuildFarm, canBuildGranary, canBuildMine, canBuildSawmill } from '../../economy/buildings';
import { capitalOf } from '../../economy/stock';
import { hexNeighbors } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import { isForestType, isMountainType } from '../../map/tile-types';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { flagsFor } from '../config/flags';
import { isClaimedBy } from '../situation/is-claimed-by';
import type { AiPlannerState } from '../types/planner-state';

/** Level the first village is raised to before anything is built (two slots:
 *  a sawmill and a mine). */
const OPENING_VILLAGE_LEVEL = 2;

/** Skills a stage needs, in the order they are learned. */
export const STAGE_SKILLS: Record<OpeningStage, SkillId[]> = {
  [OpeningStage.UPGRADE]: [],
  [OpeningStage.SAWMILL]: [SkillId.FORESTRY],
  [OpeningStage.MINE]: [SkillId.CLIMBING, SkillId.SMITHERY],
  [OpeningStage.FARM]: [SkillId.AGRICULTURE],
  [OpeningStage.GRANARY]: [SkillId.GRANARY],
};

export const STAGE_BUILDING: Partial<Record<OpeningStage, BuildingKind>> = {
  [OpeningStage.SAWMILL]: BuildingKind.SAWMILL,
  [OpeningStage.MINE]: BuildingKind.MINE,
  [OpeningStage.FARM]: BuildingKind.FARM,
  [OpeningStage.GRANARY]: BuildingKind.GRANARY,
};

/** Whether the terrain around the village allows the stage's building at all
 *  (a village with no forest or mountain skips that stage). */
export function stageFeasible(map: GameMap, v: MapTile, stage: OpeningStage): boolean {
  const tiles = map.tiles.filter((t) => isClaimedBy(t, v));
  if (stage === OpeningStage.SAWMILL) {
    return tiles.some((t) => !t.building && !t.settlement && hexNeighbors(t).some((n) => {
      const nt = map.tiles.find((x) => x.q === n.q && x.r === n.r);
      return nt !== undefined && isForestType(nt.terrain);
    }));
  }
  if (stage === OpeningStage.MINE) return tiles.some((t) => !t.building && !t.settlement && isMountainType(t.terrain));
  return true;
}

export const CAN_BUILD: Record<string, typeof canBuildMine> = {
  [BuildingKind.SAWMILL]: canBuildSawmill,
  [BuildingKind.MINE]: canBuildMine,
  [BuildingKind.FARM]: canBuildFarm,
  [BuildingKind.GRANARY]: canBuildGranary,
};

/** The first stage of the opening order the player's first village has not
 *  reached yet (null once it has a granary, or it has no first village). */
export function openingStage(map: GameMap, player: Player, planned?: AiPlannerState): OpeningStage | null {
  const v = capitalOf(map, player.index);
  if (!v?.settlement) return null;
  if (v.settlement.level < OPENING_VILLAGE_LEVEL && !planned?.upgraded.has(`${v.q},${v.r}`)) return OpeningStage.UPGRADE;
  const tiles = map.tiles.filter((t) => isClaimedBy(t, v));
  const order = flagsFor(player).earlyFarm
    ? [OpeningStage.SAWMILL, OpeningStage.FARM, OpeningStage.MINE, OpeningStage.GRANARY]
    : [OpeningStage.SAWMILL, OpeningStage.MINE, OpeningStage.FARM, OpeningStage.GRANARY];
  for (const stage of order) {
    if (tiles.some((t) => t.building?.kind === STAGE_BUILDING[stage]) || planned?.plannedKinds?.has(STAGE_BUILDING[stage]!)) continue;
    if (!stageFeasible(map, v, stage)) continue;
    // Skills learned and still no place to build it (slots full): skip rather than wait forever.
    if (STAGE_SKILLS[stage].every((sk) => hasSkill(player, sk)) && !tiles.some((t) => CAN_BUILD[STAGE_BUILDING[stage]!]!(map, t, player))) continue;
    return stage;
  }
  return null;
}
