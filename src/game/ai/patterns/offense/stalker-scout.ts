import { AiActionType, UnitType } from '@enums';
import { isExploredFor } from '../../../map/explore';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { attackableTargets, attackDamage } from '../../../units/combat';
import type { Unit } from '../../../units/units';
import { enemyCanReach } from '../../situation/enemy-reach';
import { coastExposedTile } from '../../situation/naval-threats';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const STALKER_SCOUT_PATTERN: AiPattern = {
    id: 'stalker-scout',
    priority: 131,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      // The stalker is the Cats' scout: it explores to find villages, claims
      // empty ones and free villages, and only ever fights to kill a defender
      // standing inside a village so the tile can be claimed afterwards.
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.STALKER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;

        // 1. Kill an enemy standing inside a village (its only combat) so the
        //    village tile can be taken next turn.
        let killTile: MapTile | null = null;
        let killStep: MapTile | null = null;
        for (const e of map.tiles) {
          if (!e.settlement || !e.unit || e.unit.owner === player.index) continue;
          if (!isExploredFor(e, player.index)) continue;
          if (attackableTargets(map, unit, player.index).some((a) => a.q === e.q && a.r === e.r)) {
            if (attackDamage(unit) >= e.unit.hp) {
              killTile = e;
              killStep = null;
              break;
            }
            continue;
          }
          for (const c of reachableCells(map, player, unit)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === player.index) continue;
            const ghost: Unit = { ...unit, q: c.q, r: c.r };
            if (
              attackableTargets(map, ghost, player.index).some((a) => a.q === e.q && a.r === e.r) &&
              attackDamage(unit) >= e.unit.hp
            ) {
              killTile = e;
              killStep = c;
              break;
            }
          }
          if (killTile) break;
        }
        if (killTile) {
          return killStep
            ? [
                { type: AiActionType.MOVE, unitId: unit.id, q: killStep.q, r: killStep.r },
                { type: AiActionType.ATTACK, unitId: unit.id, q: killTile.q, r: killTile.r },
              ]
            : [{ type: AiActionType.ATTACK, unitId: unit.id, q: killTile.q, r: killTile.r }];
        }

        // 2. Move onto an empty (free) village to claim it.
        for (const v of map.tiles) {
          if (!v.settlement || v.settlement.owner !== null) continue;
          if (v.unit) continue;
          if (state.occupied.has(key(v.q, v.r))) continue;
          if (!reachableCells(map, player, unit).some((c) => c.q === v.q && c.r === v.r)) continue;
          return [{ type: AiActionType.MOVE, unitId: unit.id, q: v.q, r: v.r }];
        }

        // 3. Scout one step toward unexplored ground or an empty enemy village.
        let goal: MapTile | null = null;
        let goalDist = Infinity;
        for (const g of map.tiles) {
          if (!isExploredFor(g, player.index)) {
            const d = hexDistance(t, g);
            if (d < goalDist) {
              goalDist = d;
              goal = g;
            }
            continue;
          }
          if (g.settlement && g.settlement.owner !== player.index && !g.unit) {
            const d = hexDistance(t, g);
            if (d < goalDist) {
              goalDist = d;
              goal = g;
            }
          }
        }
        if (goal) {
          let bestStep: MapTile | null = null;
          let bestDist = Infinity;
          for (const c of reachableCells(map, player, unit)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === player.index) continue;
            if (situation?.navalThreat && coastExposedTile(map, c, situation.navalEnemies)) continue;
            const d = hexDistance(c, goal);
            if (d >= hexDistance(t, goal)) continue;
            if (d < bestDist) {
              bestDist = d;
              bestStep = c;
            }
          }
          if (bestStep) return [{ type: AiActionType.MOVE, unitId: unit.id, q: bestStep.q, r: bestStep.r }];
        }
      }
      return null;
    },
  };
