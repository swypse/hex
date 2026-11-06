import { AiActionType, AiOperationPhase } from '@enums';
import type { MapTile } from '../../map/map-gen';
import { attackableTargets, chooseBestAttack, tradeIsFavorable } from '../../units/combat';
import type { Unit } from '../../units/units';
import { squadTiles } from '../military/squad-members';
import { enemyCanAttackNext } from '../situation/enemy-reach';
import { enemyVillageAt } from '../situation/enemy-village-at';
import { reachableCells } from '../situation/reachable-cells';
import { walkDistance, walkDistances } from '../situation/walk-distances';
import type { AiAction } from '../types/action';
import { key } from '../util/tile-key';
import type { AiPatternContext } from './pattern-types';

/** No squad member may advance further than this past the rearmost one. */
const LEASH_SLACK = 2;

/** Units this far from the destination are stragglers and do not hold others back. */
const STRAGGLER_DIST = 10;

export const OPERATION_PATTERN = {
  id: 'operation-advance',
  priority: 79,
  evaluate(ctx: AiPatternContext): AiAction[] | null {
    const { map, player, state, operation: op, difficulty } = ctx;
    if (!op) return null;
    if (!enemyVillageAt(map, player, op.target)) return null;

    const targetField = walkDistances(map, player, [op.target]);
    const field = op.phase === AiOperationPhase.GATHER ? walkDistances(map, player, [op.rally]) : targetField;
    const squad = squadTiles(map, player, targetField).filter((t) => walkDistance(field, t) < Infinity);
    if (squad.length < 2) return null;
    let rearmost = 0;
    for (const t of squad) {
      const d = walkDistance(field, t);
      if (d <= STRAGGLER_DIST && d > rearmost) rearmost = d;
    }
    const leashDist = rearmost - LEASH_SLACK;
    // Farthest units move first so the tail is never blocked by the head.
    const order = [...squad].sort((a, b) => walkDistance(field, b) - walkDistance(field, a));

    for (const t of order) {
      const unit = t.unit!;
      if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
      // A unit that can strike right now is left to the combat patterns.
      if (attackableTargets(map, unit, player.index).length > 0) continue;
      const d0 = walkDistance(field, t);
      if (op.phase === AiOperationPhase.GATHER && d0 <= 1) {
        state.moved.add(unit.id);
        continue;
      }
      let best: { c: MapTile; score: number; attack: MapTile | null } | null = null;
      for (const c of reachableCells(map, player, unit)) {
        if (state.occupied.has(key(c.q, c.r))) continue;
        if (c.settlement && c.settlement.owner === player.index) continue;
        const isTarget = c.q === op.target.q && c.r === op.target.r;
        // A foreign village is only stepped on when it is the operation's target.
        if (c.settlement && c.settlement.owner !== player.index && !isTarget) continue;
        const dc = walkDistance(field, c);
        if (dc >= d0) continue;
        const ghost: Unit = { ...unit, q: c.q, r: c.r };
        let attack: MapTile | null = null;
        if (op.phase === AiOperationPhase.ASSAULT && !isTarget) {
          const a = chooseBestAttack(map, ghost, player.index);
          if (a && (!difficulty?.checkTrades || tradeIsFavorable(ghost, a))) attack = a;
        }
        if (!attack && op.leash && dc < leashDist) continue;
        let score = -dc * 10;
        if (enemyCanAttackNext(map, c, player.index)) score -= 15;
        if (attack) score += 1000;
        if (isTarget) score += 500;
        if (!best || score > best.score) best = { c, score, attack };
      }
      if (!best) {
        state.moved.add(unit.id);
        continue;
      }
      const actions: AiAction[] = [{ type: AiActionType.MOVE, unitId: unit.id, q: best.c.q, r: best.c.r }];
      if (best.attack) actions.push({ type: AiActionType.ATTACK, unitId: unit.id, q: best.attack.q, r: best.attack.r });
      return actions;
    }
    return null;
  },
};
