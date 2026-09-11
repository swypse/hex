import { axialKey, hexNeighbors } from './hex';
import { isExploredFor } from './explore';
import type { GameMap, MapTile } from './mapGen';
import type { Player } from './players';
import { awardScore, EMPTY_STATS, type PlayerStats } from './score';
import { SKILLS } from './skills';
import { portWaterClusterJumps } from './waterRoads';

export type AchievementId =
  | 'greatConnector'
  | 'perfectChain'
  | 'piratePurger'
  | 'pirateLuckyDay'
  | 'nothingLeftToLearn'
  | 'tenFoesNoSurvivors'
  | 'tripleSinkJob'
  | 'bonusHunter'
  | 'masterCartographer';

export interface AchievementInfo {
  id: AchievementId;
  nameKey: string;
  descKey: string;
  points: number;
  icon: string;
  met: (map: GameMap, player: Player) => boolean;
}

const ACHIEVEMENT_ICON: Record<AchievementId, string> = {
  greatConnector: 'achievement-great-connector',
  perfectChain: 'achievement-perfect-chain',
  piratePurger: 'achievement-pirate-purger',
  pirateLuckyDay: 'achievement-pirates-lucky-day',
  nothingLeftToLearn: 'achievement-nothing-to-learn',
  tenFoesNoSurvivors: 'achievement-10-kills',
  tripleSinkJob: 'achievement-3-ships-killed',
  bonusHunter: 'achievement-bonus-hunter',
  masterCartographer: 'achievement-explorer',
};

function statsOf(player: Player): PlayerStats {
  player.stats ??= { ...EMPTY_STATS };
  return player.stats;
}

function ownedVillages(map: GameMap, player: Player): MapTile[] {
  return map.tiles.filter((t) => t.settlement !== null && t.settlement.owner === player.index);
}

function isNetworkNode(tile: MapTile, player: Player): boolean {
  if (tile.settlement !== null && tile.settlement.owner === player.index) return true;
  if (tile.roadOwner === player.index) return true;
  return tile.building?.kind === 'port' && tile.ownedBy === player.index;
}

/** Largest number of the player's villages reachable over its own roads,
 *  bridges and ports. */
function largestVillageCluster(map: GameMap, player: Player): number {
  const byKey = new Map(map.tiles.map((t) => [axialKey(t), t] as const));
  const waterJumps = portWaterClusterJumps(map);
  const visited = new Set<string>();
  let best = 0;
  for (const start of map.tiles) {
    if (visited.has(axialKey(start)) || !isNetworkNode(start, player)) continue;
    let villages = 0;
    const queue = [start];
    visited.add(axialKey(start));
    while (queue.length > 0) {
      const cur = queue.shift()!;
      // Ports in the same own-water cluster are effectively adjacent, so a
      // village reached through a port's water route joins this cluster.
      const siblings = waterJumps.get(axialKey(cur));
      if (siblings) {
        for (const sk of siblings) {
          if (visited.has(sk)) continue;
          visited.add(sk);
          const t = byKey.get(sk);
          if (t) queue.push(t);
        }
      }
      if (cur.settlement !== null && cur.settlement.owner === player.index) villages += 1;
      for (const n of hexNeighbors(cur)) {
        const tile = byKey.get(axialKey(n));
        if (!tile || visited.has(axialKey(tile)) || !isNetworkNode(tile, player)) continue;
        visited.add(axialKey(tile));
        queue.push(tile);
      }
    }
    if (villages > best) best = villages;
  }
  return best;
}

function allSkillsOpened(player: Player): boolean {
  return new Set(player.skills).size === Object.keys(SKILLS).length;
}

function allExplored(map: GameMap, player: Player): boolean {
  return map.tiles.every((t) => isExploredFor(t, player.index));
}

