import { AiActionType } from '@enums';
import { hexDistance } from '../../../map/hex';
import { attackableTargets } from '../../../units/combat';
import type { Unit } from '../../../units/units';
import { landEnemyCanReach } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import { reachableCells } from '../../situation/reachable-cells';
import { unitHoldsVillage } from '../../spawn/hold-village';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const GARRISON_EMPTY_VILLAGE_PATTERN: AiPattern = {
    id: 'garrison-empty-village',
    priority: 92,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const v of map.tiles) {
        if (!v.settlement || v.settlement.owner !== player.index) continue;
        if (v.unit) continue;
        const vk = key(v.q, v.r);
        if (state.occupied.has(vk)) continue;
        if (!landEnemyCanReach(map, v, player.index)) continue;
        let best: { unit: Unit; dist: number } | null = null;
        for (const { tile: t, unit } of idleUnits(map, player, state)) {
          if (isSupportUnit(unit)) continue;
          if (t.settlement && t.settlement.owner === player.index) continue;
          // A unit that can strike an enemy keeps pressing that fight unless an
          // enemy could take the village next turn.
          if (attackableTargets(map, unit, player.index).length > 0 && !landEnemyCanReach(map, v, player.index, 1)) continue;
          const reach = reachableCells(map, player, unit);
          if (!reach.some((c) => c.q === v.q && c.r === v.r)) continue;
          // A unit the enemy would kill there only feeds it the village: keep it out.
          if (!unitHoldsVillage(map, v, player.index, unit)) continue;
          const dist = hexDistance(unit, v);
          if (!best || dist < best.dist) best = { unit, dist };
        }
        if (!best) continue;
        return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: v.q, r: v.r }];
      }
      return null;
    },
  };
