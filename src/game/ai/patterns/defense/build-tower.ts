import { AiActionType, BuildingKind } from '@enums';
import { bestTowerSite } from '../../defense/best-tower-site';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

export const BUILD_TOWER_PATTERN: AiPattern = {
    // Many enemies near a village: a tower between them and it, on the enemy's side.
    id: 'build-tower',
    priority: 93,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const v of map.tiles) {
        if (!v.settlement || v.settlement.owner !== player.index) continue;
        const site = bestTowerSite(map, player, v, state);
        if (site) return [{ type: AiActionType.BUILD, q: site.tile.q, r: site.tile.r, kind: BuildingKind.TOWER }];
      }
      return null;
    },
  };