export const ACHIEVEMENTS: readonly AchievementInfo[] = [
  {
    id: 'greatConnector',
    nameKey: 'ach.greatConnector.name',
    descKey: 'ach.greatConnector.desc',
    icon: ACHIEVEMENT_ICON.greatConnector,
    points: 100,
    met: (map, player) => largestVillageCluster(map, player) >= 4,
  },
  {
    id: 'perfectChain',
    nameKey: 'ach.perfectChain.name',
    descKey: 'ach.perfectChain.desc',
    icon: ACHIEVEMENT_ICON.perfectChain,
    points: 100,
    met: (map, player) => statsOf(player).knightCombos >= 3,
  },
  {
    id: 'piratePurger',
    nameKey: 'ach.piratePurger.name',
    descKey: 'ach.piratePurger.desc',
    icon: ACHIEVEMENT_ICON.piratePurger,
    points: 100,
    met: (map, player) => statsOf(player).pirateKills >= 3,
  },
  {
    id: 'pirateLuckyDay',
    nameKey: 'ach.pirateLuckyDay.name',
    descKey: 'ach.pirateLuckyDay.desc',
    icon: ACHIEVEMENT_ICON.pirateLuckyDay,
    points: 150,
    met: (map, player) => statsOf(player).shipsCapturedByPirates >= 3,
  },
  {
    id: 'nothingLeftToLearn',
    nameKey: 'ach.nothingLeftToLearn.name',
    descKey: 'ach.nothingLeftToLearn.desc',
    icon: ACHIEVEMENT_ICON.nothingLeftToLearn,
    points: 200,
    met: (map, player) => allSkillsOpened(player),
  },
  {
    id: 'tenFoesNoSurvivors',
    nameKey: 'ach.tenFoesNoSurvivors.name',
    descKey: 'ach.tenFoesNoSurvivors.desc',
    icon: ACHIEVEMENT_ICON.tenFoesNoSurvivors,
    points: 100,
    met: (map, player) => player.kills >= 10,
  },
  {
    id: 'tripleSinkJob',
    nameKey: 'ach.tripleSinkJob.name',
    descKey: 'ach.tripleSinkJob.desc',
    icon: ACHIEVEMENT_ICON.tripleSinkJob,
    points: 100,
    met: (map, player) => statsOf(player).enemyShipsKilled >= 3,
  },
  {
    id: 'bonusHunter',
    nameKey: 'ach.bonusHunter.name',
    descKey: 'ach.bonusHunter.desc',
    icon: ACHIEVEMENT_ICON.bonusHunter,
    points: 200,
    met: (map, player) => statsOf(player).bonusesCollected >= 3,
  },
  {
    id: 'masterCartographer',
    nameKey: 'ach.masterCartographer.name',
    descKey: 'ach.masterCartographer.desc',
    icon: ACHIEVEMENT_ICON.masterCartographer,
    points: 200,
    met: (map, player) => allExplored(map, player),
  },
];

export function achievementInfo(id: AchievementId): AchievementInfo {
  return ACHIEVEMENTS.find((a) => a.id === id)!;
}

export function achievementNameKey(id: AchievementId): string {
  return achievementInfo(id).nameKey;
}

export function achievementPoints(id: AchievementId): number {
  return achievementInfo(id).points;
}

export function achievementIcon(id: AchievementId): string {
  return achievementInfo(id).icon;
}

export function unlockedAchievements(player: Player): AchievementId[] {
  return player.achievements ?? [];
}

export function hasAchievement(player: Player, id: AchievementId): boolean {
  return (player.achievements ?? []).includes(id);
}

export function achievementTotalScore(player: Player): number {
  let total = 0;
  for (const id of unlockedAchievements(player)) total += achievementInfo(id).points;
  return total;
}

/** All achievements whose condition currently holds (used to seed the
 *  start-of-game baseline so pre-existing state never awards achievements). */
export function currentlyMetIds(map: GameMap, player: Player): AchievementId[] {
  return ACHIEVEMENTS.filter((a) => a.met(map, player)).map((a) => a.id);
}

/** Adds every achievement whose condition is now true and returns the ones
 *  that were not open before. Achievements already satisfied at the game
 *  start (baseline) are skipped via `skip`. */
export function evaluateAchievements(map: GameMap, player: Player, skip: ReadonlySet<AchievementId> = new Set()): AchievementId[] {
  const opened = new Set(player.achievements ?? []);
  const newly: AchievementId[] = [];
  for (const a of ACHIEVEMENTS) {
    if (opened.has(a.id)) continue;
    if (skip.has(a.id)) continue;
    if (a.met(map, player)) {
      opened.add(a.id);
      newly.push(a.id);
    }
  }
  if (newly.length > 0) player.achievements = [...opened];
  return newly;
}

/** Grants the score of every open achievement. Called once at game end. */
export function awardAchievementScores(players: Player[]): void {
  for (const p of players) {
    awardScore(p, achievementTotalScore(p));
  }
}
