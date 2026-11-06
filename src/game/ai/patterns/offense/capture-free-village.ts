import { AiActionType } from '@enums';
import { isExploredFor } from '../../../map/explore';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import type { Unit } from '../../../units/units';
import { enemyCanReach } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const CAPTURE_FREE_VILLAGE_PATTERN: AiPattern = {
    id: 'capture-free-village',
    priority: 130,
    evaluate({ map, player, state }): AiAction[] | null {
      let best: { unit: Unit; target: MapTile } | null = null;
      let bestDist = Infinity;
      for (const v of map.tiles) {
        if (!v.settlement || v.settlement.owner !== null) continue;
        if (!isExploredFor(v, player.index)) continue;
        if (state.occupied.has(key(v.q, v.r))) continue;
        if (v.unit && v.unit.owner === player.index) continue;
        for (const { tile: t, unit } of idleUnits(map, player, state)) {
          if (isSupportUnit(unit)) continue;
          if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
          if (
            !reachableCells(map, player, unit).some(
              (c) => c.q === v.q && c.r === v.r,
            )
          ) {
            continue;
          }
          const d = hexDistance(t, v);
          if (d < bestDist) {
            bestDist = d;
            best = { unit, target: v };
          }
        }
      }
      if (best) return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.target.q, r: best.target.r }];
      return null;
    },
  };
