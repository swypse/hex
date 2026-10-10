import { isExploredFor } from './map/explore';
import { type GameMap } from './map/map-gen';
import type { Player } from './players';
import { awardScore, EMPTY_STATS, type PlayerStats } from './score';
import { SKILLS } from './skills';
import { AchievementId } from '@enums';
import { tileMapByKey } from './map/tile-index';
import { roadNetworkComponents } from './economy/road-network';



export interface AchievementInfo {
  id: AchievementId;
  nameKey: string;
  descKey: string;
  points: number;
  icon: string;
  /** i18n key of the progress line; takes `{current}` and `{target}`. */
  progressKey: string;
  /** How far the player is: `current` of `target` (not clamped). */
  progress: (map: GameMap, player: Player) => AchievementProgress;
  met: (map: GameMap, player: Player) => boolean;
}

export interface AchievementProgress {
  current: number;
  target: number;
}

/** An achievement's `progress` and the `met` that follows from it. */
function counted(progress: AchievementInfo['progress']): Pick<AchievementInfo, 'progress' | 'met'> {
  return { progress, met: (map, player) => { const p = progress(map, player); return p.current >= p.target; } };
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

/** Largest number of the player's villages reachable over its own roads,
 *  bridges and ports. */
function largestVillageCluster(map: GameMap, player: Player): number {
  const byKey = tileMapByKey(map);
  let best = 0;
  for (const comp of roadNetworkComponents(map, player.index)) {
    let villages = 0;
    for (const k of comp) {
      const t = byKey.get(k);
      if (t && t.settlement !== null && t.settlement.owner === player.index) villages += 1;
    }
    if (villages > best) best = villages;
  }
  return best;
}

function skillsProgress(player: Player): AchievementProgress {
  return { current: new Set(player.skills).size, target: Object.keys(SKILLS).length };
}

function exploredProgress(map: GameMap, player: Player): AchievementProgress {
  return { current: map.tiles.filter((t) => isExploredFor(t, player.index)).length, target: map.tiles.length };
}

export const ACHIEVEMENTS: readonly AchievementInfo[] = [
  {
    id: AchievementId.GREAT_CONNECTOR,
    nameKey: 'ach.greatConnector.name',
    descKey: 'ach.greatConnector.desc',
    icon: ACHIEVEMENT_ICON.greatConnector,
    points: 100,
    progressKey: 'ach.greatConnector.progress',
    ...counted((map, player) => ({ current: largestVillageCluster(map, player), target: 4 })),
  },
  {
    id: AchievementId.PERFECT_CHAIN,
    nameKey: 'ach.perfectChain.name',
    descKey: 'ach.perfectChain.desc',
    icon: ACHIEVEMENT_ICON.perfectChain,
    points: 100,
    progressKey: 'ach.perfectChain.progress',
    ...counted((map, player) => ({ current: statsOf(player).knightCombos, target: 3 })),
  },
  {
    id: AchievementId.PIRATE_PURGER,
    nameKey: 'ach.piratePurger.name',
    descKey: 'ach.piratePurger.desc',
    icon: ACHIEVEMENT_ICON.piratePurger,
    points: 100,
    progressKey: 'ach.piratePurger.progress',
    ...counted((map, player) => ({ current: statsOf(player).pirateKills, target: 3 })),
  },
  {
    id: AchievementId.PIRATE_LUCKY_DAY,
    nameKey: 'ach.pirateLuckyDay.name',
    descKey: 'ach.pirateLuckyDay.desc',
    icon: ACHIEVEMENT_ICON.pirateLuckyDay,
    points: 150,
    progressKey: 'ach.pirateLuckyDay.progress',
    ...counted((map, player) => ({ current: statsOf(player).shipsCapturedByPirates, target: 3 })),
  },
  {
    id: AchievementId.NOTHING_LEFT_TO_LEARN,
    nameKey: 'ach.nothingLeftToLearn.name',
    descKey: 'ach.nothingLeftToLearn.desc',
    icon: ACHIEVEMENT_ICON.nothingLeftToLearn,
    points: 200,
    progressKey: 'ach.nothingLeftToLearn.progress',
    ...counted((map, player) => skillsProgress(player)),
  },
  {
    id: AchievementId.TEN_FOES_NO_SURVIVORS,
    nameKey: 'ach.tenFoesNoSurvivors.name',
    descKey: 'ach.tenFoesNoSurvivors.desc',
    icon: ACHIEVEMENT_ICON.tenFoesNoSurvivors,
    points: 100,
    progressKey: 'ach.tenFoesNoSurvivors.progress',
    ...counted((map, player) => ({ current: player.kills, target: 10 })),
  },
  {
    id: AchievementId.TRIPLE_SINK_JOB,
    nameKey: 'ach.tripleSinkJob.name',
    descKey: 'ach.tripleSinkJob.desc',
    icon: ACHIEVEMENT_ICON.tripleSinkJob,
    points: 100,
    progressKey: 'ach.tripleSinkJob.progress',
    ...counted((map, player) => ({ current: statsOf(player).enemyShipsKilled, target: 3 })),
  },
  {
    id: AchievementId.BONUS_HUNTER,
    nameKey: 'ach.bonusHunter.name',
    descKey: 'ach.bonusHunter.desc',
    icon: ACHIEVEMENT_ICON.bonusHunter,
    points: 200,
    progressKey: 'ach.bonusHunter.progress',
    ...counted((map, player) => ({ current: statsOf(player).bonusesCollected, target: 3 })),
  },
  {
    id: AchievementId.MASTER_CARTOGRAPHER,
    nameKey: 'ach.masterCartographer.name',
    descKey: 'ach.masterCartographer.desc',
    icon: ACHIEVEMENT_ICON.masterCartographer,
    points: 200,
    progressKey: 'ach.masterCartographer.progress',
    ...counted((map, player) => exploredProgress(map, player)),
  },
];

/** `current/target` progress line of an achievement, with `current` capped at `target`. */
export function achievementProgress(map: GameMap | null, player: Player, id: AchievementId): { current: number; target: number } | null {
  if (!map) return null;
  const { current, target } = achievementInfo(id).progress(map, player);
  return { current: Math.min(current, target), target };
}

export function achievementInfo(id: AchievementId): AchievementInfo {
  return ACHIEVEMENTS.find((a) => a.id === id)!;
}

export function achievementNameKey(id: AchievementId): string {
  return achievementInfo(id).nameKey;
}

export function achievementIcon(id: AchievementId): string {
  return achievementInfo(id).icon;
}

export function unlockedAchievements(player: Player): AchievementId[] {
  return player.achievements ?? [];
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
