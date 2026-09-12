import { GameMap } from './mapGen';
import { Player } from './players';
import { GameMode } from './gameMode';
import { AiDifficultyProfile } from './aiDifficulty';
import { personalityFor } from './aiPersonality';
import { AiGoalId, AiGoalState, AiStrategyState, AiDirectives } from './aiTypes';
import { AiSituation } from './aiSituation';
import { SeededRandom } from '../util/random';
import { isExploredFor } from './explore';
import { hexDistance } from './hex';
import { AI_PERSONALITIES } from './aiPersonality';
import { hasSkill, SkillId } from './skills';

export function goalTargetKey(g: AiGoalState): string {
  return g.target ? `${g.target.q},${g.target.r}` : '';
}

export function productionBuildings(map: GameMap, player: Player): number {
  let n = 0;
  for (const t of map.tiles) {
    if (t.ownedBy !== player.index || !t.building) continue;
    if (t.building.kind === 'mine' || t.building.kind === 'sawmill') n += 1;
  }
  return n;
}

export function ensurePlayerStrategy(player: Player, rng: SeededRandom): AiStrategyState {
  if (!player.strategy) {
    const personality = personalityFor(player);
    player.strategy = { personalityId: personality.id, nextPlanTurn: 0, goals: [] };
  }
  return player.strategy;
}

function hasGoalTyped(goals: AiGoalState[], id: AiGoalId): boolean {
  return goals.some((g) => g.id === id);
}

function makeGoal(id: AiGoalId, phase: string, target: { q: number; r: number } | null, turn: number): AiGoalState {
  return { id, phase, target, sinceTurn: turn, confidence: 1 };
}

function enemyVillageVisible(map: GameMap, player: Player): boolean {
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === null || t.settlement.owner === player.index) continue;
    if (isExploredFor(t, player.index)) return true;
  }
  return false;
}

function chooseArmyTarget(map: GameMap, player: Player): { q: number; r: number } | null {
  let best: { q: number; r: number } | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement) continue;
    if (t.settlement.owner === player.index) continue;
    if (t.settlement.owner === null && !isExploredFor(t, player.index)) continue;
    let d = Infinity;
    for (const u of map.tiles) {
      if (!u.unit || u.unit.owner !== player.index) continue;
      const dist = hexDistance(u, t);
      if (dist < d) d = dist;
    }
    if (d < bestDist) {
      bestDist = d;
      best = { q: t.q, r: t.r };
    }
  }
  return best;
}

function goalExpired(map: GameMap, player: Player, situation: AiSituation, g: AiGoalState): boolean {
  switch (g.id) {
    case 'defense':
      return !situation.endangered;
    case 'naval':
      return !situation.navalThreat;
    case 'army':
      if (!g.target) return false;
      const tile = map.tiles.find((t) => t.q === g.target!.q && t.r === g.target!.r && t.settlement);
      if (!tile || !tile.settlement) return true;
      return tile.settlement.owner === player.index;
    default:
      return false;
  }
}

function weightedPrimaryScore(
  map: GameMap,
  player: Player,
  situation: AiSituation,
  mode: GameMode,
  difficulty: AiDifficultyProfile,
  rng: SeededRandom,
  weights: { economy: number; army: number; score: number },
): AiGoalId {
  const production = productionBuildings(map, player);
  let economyScore = (70 - production * 20 + situation.freeVillages.length * 5) * weights.economy + rng.next() * 20;
  let armyScore = (25 + (enemyVillageVisible(map, player) ? 90 : 0) + situation.freeVillages.length * 8 + (situation.ownPower >= situation.enemyPower ? 25 : 0)) * weights.army + rng.next() * 20;
  if (mode === 'turns30') armyScore *= 0.5;
  if (production >= difficulty.strategy.economyCap) economyScore -= 40;
  if (economyScore >= armyScore) return 'economy';
  return 'army';
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
  let next = kept.filter((g) => g.id !== 'defense' && g.id !== 'naval');

  if (situation.endangered && !hasGoalTyped(next, 'defense')) {
    const danger = situation.dangers[0];
    next.push(makeGoal('defense', 'muster', danger ? { q: danger.village.q, r: danger.village.r } : null, turn));
  }
  if (situation.navalThreat && !hasGoalTyped(next, 'naval')) {
    next.push(makeGoal('naval', 'research', null, turn));
  }
  if (mode === 'turns30' && !hasGoalTyped(next, 'score')) {
    next.push(makeGoal('score', 'race', null, turn));
  }

  const current = next.find((g) => g.id === 'economy' || g.id === 'army');
  const picked = weightedPrimaryScore(map, player, situation, mode, difficulty, rng, {
    economy: personality.goalWeights.economy,
    army: personality.goalWeights.army,
    score: personality.goalWeights.score,
  });
  if (mode === 'turns30' && situation.ownPower < situation.enemyPower * 0.8) {
    next = next.filter((g) => g.id !== 'economy' && g.id !== 'army');
    if (!hasGoalTyped(next, 'army')) next.push(makeGoal('army', 'choose', null, turn));
  } else if (!current || current.id !== picked) {
    next = next.filter((g) => g.id !== 'economy' && g.id !== 'army');
    next.push(makeGoal(picked, picked === 'army' ? 'choose' : 'build', picked === 'army' ? chooseArmyTarget(map, player) : null, turn));
  }

  state.goals = next;
  state.nextPlanTurn = turn + difficulty.strategy.planIntervalTurns;
  return state;
}
function economySkillChain(player: Player): SkillId[] | null {
  const chain: SkillId[] = ['forestry', 'climbing', 'smithery', 'geology', 'science'];
  for (const s of chain) if (!hasSkill(player, s)) return chain.slice(chain.indexOf(s));
  return null;
}

