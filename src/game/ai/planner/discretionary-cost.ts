import { AiActionType, BuildingKind, SkillId } from '@enums';
import { BRIDGE_COST } from '../../economy/bridges';
import { BUILDING_COSTS } from '../../economy/buildings';
import { moneyCost, type Resources, villageUpgradeCost } from '../../economy/resources';
import { ROAD_COST } from '../../economy/roads';
import { payerVillage } from '../../economy/stock';
import type { GameMap, MapTile } from '../../map/map-gen';
import { tileAt } from '../../map/tile-index';
import type { Player } from '../../players';
import { skillCost } from '../../skills';
import { unitSpawnCost } from '../../units/units';
import type { AiAction } from '../types/action';

/** Resources a discretionary action spends (null for actions that never
 *  compete with the first farm: mines, food buildings, food skills, moves). */
/** The village whose network pays for a planned action (undefined when the
 *  action is not tied to a tile). */
export function actionVillage(map: GameMap, player: Player, a: AiAction): MapTile | undefined {
  if ('q' in a && 'r' in a && typeof a.q === 'number' && typeof a.r === 'number') {
    const tile = tileAt(map, a.q, a.r);
    return (tile && payerVillage(map, player.index, tile)) ?? undefined;
  }
  return undefined;
}

export function discretionaryCost(map: GameMap, player: Player, a: AiAction): Resources | null {
  switch (a.type) {
    case AiActionType.UPGRADE: {
      const level = tileAt(map, a.q, a.r)?.settlement?.level;
      return level === undefined ? null : villageUpgradeCost(level);
    }
    case AiActionType.BUILD:
      return a.kind === BuildingKind.MINE || a.kind === BuildingKind.FARM || a.kind === BuildingKind.GRANARY || a.kind === BuildingKind.UNIVERSITY ? null : BUILDING_COSTS[a.kind];
    case AiActionType.SPAWN:
      return unitSpawnCost(a.unitType);
    case AiActionType.BUILD_ROAD:
      return ROAD_COST;
    case AiActionType.BUILD_BRIDGE:
      return BRIDGE_COST;
    case AiActionType.OPEN_SKILL: {
      if (a.skill === SkillId.AGRICULTURE || a.skill === SkillId.FORESTRY || a.skill === SkillId.CLIMBING || a.skill === SkillId.SMITHERY || a.skill === SkillId.GRANARY) return null;
      return moneyCost(skillCost(a.skill, player.skills.length));
    }
    default:
      return null;
  }
}
