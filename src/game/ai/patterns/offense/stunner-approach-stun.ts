import { AiActionType,UnitType } from '@enums';
import { isExploredFor } from '../../../map/explore';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { attackDamage } from '../../../units/combat';
import { flagsFor } from '../../config/flags';
import { STUN_MIN_DAMAGE } from '../../config/tuning';
import { enemyCanReach } from '../../situation/enemy-reach';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const STUNNER_APPROACH_STUN_PATTERN: AiPattern = {
    id: 'stunner-approach-stun',
    priority: 205,
    evaluate({ map, player, state }): AiAction[] | null {
      // Walk into stun range (exactly 2 hexes) of the hardest-hitting reachable
      // enemy and stun it, but only with a follow-up attacker close behind:
      // a stunned target cannot counter, so the rest of the army hits it free.
      if (!flagsFor(player).stunnerHunt) return null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index || unit.type !== UnitType.STUNNER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        let best: { step: MapTile; target: MapTile; score: number } | null = null;
        for (const e of map.tiles) {
          if (!e.unit || e.unit.owner === player.index || e.unit.owner < 0) continue;
          if (!isExploredFor(e, player.index) || e.unit.isStealthed === true) continue;
          if ((e.unit.stunTurns ?? 0) >= 1) continue;
          const power = attackDamage(e.unit);
          if (power < STUN_MIN_DAMAGE) continue;
          let followers = 0;
          for (const f of map.tiles) {
            if (!f.unit || f.unit.owner !== player.index || f.unit === unit) continue;
            if (isSupportUnit(f.unit) || f.unit.type === UnitType.STALKER) continue;
            if (hexDistance(f, e) <= 4) followers += 1;
          }
          if (followers === 0) continue;
          for (const c of reachableCells(map, player, unit)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner !== player.index) continue;
            if (hexDistance(c, e) !== 2) continue;
            const score = power * 10 + followers - hexDistance(t, c);
            if (!best || score > best.score) best = { step: c, target: e, score };
          }
        }
        if (best) {
          return [
            { type: AiActionType.MOVE, unitId: unit.id, q: best.step.q, r: best.step.r },
            { type: AiActionType.STUN, unitId: unit.id, q: best.target.q, r: best.target.r },
          ];
        }
      }
      return null;
    },
  };
