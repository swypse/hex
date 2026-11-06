import { AiActionType, UnitType } from '@enums';
import type { MapTile } from '../../../map/map-gen';
import { incomingForceAt } from '../../situation/enemy-reach';
import { nearestEnemyDistanceFrom } from '../../situation/nearest-distances';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const RIDER_POST_ATTACK_RETREAT_PATTERN: AiPattern = {
    // A rider that attacked keeps its move points: spend them on a tile no enemy
    // can hit next turn. Needs the live board (hasAttacked is set by the attack).
    id: 'rider-post-attack-retreat',
    priority: 218,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index || unit.type !== UnitType.RIDER) continue;
        if (!unit.hasAttacked || unit.hasMoved || state.moved.has(unit.id)) continue;
        if (unit.shipLevel !== undefined || (unit.stunTurns ?? 0) >= 1) continue;
        state.moved.add(unit.id);
        if (incomingForceAt(map, t, player.index) === 0) continue;
        // A garrison stays to hold its village.
        if (t.settlement && t.settlement.owner === player.index) continue;
        let best: MapTile | null = null;
        let bestScore = -Infinity;
        for (const c of reachableCells(map, player, unit)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement && c.settlement.owner !== unit.owner) continue;
          if (incomingForceAt(map, c, player.index) > 0) continue;
          const score = c.settlement?.owner === unit.owner ? 1000 : Math.min(nearestEnemyDistanceFrom(map, player.index, c), 50);
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        if (best) return [{ type: AiActionType.MOVE, unitId: unit.id, q: best.q, r: best.r }];
      }
      return null;
    },
  };
