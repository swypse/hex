import { AiActionType,UnitType } from '@enums';
import { isExploredFor } from '../../../map/explore';
import { hexDistance,hexNeighbors } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { tileAt } from '../../../map/tile-index';
import { isShip } from '../../../units/ship';
import type { Unit } from '../../../units/units';
import { enemyCanReach,isLikelyLethal } from '../../situation/enemy-reach';
import { isFrontierTile } from '../../situation/frontier';
import { idleUnits } from '../../situation/idle-units';
import { coastExposedTile } from '../../situation/naval-threats';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const EXPLORE_FRONTIER_PATTERN: AiPattern = {
    id: 'explore-frontier',
    priority: 70,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      let best: { unit: Unit; target: MapTile } | null = null;
      let bestScore = -Infinity;
      for (const { tile: t, unit } of idleUnits(map, player, state)) {
        // Support units stay on their jobs (build/trap/buff), not scouting.
        if (isSupportUnit(unit)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        for (const c of reachableCells(map, player, unit)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          // Don't explore into a beach a naval enemy can hit with land units
          // that cannot fight back (catapults and ships are the naval answer).
          if (situation?.navalThreat && !isShip(unit) && unit.type !== UnitType.CATAPULT && coastExposedTile(map, c, situation.navalEnemies)) continue;
          // Don't walk a scout into a spot where the enemy's combined reach is
          // likely lethal: a stalled scout beats a dead one.
          if (isLikelyLethal(map, c, player.index, unit)) continue;
          if (!isFrontierTile(map, c, player.index)) continue;
          const unexplored = hexNeighbors(c).filter((n) => {
            const nt = tileAt(map, n.q, n.r);
            return nt !== undefined && !isExploredFor(nt, player.index);
          }).length;
          const score = unexplored * 5 - hexDistance(t, c);
          if (score > bestScore) {
            bestScore = score;
            best = { unit, target: c };
          }
        }
      }
      if (best) return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.target.q, r: best.target.r }];
      return null;
    },
  };
