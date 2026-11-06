import { AiActionType, SkillId, UnitType } from '@enums';
import { hexDistance } from '../../../map/hex';
import { hasSkill } from '../../../skills';
import { reachableTargets } from '../../../units/selection';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const ARCHER_KITE_PATTERN: AiPattern = {
    id: 'archer-kite',
    priority: 80,
    evaluate({ map, player, rng, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.ARCHER) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement) continue;
        const enemy = map.tiles.find(
          (e) => e.unit && e.unit.owner !== player.index && hexDistance(t, e) === 1,
        );
        if (!enemy) continue;
        const targets = reachableTargets(map, unit, undefined, undefined, hasSkill(player, SkillId.NAVIGATION), unit.owner).filter(
          (c) => hexDistance(enemy, c) === 2 && !state.occupied.has(key(c.q, c.r)),
        );
        if (targets.length === 0) continue;
        const target = targets[Math.floor(rng.next() * targets.length)]!;
        return [
          { type: AiActionType.MOVE, unitId: unit.id, q: target.q, r: target.r },
          { type: AiActionType.ATTACK, unitId: unit.id, q: enemy.q, r: enemy.r },
        ];
      }
      return null;
    },
  };
