import { AiActionType } from '@enums';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

export const CAPTURE_READY_VILLAGE_PATTERN: AiPattern = {
    id: 'capture-ready-village',
    priority: 500,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner !== unit.owner && t.settlement.captureReady && !unit.hasHealed) {
          state.acted.add(unit.id);
          return [{ type: AiActionType.CAPTURE, q: t.q, r: t.r, unitId: unit.id }];
        }
      }
      return null;
    },
  };
