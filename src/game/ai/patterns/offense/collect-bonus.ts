import { AiActionType } from '@enums';
import { isExploredFor } from '../../../map/explore';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { attackableTargets } from '../../../units/combat';
import type { Unit } from '../../../units/units';
import { enemyCanReach } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const COLLECT_BONUS_PATTERN: AiPattern = {
    id: 'collect-bonus',
    priority: 125,
    evaluate({ map, player, state }): AiAction[] | null {
      const goals: MapTile[] = [];
      for (const t of map.tiles) {
        if (!t.bonus) continue;
        if (!isExploredFor(t, player.index)) continue;
        if (t.unit) continue;
        if (t.bonus.claimer === player.index) continue;
        goals.push(t);
      }
      if (goals.length === 0) return null;
      let best: { unit: Unit; step: MapTile; score: number } | null = null;
      for (const { tile: t, unit } of idleUnits(map, player, state)) {
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        const targets = reachableCells(map, player, unit).filter(
          (c) => !state.occupied.has(key(c.q, c.r)) && !(c.settlement && c.settlement.owner === player.index),
        );
        if (targets.length === 0) continue;
        // Let combat go first: skip units that could move into an attack this turn.
        let canStrike = false;
        for (const c of targets) {
          const ghost: Unit = { ...unit, q: c.q, r: c.r };
          if (attackableTargets(map, ghost, unit.owner).length > 0) {
            canStrike = true;
            break;
          }
        }
        if (canStrike) continue;
        for (const g of goals) {
          const before = hexDistance(t, g);
          if (before === 0) continue;
          for (const c of targets) {
            const after = hexDistance(c, g);
            if (after >= before) continue;
            const score = after;
            if (best === null || score < best.score) best = { unit, step: c, score };
          }
        }
      }
      if (!best) return null;
      return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  };
