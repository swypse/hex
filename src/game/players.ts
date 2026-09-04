import { SeededRandom } from '../util/random';
import { generatePlayerNames } from './names';
import { Resources, START_RESOURCES } from './resources';
import type { SkillId } from './skills';
import { EMPTY_STATS, type PlayerStats } from './score';
import { Tribe, TRIBES } from './tribes';
import { AiDifficulty, DEFAULT_AI_DIFFICULTY } from './aiDifficulty';

export interface Player {
  index: number;
  tribe: Tribe;
  isHuman: boolean;
  name: string;
  resources: Resources;
  score: number;
  kills: number;
  skills: SkillId[];
  isActive: boolean;
  knownTribes?: Tribe[];
  stats?: PlayerStats;
  difficulty?: AiDifficulty;
}

function startingResourcesFor(tribe: Tribe): Resources {
  const info = TRIBES.find((t) => t.id === tribe)!;
  return { ...START_RESOURCES, money: START_RESOURCES.money + (info.startMoneyBonus ?? 0) };
}

function startingSkillsFor(tribe: Tribe): SkillId[] {
  const info = TRIBES.find((t) => t.id === tribe)!;
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
    difficulty: isHuman ? undefined : difficulty,
  };
}

export function buildPlayers(
  humanTribe: Tribe,
  enemyCount: number,
  rng: SeededRandom,
  difficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY,
): Player[] {
  if (enemyCount < 1 || enemyCount > 5) {
    throw new Error(`Enemy count must be between 1 and 5, got ${enemyCount}`);
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
  if (total < 2 || total > 6) {
    throw new Error(`Player total must be between 2 and 6, got ${total}`);
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
