import { AiActionType, SkillId, UnitType } from '@enums';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { hasSkill } from '../../../skills';
import { attackableTargets } from '../../../units/combat';
import { reachableTargets } from '../../../units/selection';
import type { Unit } from '../../../units/units';
import { enemyCanReach } from '../../situation/enemy-reach';
import { coastExposedTile, isNavalEnemy } from '../../situation/naval-threats';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const NAVAL_POSITION_CATAPULT_PATTERN: AiPattern = {
    id: 'naval-position-catapult',
    priority: 73,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat || !situation.nearestNaval) return null;
      if (!hasSkill(player, SkillId.CATAPULT)) return null;
      const naval = situation.nearestNaval;
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      let best: { unit: Unit; step: MapTile; score: number } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.CATAPULT) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // A catapult garrisoning an endangered own village holds its ground.
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        // Already able to fire: leave it to the attack logic.
        if (attackableTargets(map, unit, player.index).some((a) => a.unit && isNavalEnemy(a.unit))) continue;
        const before = hexDistance(unit, naval.tile);
        for (const c of reachableTargets(map, unit, undefined, canClimb, false, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement) continue;
          const after = hexDistance(c, naval.tile);
          // Step closer each turn but never park within a pirate's easy reach
          // (range 3): hold the catapult at distance >= 4.
          if (after >= before || after < 4) continue;
          if (coastExposedTile(map, c, situation.navalEnemies)) continue;
          const score = -after;
          if (!best || score > best.score) best = { unit, step: c, score };
        }
      }
      if (!best) return null;
      return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  };
