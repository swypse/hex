import { AiActionType,UnitType } from '@enums';
import { isExploredFor } from '../../../map/explore';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { attackDamage,attackableTargets } from '../../../units/combat';
import { enemyCanReach } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import { nearestEnemyDistanceFrom } from '../../situation/nearest-distances';
import { reachableCells } from '../../situation/reachable-cells';
import { unitHoldsVillage } from '../../spawn/hold-village';
import type { AiAction } from '../../types/action';
import { berserkerShouldPress } from '../../unit-roles/berserker-press';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const COUNTER_THREAT_PATTERN: AiPattern = {
    id: 'counter-threat',
    priority: 95,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const { tile: t, unit } of idleUnits(map, player, state)) {
        // Support units don't retaliate and the stalker avoids combat entirely.
        if (isSupportUnit(unit) || unit.type === UnitType.STALKER) continue;
        // Ships have their own naval-hunt pattern; don't retreat them here.
        if (unit.shipLevel !== undefined) continue;
        if (berserkerShouldPress(map, player, unit)) continue;
        // Don't retreat the last defender out of an endangered own village;
        // defend-hurt-unit decides whether it heals, retreats+spawns, or holds.
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        for (const e of map.tiles) {
          const enemy = e.unit;
          if (!enemy || enemy.owner === player.index) continue;
          if (!isExploredFor(e, player.index)) continue;
          if (hexDistance(t, e) > enemy.attackDistance) continue;
          if (attackDamage(enemy) < unit.hp) continue;
          const canKill = attackableTargets(map, unit, player.index).some((a) => a.q === e.q && a.r === e.r) && attackDamage(unit) >= enemy.hp;
          if (canKill) return [{ type: AiActionType.ATTACK, unitId: unit.id, q: e.q, r: e.r }];
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
      }
      return null;
    },
  };
