import { t } from '../../i18n';
import { gameController } from '../../controller/game-controller';
import { isForestType, isMountainType, isWaterType } from '../../game/map/tile-types';
import { canPlaceFoodBuilding } from '../../game/economy/buildings';
import { hexNeighbors } from '../../game/map/hex';
import { hasSkill } from '../../game/skills';
import { canBuildRoadHere } from '../../game/economy/roads';
import { canBuildBridgeHere } from '../../game/economy/bridges';
import type { Player } from '../../game/players';
import type { MapTile } from '../../game/map/map-gen';
import { tileAt } from '../../game/map/tile-index';
import { BuildingKind, SkillId } from '@enums';

export interface SuggestedSkill {
  id: SkillId;
  label: string;
}

/** Skills worth opening for what the player sees on `tile` (terrain hints, next building unlocks). */
export function suggestedSkillActions(tile: MapTile, human: Player): SuggestedSkill[] {
  const actions: SuggestedSkill[] = [];
  const map = gameController.getMap();
  const push = (id: SkillId, label: string): void => {
    actions.push({ id, label });
  };

  if (isMountainType(tile.terrain)) {
    if (!hasSkill(human, SkillId.CLIMBING)) push(SkillId.CLIMBING, t('ui.openclimbing'));
    else if (!hasSkill(human, SkillId.SMITHERY)) push(SkillId.SMITHERY, t('ui.opensmithery'));
  } else if (isWaterType(tile.terrain)) {
    if (!hasSkill(human, SkillId.WATER)) push(SkillId.WATER, t('ui.openwater'));
    else {
      if (!hasSkill(human, SkillId.WATER_TEMPLES)) push(SkillId.WATER_TEMPLES, t('ui.openwatertemples'));
      if (!hasSkill(human, SkillId.NAVIGATION)) push(SkillId.NAVIGATION, t('ui.opennavigation'));
    }
  } else {
    const nearForest = isForestType(tile.terrain) || hexNeighbors(tile).some((n) => {
      const t = map ? tileAt(map, n.q, n.r) : undefined;
      return t !== undefined && isForestType(t.terrain);
    });
    if (nearForest && !hasSkill(human, SkillId.FORESTRY)) {
      push(SkillId.FORESTRY, t('ui.openforestry'));
    } else if (isForestType(tile.terrain) && hasSkill(human, SkillId.FORESTRY) && !hasSkill(human, SkillId.FOREST_TEMPLE)) {
      push(SkillId.FOREST_TEMPLE, t('ui.openforesttemples'));
    }
  }

  // Unlock hints for the next building skill whose chain is already open.
  if (map) {
    if (isMountainType(tile.terrain) && hasSkill(human, SkillId.SCIENCE) && !hasSkill(human, SkillId.GEOLOGY)) {
      push(SkillId.GEOLOGY, t('ui.opengeology'));
    }
    if (isWaterType(tile.terrain) && hasSkill(human, SkillId.RIDING) && !hasSkill(human, SkillId.BRIDGES) && canBuildBridgeHere(map, tile)) {
      push(SkillId.BRIDGES, t('ui.openbridges'));
    }
    if (!isWaterType(tile.terrain) && hasSkill(human, SkillId.FORESTRY) && !hasSkill(human, SkillId.ROADS) && canBuildRoadHere(map, tile, human)) {
      push(SkillId.ROADS, t('ui.openroads'));
    }
  }
  // Food buildings: hint at Agriculture on any own empty land tile, and at
  // Granary next to one of your farms.
  if (map && canPlaceFoodBuilding(tile, human)) {
    if (!hasSkill(human, SkillId.AGRICULTURE)) push(SkillId.AGRICULTURE, t('ui.openagriculture'));
    else if (
      !hasSkill(human, SkillId.GRANARY) &&
      hexNeighbors(tile).some((n) => {
        const nt = tileAt(map, n.q, n.r);
        return nt !== undefined && nt.building?.kind === BuildingKind.FARM && nt.ownedBy === human.index;
      })
    ) {
      push(SkillId.GRANARY, t('ui.opengranary'));
    }
  }
  if (
    tile.settlement &&
    tile.settlement.owner === human.index &&
    !tile.settlement.wall &&
    hasSkill(human, SkillId.SHIELDS) &&
    !hasSkill(human, SkillId.DEFENSE)
  ) {
    push(SkillId.DEFENSE, t('ui.opendefense'));
  }
  return actions;
}
