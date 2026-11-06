import { AiActionType } from '@enums';
import { buildingHp, canRepairBuilding, REPAIR_COST } from '../../../economy/buildings';
import { canAffordAt } from '../../../economy/stock';
import type { MapTile } from '../../../map/map-gen';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const REPAIR_BUILDING_PATTERN: AiPattern = {
    id: 'repair-building',
    priority: 71,
    evaluate({ map, player, state }): AiAction[] | null {
      let best: MapTile | null = null;
      let bestHp = Infinity;
      for (const tile of map.tiles) {
        if (state.built.has(key(tile.q, tile.r))) continue;
        if (!canRepairBuilding(map, tile, player)) continue;
        if (!canAffordAt(map, player, tile, REPAIR_COST)) continue;
        const hp = buildingHp(tile.building!);
        if (hp < bestHp) {
          bestHp = hp;
          best = tile;
        }
      }
      if (!best) return null;
      return [{ type: AiActionType.REPAIR, q: best.q, r: best.r }];
    },
  };
