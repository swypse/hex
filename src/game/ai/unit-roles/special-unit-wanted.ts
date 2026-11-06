import { AiStance,SkillId,UnitType } from '@enums';
import { buildingsInVillage,villageBuildingLimit } from '../../economy/village';
import { isExploredFor } from '../../map/explore';
import type { GameMap } from '../../map/map-gen';
import { isMountainType } from '../../map/tile-types';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { TRIBE_SPECIAL_UNIT } from '../../tribes';
import { frontierTile } from '../situation/frontier';
import type { AiSituation } from '../situation/situation';

/** Own unbuilt mountain the Villagers builder could turn into a mine (owned,
 *  claimed by an own settlement with a free slot). */
function builderHasMineToBuild(map: GameMap, player: Player): boolean {
  return map.tiles.some((t) => {
    if (t.ownedBy !== player.index || t.building || t.settlement) return false;
    if (!isMountainType(t.terrain)) return false;
    if (!t.claimedByVillage) return false;
    const village = map.tiles.find(
      (x) => x.q === t.claimedByVillage!.q && x.r === t.claimedByVillage!.r && x.settlement?.owner === player.index,
    );
    return village !== undefined && buildingsInVillage(map, village) < villageBuildingLimit(village.settlement!.level);
  });
}

/** The builder is summoned when a mine is wanted but no mining skill is open:
 *  only then does the builder, who builds without any skill, unlock it. */
function builderWanted(map: GameMap, player: Player): boolean {
  if (hasSkill(player, SkillId.SMITHERY)) return false;
  if (!builderHasMineToBuild(map, player)) {
    // No mine site yet, but a bare owned mountain claim list is enough to aim for.
    if (!map.tiles.some((t) => t.ownedBy === player.index && !t.building && !t.settlement && isMountainType(t.terrain))) return false;
  }
  return true;
}

/** Whether the tribe's special unit is worth fielding right now. */
export function specialUnitWanted(
  map: GameMap,
  player: Player,
  situation: AiSituation | undefined,
): boolean {
  const special = TRIBE_SPECIAL_UNIT[player.tribe];
  switch (special) {
    case UnitType.STORMCALLER:
      return !!situation?.navalThreat;
    case UnitType.BANNER:
      return map.tiles.filter((t) => t.unit && t.unit.owner === player.index).length >= 3;
    case UnitType.STALKER:
      return map.tiles.some((t) => !isExploredFor(t, player.index)) || map.tiles.some((t) => t.settlement && t.settlement.owner !== player.index);
    case UnitType.TRAPPER:
      return map.tiles.some((t) => t.ownedBy === player.index && frontierTile(map, t, player.index));
    case UnitType.BUILDER:
      return builderWanted(map, player);
    case UnitType.STUNNER:
    case UnitType.BERSERKER:
      return (situation?.enemies.length ?? 0) > 0 || situation?.stance === AiStance.WAR;
    default:
      return false;
  }
}
