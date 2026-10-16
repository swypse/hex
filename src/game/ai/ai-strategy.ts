import { SeededRandom } from '@/util';
import { AiGoalId, AiPace, AiPersonalityId, BuildingKind, GameMode, SkillId, SpawnPreference } from '@enums';
import { type AiDifficultyProfile } from './ai-difficulty';
import { flagsFor } from './ai-flags';
import { AI_PERSONALITIES, personalityFor } from './ai-personality';
import { type AiSituation } from './ai-situation';
import { type AiDirectives, type AiGoalState, type AiStrategyState } from './ai-types';
import { isExploredFor } from '../map/explore';
import { hexDistance } from '../map/hex';
import { type GameMap } from '../map/map-gen';
import { type Player } from '../players';
import { hasSkill } from '../skills';
import { walkDistance, walkDistances } from './ai-walk';
import { attackDamage } from '../units/combat';

export function goalTargetKey(g: AiGoalState): string {
  return g.target ? `${g.target.q},${g.target.r}` : '';
}

export function productionBuildings(map: GameMap, player: Player): number {
  let n = 0;
  for (const t of map.tiles) {
    if (t.ownedBy !== player.index || !t.building) continue;
    if (t.building.kind === BuildingKind.MINE || t.building.kind === BuildingKind.SAWMILL) n += 1;
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

/** Hexes around a village in which visible enemy units count as its garrison. */
const TARGET_GARRISON_RADIUS = 2;
/** Score penalty per point of attack force defending a candidate target. */
const TARGET_GARRISON_WEIGHT = 0.15;
/** Score bonus per village level (higher level pays more). */
const TARGET_LEVEL_BONUS = 2;
/** Score bonus for a free (unowned) village: no garrison, no retaliation. */
const TARGET_FREE_BONUS = 4;

/** Attack force of the visible enemy units standing near `target`. */
function garrisonPower(map: GameMap, player: Player, target: { q: number; r: number }): number {
  let total = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === player.index || t.unit.owner < 0) continue;
    if (t.unit.isStealthed === true || !isExploredFor(t, player.index)) continue;
    if (hexDistance(t, target) <= TARGET_GARRISON_RADIUS) total += attackDamage(t.unit);
  }
  return total;
}

/** The next village to go for: reachable on foot from the player's units and
 *  villages, cheap to walk to, weakly held and valuable (free villages and high
 *  levels preferred). Returns null when nothing explored is reachable. */
export function chooseArmyTarget(map: GameMap, player: Player): { q: number; r: number } | null {
  const sources = map.tiles.filter((t) => (t.unit?.owner === player.index) || (t.settlement?.owner === player.index));
  if (sources.length === 0) return null;
  const field = walkDistances(map, player, sources);
  let best: { q: number; r: number } | null = null;
  let bestScore = -Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === player.index) continue;
    if (t.settlement.owner === null && !isExploredFor(t, player.index)) continue;
    const dist = walkDistance(field, t);
    if (dist === Infinity) continue;
    const score = -dist - garrisonPower(map, player, t) * TARGET_GARRISON_WEIGHT + t.settlement.level * TARGET_LEVEL_BONUS + (t.settlement.owner === null ? TARGET_FREE_BONUS : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { q: t.q, r: t.r };
    }
  }
  return best;
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

function economySkillChain(player: Player): SkillId[] | null {
  const chain: SkillId[] = flagsFor(player).militarySkills
    ? [SkillId.FORESTRY, SkillId.AGRICULTURE, SkillId.CLIMBING, SkillId.SMITHERY, SkillId.SWORDSMAN, SkillId.SCIENCE, SkillId.GEOLOGY, SkillId.RIDING, SkillId.KNIGHTS]
    : [SkillId.FORESTRY, SkillId.AGRICULTURE, SkillId.CLIMBING, SkillId.SMITHERY, SkillId.GEOLOGY, SkillId.SCIENCE];
  for (const s of chain) if (!hasSkill(player, s)) return chain.slice(chain.indexOf(s));
  return null;
}

function navalSkillChain(player: Player): SkillId[] | null {
  const chain: SkillId[] = [SkillId.WATER, SkillId.NAVIGATION, SkillId.ARCHER, SkillId.CATAPULT];
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

function nearestOwnVillageTo(map: GameMap, player: Player, target: { q: number; r: number }): {
  q: number;
  r: number
} | null {
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
  const personality = AI_PERSONALITIES[strategy.personalityId as AiPersonalityId] ?? AI_PERSONALITIES.balanced;
  const d: AiDirectives = {
    frontTarget: null,
    muster: null,
    spawnPlan: [],
    moneyReserve: 8,
    skillChain: null,
    pace: AiPace.NORMAL
  };

  for (const g of [...strategy.goals].sort((a, b) => GOAL_PRIORITY[a.id] - GOAL_PRIORITY[b.id])) {
    if (g.id === AiGoalId.ECONOMY) {
      d.pace = AiPace.SLOW;
      d.moneyReserve = Math.max(d.moneyReserve, 12);
      d.skillChain = economySkillChain(player);
    }
    if (g.id === AiGoalId.ARMY) {
      const target = g.target;
      if (!target) continue;
      d.frontTarget = target;
      d.pace = AiPace.RUSHED;
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
        d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: freeTarget ? SpawnPreference.SCOUT : SpawnPreference.OFFENSE });
      }
    }
    if (g.id === AiGoalId.DEFENSE) {
      if (!g.target) continue;
      d.frontTarget = g.target;
      d.moneyReserve = 0;
      d.pace = AiPace.RUSHED;
      d.muster = { tile: g.target, minUnits: 1, target: g.target };
      const village = map.tiles.find((t) => t.settlement && t.settlement.owner === player.index && !t.unit);
      if (village) d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: SpawnPreference.DEFENSE });
    }
    if (g.id === AiGoalId.NAVAL) {
      d.skillChain = navalSkillChain(player);
      d.pace = AiPace.RUSHED;
      if (d.moneyReserve <= 8) d.moneyReserve = 10;
    }
    if (g.id === AiGoalId.SCORE) {
      d.pace = AiPace.RUSHED;
      d.moneyReserve = 0;
      if (situation.freeVillages.length > 0) {
        const fv = { q: situation.freeVillages[0]!.village.q, r: situation.freeVillages[0]!.village.r };
        d.frontTarget = fv;
        const village = nearestOwnVillageTo(map, player, fv);
        if (village) d.spawnPlan.push({ villageKey: `${village.q},${village.r}`, prefer: SpawnPreference.SCOUT });
      }
    }
  }
  // The play style shifts how much is kept back while a plan runs.
  if (strategy.goals.length > 0) d.moneyReserve = Math.max(0, d.moneyReserve + personality.reserveDelta);
  if (situation.endangered) d.moneyReserve = 0;
  return d;
}
