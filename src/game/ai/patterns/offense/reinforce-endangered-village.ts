import { AiActionType,AiStance } from '@enums';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { attackableTargets } from '../../../units/combat';
import { type Unit,movePoints } from '../../../units/units';
import { idleUnits } from '../../situation/idle-units';
import { reachableCells } from '../../situation/reachable-cells';
import { unitHoldsVillage } from '../../spawn/hold-village';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const REINFORCE_ENDANGERED_VILLAGE_PATTERN: AiPattern = {
    id: 'reinforce-endangered-village',
    priority: 120,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || situation.stance !== AiStance.DEFEND) return null;
      let best: { unit: Unit; step: MapTile; villageKey: string; score: number } | null = null;
      for (const d of situation.dangers) {
        const v = d.village;
        const vk = key(v.q, v.r);
        if (state.occupied.has(vk) || state.spawned.has(vk)) continue;
        if (v.unit && v.unit.owner === player.index) continue;
        for (const { tile: t, unit } of idleUnits(map, player, state)) {
          if (isSupportUnit(unit)) continue;
          if (t.settlement && t.settlement.owner === player.index) continue;
          // A unit that can strike an enemy this turn is pressing that fight —
          // do not strip it for garrison duty (that causes pointless retreat
          // loops when the unit is the only one left).
          if (attackableTargets(map, unit, player.index).length > 0) continue;
          if (hexDistance(t, v) > (d.enemyTurns * movePoints(unit)) / 10) continue;
          // Never feed a unit the enemy would kill there into the village.
          if (v.settlement && !unitHoldsVillage(map, v, player.index, unit)) continue;
          const reach = reachableCells(map, player, unit).filter(
            (c) =>
              !state.occupied.has(key(c.q, c.r)) &&
              ((c.q === v.q && c.r === v.r) || !(c.settlement && c.settlement.owner === player.index)),
          );
          let bestStep: MapTile | null = null;
          let bestStepDist = Infinity;
          for (const c of reach) {
            const dist = hexDistance(c, v);
            if (dist < bestStepDist) {
              bestStepDist = dist;
              bestStep = c;
            }
          }
          if (!bestStep) continue;
          const score = hexDistance(t, v);
          if (!best || score < best.score) best = { unit, step: bestStep, villageKey: vk, score };
        }
      }
      if (!best) return null;
      state.occupied.add(best.villageKey);
      return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  };
