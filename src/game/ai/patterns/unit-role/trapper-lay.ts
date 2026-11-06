import { AiActionType, UnitType } from '@enums';
import { canAffordAt } from '../../../economy/stock';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { TRAP_COST, trapCells } from '../../../units/traps';
import { enemyCanAttackNext, enemyCanReach } from '../../situation/enemy-reach';
import { frontierTile } from '../../situation/frontier';
import { coastExposedTile } from '../../situation/naval-threats';
import { nearestEnemyDistanceFrom } from '../../situation/nearest-distances';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const TRAPPER_LAY_PATTERN: AiPattern = {
    id: 'trapper-lay',
    priority: 86,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      // The Forest trapper lays thorn traps on the front lines and never
      // fights: it stays back from combat and plants traps on likely enemy paths.
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.TRAPPER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;

        // Lay a trap now when affordable, on the best cell within reach.
        const spots = trapCells(map, t);
        if (spots.length > 0 && canAffordAt(map, player, t, TRAP_COST)) {
          let best: MapTile | null = null;
          let bestScore = -Infinity;
          for (const s of spots) {
            const frontier = frontierTile(map, s, player.index) ? 30 : 0;
            const nearEnemy = nearestEnemyDistanceFrom(map, player.index, s) <= 3 ? 20 : 0;
            const score = frontier + nearEnemy - hexDistance(t, s);
            if (score > bestScore) {
              bestScore = score;
              best = s;
            }
          }
          if (best) return [{ type: AiActionType.TRAP, unitId: unit.id, q: best.q, r: best.r }];
        }

        // Otherwise move toward a camp where a trap can cover a frontier tile.
        let bestStep: MapTile | null = null;
        let bestScore = -Infinity;
        for (const c of reachableCells(map, player, unit)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement) continue;
          if (enemyCanAttackNext(map, c, player.index)) continue;
          if (situation?.navalThreat && coastExposedTile(map, c, situation.navalEnemies)) continue;
          let cover = 0;
          for (const s of trapCells(map, c)) {
            if (frontierTile(map, s, player.index)) cover += 10;
          }
          const score = cover - hexDistance(t, c);
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
