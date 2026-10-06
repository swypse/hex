import { SeededRandom } from '../util/random';
import { generatePlayerNames } from './names';
import { type PlayerResources, START_RESOURCES } from './economy/resources';
import { EMPTY_STATS, type PlayerStats } from './score';
import { Tribe, TRIBES, tribeById } from './tribes';
import { DEFAULT_AI_DIFFICULTY } from './ai/ai-difficulty';
import type { AiOperation, AiStrategyState } from './ai/ai-types';
import { AchievementId, AiDifficulty, AiEngine, SkillId } from '@enums';

export interface Player {
  index: number;
  tribe: Tribe;
  isHuman: boolean;
  name: string;
  resources: PlayerResources;
  score: number;
  kills: number;
  skills: SkillId[];
  isActive: boolean;
  knownTribes?: Tribe[];
  stats?: PlayerStats;
  difficulty?: AiDifficulty;
  /** AI planning engine: 'live' (default) applies each step before planning the next; 'batch' plans the whole turn on a frozen board (legacy, kept for benchmarking). */
  aiEngine?: AiEngine;
  /** Per-behaviour AI switches (default: all on). */
  aiFlags?: Partial<import('./ai/ai-flags').AiFlags>;
  achievements?: AchievementId[];
  strategy?: AiStrategyState;
  /** Current squad operation (AI only), rebuilt at the start of each AI turn. */
  operation?: AiOperation | null;
}

function startingResourcesFor(tribe: Tribe): PlayerResources {
  const info = tribeById(tribe)!;
  return { money: START_RESOURCES.money + (info.startMoneyBonus ?? 0) };
}

function startingSkillsFor(tribe: Tribe): SkillId[] {
  const info = tribeById(tribe)!;
  return info.startSkill ? [info.startSkill] : [];
}

function makePlayer(index: number, tribe: Tribe, isHuman: boolean, name: string, difficulty?: AiDifficulty): Player {
  return {
    index,
    tribe,
    isHuman,
    name,
    resources: startingResourcesFor(tribe),
    score: 0,
    kills: 0,
    skills: startingSkillsFor(tribe),
    isActive: true,
    knownTribes: [tribe],
    stats: { ...EMPTY_STATS },
    achievements: [],
    difficulty: isHuman ? undefined : difficulty,
  };
}

export function buildPlayers(
  humanTribe: Tribe,
  enemyCount: number,
  rng: SeededRandom,
  difficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY,
): Player[] {
  if (enemyCount < 1 || enemyCount > 6) {
    throw new Error(`Enemy count must be between 1 and 6, got ${enemyCount}`);
  }
  const enemyTribes = TRIBES.filter((t) => t.id !== humanTribe)
    .map((t) => t.id)
    .slice(0, enemyCount);
  const names = generatePlayerNames(enemyCount + 1, rng);
  const players: Player[] = [makePlayer(0, humanTribe, true, names[0]!)];
  for (const tribe of enemyTribes) {
    players.push(makePlayer(players.length, tribe, false, names[players.length]!, difficulty));
  }
  return players;
}

export function buildMultiplayerPlayers(
  humans: { name: string; tribe: Tribe }[],
  aiCount: number,
  rng: SeededRandom,
  difficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY,
): Player[] {
  const total = humans.length + aiCount;
  if (total < 2 || total > 7) {
    throw new Error(`Player total must be between 2 and 7, got ${total}`);
  }
  const usedTribes = new Set(humans.map((h) => h.tribe));
  const aiTribes = TRIBES.filter((t) => !usedTribes.has(t.id))
    .map((t) => t.id)
    .slice(0, aiCount);
  const aiNames = generatePlayerNames(aiCount, rng);
  const players: Player[] = humans.map((h, i) => makePlayer(i, h.tribe, true, h.name));
  for (let i = 0; i < aiCount; i++) {
    players.push(makePlayer(players.length, aiTribes[i]!, false, aiNames[i]!, difficulty));
  }
  return players;
}
