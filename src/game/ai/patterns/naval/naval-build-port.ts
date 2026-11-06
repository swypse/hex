import { AiActionType, BuildingKind, SkillId } from '@enums';
import { BUILDING_COSTS, canBuildPort } from '../../../economy/buildings';
import { canAffordAt } from '../../../economy/stock';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { hasSkill } from '../../../skills';
import { analyzeWater } from '../../economy/analyze-water';
import { portSiteValue } from '../../economy/port-site-value';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const NAVAL_BUILD_PORT_PATTERN: AiPattern = {
    id: 'naval-build-port',
    priority: 77,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat || !situation.nearestNaval) return null;
      if (!hasSkill(player, SkillId.WATER)) return null;
      const naval = situation.nearestNaval;
      let best: MapTile | null = null;
      let bestDist = Infinity;
      const water = analyzeWater(map, player.index);
      for (const tile of map.tiles) {
        if (state.built.has(key(tile.q, tile.r))) continue;
        if (!canBuildPort(map, tile, player)) continue;
        // A pond cannot hold a fleet.
        if (portSiteValue(water, tile) === -Infinity) continue;
        if (!canAffordAt(map, player, tile, BUILDING_COSTS.port)) continue;
        const d = hexDistance(tile, naval.tile);
        if (d < bestDist) {
          bestDist = d;
          best = tile;
        }
      }
      if (!best) return null;
      return [{ type: AiActionType.BUILD, q: best.q, r: best.r, kind: BuildingKind.PORT }];
    },
  };
