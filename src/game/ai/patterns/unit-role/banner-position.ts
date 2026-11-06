import { AiActionType, UnitType } from '@enums';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { enemyCanAttackNext } from '../../situation/enemy-reach';
import { friendlyUnitsWithin } from '../../situation/friendly-units-within';
import { coastExposedTile } from '../../situation/naval-threats';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const BANNER_POSITION_PATTERN: AiPattern = {
    id: 'banner-position',
    priority: 88,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      // The banner is an aura (friends within 2 hexes get +5 attack): keep it
      // next to the army cluster and never send it into a fight.
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.BANNER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // Already covering at least two friends: hold position.
        if (friendlyUnitsWithin(map, player.index, t, 2) >= 2) continue;
        let bestStep: MapTile | null = null;
        let bestScore = -Infinity;
        for (const c of reachableCells(map, player, unit)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement && c.settlement.owner !== player.index) continue;
          if (enemyCanAttackNext(map, c, player.index)) continue;
          if (situation?.navalThreat && coastExposedTile(map, c, situation.navalEnemies)) continue;
          const allies = friendlyUnitsWithin(map, player.index, c, 2);
          const score = allies * 20 - hexDistance(t, c);
          if (score > bestScore) {
            bestScore = score;
            bestStep = c;
          }
        }
        if (bestStep && bestScore > 0) return [{ type: AiActionType.MOVE, unitId: unit.id, q: bestStep.q, r: bestStep.r }];
      }
      return null;
    },
  };
