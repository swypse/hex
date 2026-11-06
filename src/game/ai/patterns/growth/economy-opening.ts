import { AiActionType, BuildingKind } from '@enums';
import { BUILDING_COSTS, canBuildMine, canBuildSawmill } from '../../../economy/buildings';
import { eatsFarmMaterials } from '../../../economy/food';
import { villageUpgradeCost } from '../../../economy/resources';
import { canAffordAt } from '../../../economy/stock';
import { nearestEnemyDistanceFrom } from '../../situation/nearest-distances';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const ECONOMY_OPENING_PATTERN: AiPattern = {
    id: 'economy-opening',
    priority: 25,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      // Naval threats take priority: save the money for the naval response.
      if (situation?.navalThreat) return null;
      const ownUnits = map.tiles.filter((t) => t.unit && t.unit.owner === player.index).length;
      if (ownUnits > 4) return null;
      for (const t of map.tiles) {
        if (!t.settlement || t.settlement.owner !== player.index) continue;
        const k = key(t.q, t.r);
        if (state.upgraded.has(k)) continue;
        if (!canAffordAt(map, player, t, villageUpgradeCost(t.settlement.level))) continue;
        if (eatsFarmMaterials(map, player, villageUpgradeCost(t.settlement.level), t)) continue;
        const front = nearestEnemyDistanceFrom(map, player.index, t) <= 4;
        if (front || ownUnits <= 2) return [{ type: AiActionType.UPGRADE, q: t.q, r: t.r }];
      }
      for (const tile of map.tiles) {
        if (tile.ownedBy !== player.index) continue;
        if (state.built.has(key(tile.q, tile.r))) continue;
        if (canBuildMine(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.mine)) {
          return [{ type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.MINE }];
        }
        if (canBuildSawmill(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.sawmill)) {
          return [{ type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.SAWMILL }];
        }
      }
      return null;
    },
  };
