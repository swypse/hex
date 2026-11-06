import { AiActionType, UnitType } from '@enums';
import { isExploredFor } from '../../../map/explore';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { attackDamage } from '../../../units/combat';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

export const STUNNER_PREFER_STUN_PATTERN: AiPattern = {
    id: 'stunner-prefer-stun',
    priority: 210,
    evaluate({ map, player, state }): AiAction[] | null {
      // The stunner is a regular ranged combat unit (it attacks like any
      // ranged unit), but when an enemy sits at full reach it prefers the stun:
      // no damage, no counter, and the target loses its turn.
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.STUNNER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) continue;
        let best: MapTile | null = null;
        let bestScore = -Infinity;
        for (const e of map.tiles) {
          if (!e.unit || e.unit.owner === player.index) continue;
          if (!isExploredFor(e, player.index)) continue;
          if (hexDistance(unit, e) !== 2) continue;
          const score = attackDamage(e.unit);
          if (score > bestScore) {
            bestScore = score;
            best = e;
          }
        }
        if (best) return [{ type: AiActionType.STUN, unitId: unit.id, q: best.q, r: best.r }];
      }
      return null;
    },
  };
