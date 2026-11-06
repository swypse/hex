import { AiActionType } from '@enums';
import { isExploredFor } from '../../../map/explore';
import { enemyCanReach } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const CAPTURE_PUSH_PATTERN: AiPattern = {
    id: 'capture-push',
    priority: 110,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const t of map.tiles) {
        if (!t.settlement || t.settlement.owner === player.index) continue;
        if (!isExploredFor(t, player.index)) continue;
        if (t.settlement.captureReady) continue;
        if (t.unit && t.unit.owner === player.index) continue;
        for (const { tile: src, unit } of idleUnits(map, player, state)) {
          if (isSupportUnit(unit)) continue;
          // Don't strip the last defender from a village an enemy could reach.
          if (src.settlement && src.settlement.owner === player.index && enemyCanReach(map, src, player.index)) continue;
          if (state.occupied.has(key(t.q, t.r))) continue;
          const canReach = reachableCells(map, player, unit).some(
            (c) => c.q === t.q && c.r === t.r,
          );
          if (!canReach) continue;
          return [{ type: AiActionType.MOVE, unitId: unit.id, q: t.q, r: t.r }];
        }
      }
      return null;
    },
  };
