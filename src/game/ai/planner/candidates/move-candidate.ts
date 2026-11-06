import { AiActionType, AiStance, UnitType } from '@enums';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { attackableTargets, chooseBestAttack, tradeIsFavorable } from '../../../units/combat';
import { isShip } from '../../../units/ship';
import type { Unit } from '../../../units/units';
import { AI_TUNING, INCOMING_FORCE_WEIGHT, LETHAL_PENALTY } from '../../config/tuning';
import { enemyCanAttackNext, enemyCanReach, incomingForceAt, isLikelyLethal } from '../../situation/enemy-reach';
import { isFrontierTile } from '../../situation/frontier';
import { coastExposedTile, isNavalEnemy } from '../../situation/naval-threats';
import { nearestFreeVillageDistanceFrom, nearestOwnUnitDistanceFrom, nearestVillageDistanceFrom } from '../../situation/nearest-distances';
import { reachableCells } from '../../situation/reachable-cells';
import { key } from '../../util/tile-key';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';
import { mustering } from './mustering';

/** Strong penalty for idle land units standing where a naval enemy can hit. */
const NAVAL_EXPOSURE_PENALTY = 400;

/** Offers the best move (optionally followed by an attack) for an idle unit that nothing better claimed. */
export function moveCandidate(ctx: CandidateContext, t: MapTile, unit: Unit, candidates: Candidate[]): void {
  const { map, player, state, situation, difficulty, directives, jitter } = ctx;
  const garrison = !!t.settlement && t.settlement.owner === unit.owner;
  if (garrison && enemyCanReach(map, t, player.index)) return;
  const targets = reachableCells(map, player, unit).filter(
    (c) => !state.occupied.has(key(c.q, c.r)) && !(c.settlement && c.settlement.owner === unit.owner),
  );
  let bestMove: MapTile | null = null;
  let bestMoveScore = -Infinity;
  let bestAttackAfter: MapTile | null = null;
  for (const c of targets) {
    const ghost: Unit = { ...unit, q: c.q, r: c.r };
    // Stepping onto a foreign village means claiming it for capture next turn
    // — never chain an attack after that move (a melee kill would advance the
    // unit off the village and forfeit the capture).
    const foreignVillage = c.settlement !== null && c.settlement.owner !== unit.owner;
    const a = chooseBestAttack(map, ghost, unit.owner);
    if (a && !foreignVillage && (!difficulty || !difficulty.checkTrades || !mustering(directives) || tradeIsFavorable(ghost, a))) {
      const s = 3000 - hexDistance(t, c);
      if (s > bestMoveScore) {
        bestMoveScore = s;
        bestMove = c;
        bestAttackAfter = a;
      }
      continue;
    }
    const distToVillage = nearestVillageDistanceFrom(map, unit.owner, c);
    const distToFree = nearestFreeVillageDistanceFrom(map, c);
    // Graded by how much force could actually hit here, not just whether any
    // enemy could: a tile three weak enemies can gang up on is worse than one
    // only a single enemy reaches, and a likely-lethal tile is rejected
    // outright unless every option is just as bad.
    const threatPenalty = !AI_TUNING.gradedThreat
      ? enemyCanAttackNext(map, c, player.index)
        ? 200
        : 0
      : isLikelyLethal(map, c, player.index, unit)
        ? LETHAL_PENALTY
        : incomingForceAt(map, c, player.index) * INCOMING_FORCE_WEIGHT;
    const ownBonus = c.settlement && c.settlement.owner === unit.owner ? 40 : 0;
    const frontier = isFrontierTile(map, c, player.index) ? 20 : 0;
    const freeBonus = Number.isFinite(distToFree) ? Math.max(0, 60 - distToFree * 10) : 0;
    const villageBonus = Number.isFinite(distToVillage) ? 100 - distToVillage : 0;
    // Keep the army clustered: favour tiles close to other friendly units.
    const ownDist = nearestOwnUnitDistanceFrom(map, player.index, c);
    const groupBonus = Number.isFinite(ownDist) ? Math.max(0, 26 - ownDist * 3) : 0;
    let s = villageBonus + freeBonus + frontier + groupBonus - threatPenalty + ownBonus;
    if (situation?.stance === AiStance.WAR && situation.frontTarget) {
      const df = hexDistance(c, situation.frontTarget);
      s += 500 - df * 10;
      const ownDist = nearestOwnUnitDistanceFrom(map, player.index, c);
      if (Number.isFinite(ownDist)) s += Math.max(0, 30 - ownDist * 4);
    }
    if (directives?.frontTarget) {
      const df = hexDistance(c, directives.frontTarget);
      s += 300 - df * 8;
      const ownDist = nearestOwnUnitDistanceFrom(map, player.index, c);
      if (Number.isFinite(ownDist)) s += Math.max(0, 30 - ownDist * 4);
    }
    if (directives?.muster && hexDistance(c, directives.muster.target) > hexDistance(t, directives.muster.target)) {
      s -= 150;
    }
    if (situation?.navalThreat && !isShip(unit) && unit.type !== UnitType.CATAPULT && coastExposedTile(map, c, situation.navalEnemies)) {
      const canStrike = attackableTargets(map, ghost, unit.owner).some((a) => a.unit && isNavalEnemy(a.unit));
      if (!canStrike && !(c.settlement && c.settlement.owner === unit.owner)) s -= NAVAL_EXPOSURE_PENALTY;
    }
    if (s > bestMoveScore) {
      bestMoveScore = s;
      bestMove = c;
      bestAttackAfter = null;
    }
  }
  if (bestMove && bestMoveScore > 0 && bestAttackAfter) {
    candidates.push({
      score: bestMoveScore + jitter(),
      action: [
        { type: AiActionType.MOVE, unitId: unit.id, q: bestMove.q, r: bestMove.r },
        { type: AiActionType.ATTACK, unitId: unit.id, q: bestAttackAfter.q, r: bestAttackAfter.r },
      ],
    });
  } else if (bestMove && bestMoveScore > 0) {
    candidates.push({ score: bestMoveScore + jitter(), action: { type: AiActionType.MOVE, unitId: unit.id, q: bestMove.q, r: bestMove.r } });
  }
}
