import { AiActionType } from '@enums';
import type { MapTile } from '../../../map/map-gen';
import { unitMaxHp } from '../../../units/units';
import { personalityFor } from '../../config/personality';
import { enemyCanAttackNext } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import { nearestEnemyDistanceFrom } from '../../situation/nearest-distances';
import { reachableCells } from '../../situation/reachable-cells';
import { unitHoldsVillage } from '../../spawn/hold-village';
import type { AiAction } from '../../types/action';
import { berserkerShouldPress } from '../../unit-roles/berserker-press';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const RETREAT_HEAL_PATTERN: AiPattern = {
    id: 'retreat-heal',
    priority: 85,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const { tile: t, unit } of idleUnits(map, player, state)) {
        if (unit.hp > unitMaxHp(unit) * personalityFor(player).retreatHpRatio) continue;
        if (berserkerShouldPress(map, player, unit)) continue;
        if (t.settlement && t.settlement.owner === player.index) continue;
        if (!enemyCanAttackNext(map, t, player.index)) continue;
        let best: MapTile | null = null;
        let bestDist = -Infinity;
        for (const c of reachableCells(map, player, unit)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement && c.settlement.owner === unit.owner && unitHoldsVillage(map, c, player.index, unit)) {
            best = c;
            break;
          }
          const d = nearestEnemyDistanceFrom(map, player.index, c);
          if (d > bestDist) {
            bestDist = d;
            best = c;
          }
        }
        if (best) return [{ type: AiActionType.MOVE, unitId: unit.id, q: best.q, r: best.r }];
      }
      return null;
    },
  };
