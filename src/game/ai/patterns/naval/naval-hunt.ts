import { AiActionType, SkillId, UnitType } from '@enums';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { isWaterType } from '../../../map/tile-types';
import { hasSkill } from '../../../skills';
import { reachableTargets } from '../../../units/selection';
import { shipAttackDistance } from '../../../units/ship';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const NAVAL_HUNT_PATTERN: AiPattern = {
    id: 'naval-hunt',
    priority: 75,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat) return null;
      if (situation.navalEnemies.length === 0) return null;
      const pirates = situation.navalEnemies.filter((e) => e.unit.type === UnitType.PIRATE);
      const safeTile = (c: MapTile): boolean => !pirates.some((p) => hexDistance(c, p.tile) < 2);
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      let best: { action: AiAction[]; score: number } | null = null;
      for (const t of map.tiles) {
        const ship = t.unit;
        if (!ship || ship.owner !== player.index || ship.shipLevel === undefined) continue;
        if (state.acted.has(ship.id) || state.moved.has(ship.id)) continue;
        const range = shipAttackDistance(ship);
        for (const e of situation.navalEnemies) {
          const enemyTile = e.tile;
          if (!enemyTile.unit) continue;
          const dist = hexDistance(ship, enemyTile);
          if (dist >= 2 && dist <= range) {
            const score = 600 - dist * 10;
            if (!best || score > best.score) {
              best = { action: [{ type: AiActionType.ATTACK, unitId: ship.id, q: enemyTile.q, r: enemyTile.r }], score };
            }
            continue;
          }
          for (const c of reachableTargets(map, ship, undefined, canClimb, true, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            // Ships sail, they do not land through the AI planner; only water
            // destinations are real moves.
            if (!isWaterType(c.terrain)) continue;
            if (!safeTile(c)) continue;
            const nd = hexDistance(c, enemyTile);
            const moveDist = hexDistance(ship, c);
            if (nd >= 2 && nd <= range) {
              const score = 550 - nd * 10 - moveDist;
              if (!best || score > best.score) {
                best = {
                  action: [
                    { type: AiActionType.MOVE, unitId: ship.id, q: c.q, r: c.r },
                    { type: AiActionType.ATTACK, unitId: ship.id, q: enemyTile.q, r: enemyTile.r },
                  ],
                  score,
                };
              }
            } else if (nd < dist && nd >= 2) {
              const score = 250 - nd * 10 - moveDist;
              if (!best || score > best.score) {
                best = { action: [{ type: AiActionType.MOVE, unitId: ship.id, q: c.q, r: c.r }], score };
              }
            }
          }
        }
      }
      if (!best) return null;
      return best.action;
    },
  };