function navalSkillChain(player: Player): SkillId[] | null {
  const chain: SkillId[] = ['water', 'navigation', 'science', 'catapult'];
  for (const s of chain) if (!hasSkill(player, s)) return chain.slice(chain.indexOf(s));
  return null;
}

function countOwnUnitsNear(map: GameMap, player: Player, target: { q: number; r: number }, radius: number): number {
  let n = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner !== player.index) continue;
    if (hexDistance(t, target) <= radius) n += 1;
  }
  return n;
}

function nearestOwnVillageTo(map: GameMap, player: Player, target: { q: number; r: number }): { q: number; r: number } | null {
  let best: { q: number; r: number } | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== player.index) continue;
    const d = hexDistance(t, target);
    if (d < bestDist) {
      bestDist = d;
      best = { q: t.q, r: t.r };
    }
  }
  return best;
}

/** Threat-oriented goals override peacetime goals (naval over army, army over
 *  economy) so an economy plan cannot clobber the naval skill chain mid-threat. */
const GOAL_PRIORITY: Record<AiGoalId, number> = { economy: 0, score: 0, army: 1, defense: 2, naval: 3 };

export function deriveDirectives(
  map: GameMap,
  player: Player,
  situation: AiSituation,
  difficulty: AiDifficultyProfile,
  strategy: AiStrategyState,
): AiDirectives {
  const personality = AI_PERSONALITIES[strategy.personalityId as 'aggressive' | 'balanced' | 'builder'] ?? AI_PERSONALITIES.balanced;
  const d: AiDirectives = { frontTarget: null, muster: null, spawnPlan: [], moneyReserve: 8, skillChain: null, pace: 'normal' };

  for (const g of [...strategy.goals].sort((a, b) => GOAL_PRIORITY[a.id] - GOAL_PRIORITY[b.id])) {
    if (g.id === 'economy') {
      d.pace = 'slow';
      d.moneyReserve = Math.max(d.moneyReserve, 12);
      d.skillChain = economySkillChain(player);
    }
    if (g.id === 'army') {
      const target = g.target;
      if (!target) continue;
      d.frontTarget = target;
      d.pace = 'rushed';
      if (d.moneyReserve > 4) d.moneyReserve = 4;
      const mustered = countOwnUnitsNear(map, player, target, 5);
      const minUnits = Math.round(personality.musterMinUnits * difficulty.strategy.musterFactor);
      const assaultReady = situation.ownPower >= situation.enemyPower * difficulty.strategy.assaultRatio;
      if (g.phase === 'muster' && mustered < minUnits && !assaultReady) {
        d.muster = { tile: null, minUnits, target };
      }
      const village = nearestOwnVillageTo(map, player, target);
      if (village) {
        const freeTarget = situation.freeVillages.some((fv) => fv.village.q === target.q && fv.village.r === target.r);
        d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: freeTarget ? 'scout' : 'offense' });
      }
    }
    if (g.id === 'defense') {
      if (!g.target) continue;
      d.frontTarget = g.target;
      d.moneyReserve = 0;
      d.pace = 'rushed';
      d.muster = { tile: g.target, minUnits: 1, target: g.target };
      const village = map.tiles.find((t) => t.settlement && t.settlement.owner === player.index && !t.unit);
      if (village) d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: 'defense' });
    }
    if (g.id === 'naval') {
      d.skillChain = navalSkillChain(player);
      d.pace = 'rushed';
      if (d.moneyReserve <= 8) d.moneyReserve = 10;
    }
    if (g.id === 'score') {
      d.pace = 'rushed';
      d.moneyReserve = 0;
      if (situation.freeVillages.length > 0) {
        const fv = { q: situation.freeVillages[0]!.village.q, r: situation.freeVillages[0]!.village.r };
        d.frontTarget = fv;
        const village = nearestOwnVillageTo(map, player, fv);
        if (village) d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: 'scout' });
      }
    }
  }
  if (situation.endangered) d.moneyReserve = 0;
  return d;
}
