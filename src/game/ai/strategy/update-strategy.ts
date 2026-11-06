import { SeededRandom } from '@/util';
import { AiGoalId, GameMode } from '@enums';
import { isExploredFor } from '../../map/explore';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import type { AiDifficultyProfile } from '../config/difficulty';
import { personalityFor } from '../config/personality';
import type { AiSituation } from '../situation/situation';
import { walkDistance, walkDistances } from '../situation/walk-distances';
import type { AiGoalState } from '../types/goal-state';
import type { AiStrategyState } from '../types/strategy-state';
import { chooseArmyTarget } from './choose-army-target';
import { ensurePlayerStrategy } from './ensure-player-strategy';
import { productionBuildings } from './production-buildings';

function hasGoalTyped(goals: AiGoalState[], id: AiGoalId): boolean {
  return goals.some((g) => g.id === id);
}

function makeGoal(id: AiGoalId, phase: string, target: { q: number; r: number } | null): AiGoalState {
  return { id, phase, target };
}

function enemyVillageVisible(map: GameMap, player: Player): boolean {
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === null || t.settlement.owner === player.index) continue;
    if (isExploredFor(t, player.index)) return true;
  }
  return false;
}

/** True when no own unit or village can walk to `target` any more. */
function targetUnreachable(map: GameMap, player: Player, target: { q: number; r: number }): boolean {
  const sources = map.tiles.filter((t) => (t.unit?.owner === player.index) || (t.settlement?.owner === player.index));
  if (sources.length === 0) return false;
  const field = walkDistances(map, player, [target]);
  return !sources.some((t) => walkDistance(field, t) < Infinity);
}

function goalExpired(map: GameMap, player: Player, situation: AiSituation, g: AiGoalState): boolean {
  switch (g.id) {
    case AiGoalId.DEFENSE:
      return !situation.endangered;
    case AiGoalId.NAVAL:
      return !situation.navalThreat;
    case AiGoalId.ARMY:
      if (!g.target) return false;
      const tile = map.tiles.find((t) => t.q === g.target!.q && t.r === g.target!.r && t.settlement);
      if (!tile || !tile.settlement) return true;
      if (tile.settlement.owner === player.index) return true;
      return targetUnreachable(map, player, g.target);
    default:
      return false;
  }
}

/** Score a running primary plan (economy / army) gets over the alternative before it is replaced. */
const PLAN_HYSTERESIS = 30;

function weightedPrimaryScore(
  map: GameMap,
  player: Player,
  situation: AiSituation,
  mode: GameMode,
  difficulty: AiDifficultyProfile,
  rng: SeededRandom,
  weights: { economy: number; army: number; score: number },
  currentPrimary: AiGoalId | null,
): AiGoalId {
  const production = productionBuildings(map, player);
  let economyScore = (70 - production * 20 + situation.freeVillages.length * 5) * weights.economy + rng.next() * 20;
  let armyScore = (25 + (enemyVillageVisible(map, player) ? 90 : 0) + situation.freeVillages.length * 8 + (situation.ownPower >= situation.enemyPower ? 25 : 0)) * weights.army + rng.next() * 20;
  if (mode === GameMode.TURNS30) {
    armyScore *= 0.5;
    // The personality's score appetite pushes the primary plan toward the
    // aggressive score race (villages/temples/kills win 30-turn games fast):
    // high score weight -> expansion push, low -> it is fine to crawl.
    armyScore += 20 * weights.score;
  }
  if (production >= difficulty.strategy.economyCap) economyScore -= 40;
  // Commitment: the running plan keeps a head start, so noise cannot flip it back and forth.
  if (currentPrimary === AiGoalId.ECONOMY) economyScore += PLAN_HYSTERESIS;
  if (currentPrimary === AiGoalId.ARMY) armyScore += PLAN_HYSTERESIS;
  if (economyScore >= armyScore) return AiGoalId.ECONOMY;
  return AiGoalId.ARMY;
}

export function updateStrategy(
  map: GameMap,
  player: Player,
  situation: AiSituation,
  mode: GameMode,
  difficulty: AiDifficultyProfile,
  turn: number,
  rng: SeededRandom,
): AiStrategyState {
  const state = ensurePlayerStrategy(player, rng);
  const personality = personalityFor(player);
  const expired = state.goals.some((g) => goalExpired(map, player, situation, g));
  if (turn < state.nextPlanTurn && !expired) return state;

  const kept = state.goals.filter((g) => !goalExpired(map, player, situation, g));
  let next = kept.filter((g) => g.id !== AiGoalId.DEFENSE && g.id !== AiGoalId.NAVAL);

  if (situation.endangered && !hasGoalTyped(next, AiGoalId.DEFENSE)) {
    const danger = situation.dangers[0];
    next.push(makeGoal(AiGoalId.DEFENSE, 'muster', danger ? { q: danger.village.q, r: danger.village.r } : null));
  }
  if (situation.navalThreat && !hasGoalTyped(next, AiGoalId.NAVAL)) {
    next.push(makeGoal(AiGoalId.NAVAL, 'research', null));
  }
  if (mode === GameMode.TURNS30 && !hasGoalTyped(next, AiGoalId.SCORE)) {
    next.push(makeGoal(AiGoalId.SCORE, 'race', null));
  }

  const current = next.find((g) => g.id === AiGoalId.ECONOMY || g.id === AiGoalId.ARMY);
  // An army plan that had no target yet picks one as soon as a village is known.
  if (current?.id === AiGoalId.ARMY && !current.target) {
    current.target = chooseArmyTarget(map, player);
    if (current.target) current.phase = 'choose';
  }
  const picked = weightedPrimaryScore(map, player, situation, mode, difficulty, rng, {
    economy: personality.goalWeights.economy,
    army: personality.goalWeights.army,
    score: personality.goalWeights.score,
  }, current?.id ?? null);
  if (mode === GameMode.TURNS30 && situation.ownPower < situation.enemyPower * 0.8) {
    next = next.filter((g) => g.id !== AiGoalId.ECONOMY && g.id !== AiGoalId.ARMY);
    if (!hasGoalTyped(next, AiGoalId.ARMY)) next.push(makeGoal(AiGoalId.ARMY, 'choose', null));
  } else if (!current || current.id !== picked) {
    next = next.filter((g) => g.id !== AiGoalId.ECONOMY && g.id !== AiGoalId.ARMY);
    next.push(makeGoal(picked, picked === AiGoalId.ARMY ? 'choose' : 'build', picked === AiGoalId.ARMY ? chooseArmyTarget(map, player) : null));
  }

  state.goals = next;
  state.nextPlanTurn = turn + difficulty.strategy.planIntervalTurns;
  return state;
}
