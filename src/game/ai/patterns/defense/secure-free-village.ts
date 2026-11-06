import { AiActionType } from '@enums';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import type { Unit } from '../../../units/units';
import { enemyCanAttackNext,enemyCanReach } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const SECURE_FREE_VILLAGE_PATTERN: AiPattern = {
    id: 'secure-free-village',
    priority: 105,
    evaluate({ map, player, state }): AiAction[] | null {
      let best: { unit: Unit; target: MapTile; villageKey: string } | null = null;
      let bestScore = Infinity;
      for (const v of map.tiles) {
        if (!v.settlement || v.settlement.owner !== null) continue;
        const vk = key(v.q, v.r);
        if (state.occupied.has(vk)) continue;
        if (v.unit && v.unit.owner === player.index) continue;
        for (const { tile: t, unit } of idleUnits(map, player, state)) {
          if (isSupportUnit(unit)) continue;
          if (enemyCanAttackNext(map, t, player.index)) continue;
          if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
          const reach = reachableCells(map, player, unit).filter(
            (c) => !state.occupied.has(key(c.q, c.r)) && !(c.settlement && c.settlement.owner === player.index),
          );
          let bestStep: MapTile | null = null;
          let bestStepDist = Infinity;
          for (const c of reach) {
            const d = hexDistance(c, v);
            if (d < bestStepDist) {
              bestStepDist = d;
              bestStep = c;
            }
          }
          if (!bestStep) continue;
          const score = hexDistance(t, v);
          if (score < bestScore) {
            bestScore = score;
            best = { unit, target: bestStep, villageKey: vk };
          }
        }
      }
      if (best) {
        state.occupied.add(best.villageKey);
        return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.target.q, r: best.target.r }];
      }
      return null;
    },
  };
