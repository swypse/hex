import { AiActionType,UnitType } from '@enums';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { attackableTargets,attackDamage,isPoorTrapperTarget,tradeIsFavorable } from '../../../units/combat';
import { unitMaxHp } from '../../../units/units';
import { HIT_VILLAGE_BONUS } from '../../config/tuning';
import { isHitVillage } from '../../military/hit-village';
import { idleUnits } from '../../situation/idle-units';
import { isNavalEnemy } from '../../situation/naval-threats';
import { reachableCells } from '../../situation/reachable-cells';
import { isMelee } from '../../situation/turns-to-occupy';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const HUNT_IDLE_ENEMY_PATTERN: AiPattern = {
    id: 'hunt-idle-enemy',
    priority: 78,
    evaluate({ map, player, state, situation, difficulty, turn = 0 }): AiAction[] | null {
      if (!situation || situation.enemies.length === 0) return null;
      // When endangered, reinforcement (higher priority) recalls the closest
      // free unit to the village; units already engaging a threat keep pressing
      // it instead of being frozen out of combat entirely.
      let best: { action: AiAction[]; score: number } | null = null;
      for (const { tile: t, unit } of idleUnits(map, player, state)) {
        // Support units don't hunt; the stalker only strikes to free a village
        // (handled by its own scout pattern), so keep it out of general hunts.
        if (isSupportUnit(unit) || unit.type === UnitType.STALKER) continue;
        if (t.settlement && t.settlement.owner === player.index) continue;
        const melee = isMelee(unit);
        for (const e of situation.enemies) {
          const enemyTile = e.tile;
          if (!enemyTile.unit || enemyTile.unit.owner === player.index) continue;
          // A trapper is left to archers and catapults; melee only finish it.
          if (isPoorTrapperTarget(unit, enemyTile.unit)) continue;
          // Naval enemies cannot be reached by land chases; ships handle them
          // in their own naval-hunt pattern.
          if (isNavalEnemy(e.unit)) continue;
          const bonus = enemyTile.settlement && isHitVillage(player, enemyTile, turn) ? HIT_VILLAGE_BONUS : 0;
          const strikes = (tile: MapTile): boolean =>
            attackableTargets(map, { ...unit, q: tile.q, r: tile.r }, player.index).some(
              (a) => a.q === enemyTile.q && a.r === enemyTile.r,
            );
          const isGood = (tile: MapTile): boolean => {
            const enemy = enemyTile.unit!;
            if (attackDamage(unit) >= enemy.hp) return true;
            if (!difficulty || !difficulty.checkTrades) return true;
            return tradeIsFavorable({ ...unit, q: tile.q, r: tile.r }, enemyTile);
          };
          if (strikes(t)) {
            const kills = attackDamage(unit) >= enemyTile.unit.hp;
            if (!kills && difficulty?.checkTrades && !tradeIsFavorable(unit, enemyTile)) continue;
            const score = (kills ? 500 : 300) - hexDistance(t, enemyTile) + bonus;
            if (!best || score > best.score) {
              best = { action: [{ type: AiActionType.ATTACK, unitId: unit.id, q: enemyTile.q, r: enemyTile.r }], score };
            }
            continue;
          }
          if (!melee) continue;
          const canKill = attackDamage(unit) >= enemyTile.unit.hp;
          const notTougher = unitMaxHp(enemyTile.unit) <= unitMaxHp(unit);
          if (!canKill && !notTougher) continue;
          const startDist = hexDistance(t, enemyTile);
          for (const c of reachableCells(map, player, unit)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === player.index) continue;
            // Don't use a foreign village as an attack staging tile: stepping on
            // it should claim it for capture, never to strike-and-leave.
            if (c.settlement && c.settlement.owner !== player.index) continue;
            const nd = hexDistance(c, enemyTile);
            if (nd >= startDist) continue;
            const moveDist = hexDistance(t, c);
            if (strikes(c) && isGood(c)) {
              const score = (canKill ? 500 : 300) - nd * 10 - moveDist + bonus;
              if (!best || score > best.score) {
                best = {
                  action: [
                    { type: AiActionType.MOVE, unitId: unit.id, q: c.q, r: c.r },
                    { type: AiActionType.ATTACK, unitId: unit.id, q: enemyTile.q, r: enemyTile.r },
                  ],
                  score,
                };
              }
            } else {
              const score = 200 - nd * 10 - moveDist + bonus;
              if (!best || score > best.score) {
                best = { action: [{ type: AiActionType.MOVE, unitId: unit.id, q: c.q, r: c.r }], score };
              }
            }
          }
        }
      }
      if (!best) return null;
      return best.action;
    },
  };
