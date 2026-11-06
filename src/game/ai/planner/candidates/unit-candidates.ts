import { AiActionType,GarrisonGuardKind,UnitType } from '@enums';
import { canBurnBuilding,canBurnRoad } from '../../../economy/buildings';
import { roadCutSplits } from '../../../economy/roads';
import { chooseBestAttack,tradeIsFavorable } from '../../../units/combat';
import { canHeal,unitMaxHp } from '../../../units/units';
import { guardGarrisonAttack } from '../../military/garrison-guard';
import { enemyCanAttackNext } from '../../situation/enemy-reach';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';
import { moveCandidate } from './move-candidate';
import { mustering } from './mustering';

/** Score of destroying the only road linking two enemy villages (above a normal attack, below burning a food building). */
const ROAD_CUT_SCORE = 4200;

/** Score of destroying any other enemy road: only when nothing better is available. */
const ROAD_BURN_IDLE_SCORE = 120;

/** Capture, burn, attack, heal and move options for every own unit that has not acted. */
export function unitCandidates(ctx: CandidateContext, candidates: Candidate[]): void {
  const { map, player, state, difficulty, directives, jitter } = ctx;
  for (const t of map.tiles) {
    const unit = t.unit;
    if (!unit || unit.owner !== player.index) continue;
    if (state.acted.has(unit.id)) continue;
    if (t.settlement && t.settlement.owner !== unit.owner && t.settlement.captureReady && !unit.hasHealed) {
      candidates.push({ score: 5000 + jitter(), action: { type: AiActionType.CAPTURE, q: t.q, r: t.r, unitId: unit.id } });
      continue;
    }
    if (canBurnBuilding(t, unit)) {
      candidates.push({ score: 4500 + jitter(), action: { type: AiActionType.BURN, unitId: unit.id } });
      continue;
    }
    if (canBurnRoad(t, unit)) {
      // A road that is the only link between two villages is worth cutting
      // ahead of a normal attack (it splits their food network); any other
      // enemy road only fills an otherwise idle turn.
      const splits = roadCutSplits(map, t);
      candidates.push({
        score: (splits > 0 ? ROAD_CUT_SCORE + 100 * Math.min(splits, 3) : ROAD_BURN_IDLE_SCORE) + jitter(),
        action: { type: AiActionType.BURN_ROAD, unitId: unit.id },
      });
    }
    const attackTile = chooseBestAttack(map, unit, unit.owner);
    if (attackTile && !isSupportUnit(unit) && unit.type !== UnitType.STALKER && (!difficulty || !difficulty.checkTrades || !mustering(directives) || tradeIsFavorable(unit, attackTile))) {
      const garrisonGuard = guardGarrisonAttack(map, player, unit, attackTile, state);
      if (garrisonGuard.kind !== GarrisonGuardKind.HOLD) {
        const guardType = garrisonGuard.guardType;
        candidates.push({
          score: 4000 + jitter(),
          action: guardType
            ? [
                { type: AiActionType.ATTACK, unitId: unit.id, q: attackTile.q, r: attackTile.r },
                { type: AiActionType.SPAWN, q: t.q, r: t.r, unitType: guardType },
              ]
            : { type: AiActionType.ATTACK, unitId: unit.id, q: attackTile.q, r: attackTile.r },
        });
        continue;
      }
      // The village's last defender cannot be replaced: fall through to the
      // move/heal handling below instead of trading its life.
    }
    if (state.moved.has(unit.id)) continue;
    if (canHeal(unit) && unit.hp < unitMaxHp(unit) && !enemyCanAttackNext(map, t, player.index)) {
      candidates.push({ score: 600 + jitter(), action: { type: AiActionType.HEAL, unitId: unit.id, q: t.q, r: t.r } });
      continue;
    }
    // Support units and stalkers are handled by their own patterns: never let
    // the generic fallback send them into combat or wander with the army.
    if (isSupportUnit(unit) || unit.type === UnitType.STALKER) continue;
    moveCandidate(ctx, t, unit, candidates);
  }
}
