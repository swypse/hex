import { AiActionType } from '@enums';
import { canUpgradeShip } from '../../../units/ship';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

export const UPGRADE_SHIP_PATTERN: AiPattern = {
    // A ship is upgraded the moment it is affordable, before it fights as level 1.
    id: 'upgrade-ship',
    priority: 215,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.shipLevel === undefined || unit.shipLevel >= 3) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (!canUpgradeShip(map, unit, t, player)) continue;
        return [{ type: AiActionType.UPGRADE_SHIP, unitId: unit.id }];
      }
      return null;
    },
  };
