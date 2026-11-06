import { AiActionType, UnitType } from '@enums';
import { adjacentEnemyVillages } from '../../../units/stalker';
import { STALKER_STEALTH_RADIUS } from '../../config/tuning';
import { nearestEnemyDistanceFrom } from '../../situation/nearest-distances';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

export const STALKER_RESTEALTH_PATTERN: AiPattern = {
    id: 'stalker-restealth',
    priority: 132,
    evaluate({ map, player, state }): AiAction[] | null {
      // A stalker exposed near the enemy re-hides (stealth is lost by attacking
      // or ending a move beside an enemy village). Far from danger it stays
      // visible and scouts instead — hiding pointlessly wastes a whole turn.
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.STALKER || unit.shipLevel !== undefined) continue;
        if (unit.isStealthed) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) continue;
        // The holster cannot hide while standing beside an enemy village.
        if (adjacentEnemyVillages(map, unit, player.index).length > 0) continue;
        if (nearestEnemyDistanceFrom(map, player.index, t) > STALKER_STEALTH_RADIUS) continue;
        return [{ type: AiActionType.ENABLE_STEALTH, unitId: unit.id }];
      }
      return null;
    },
  };
