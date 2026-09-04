import { isExploredFor } from './explore';
import { GameMap } from './mapGen';
import { Player } from './players';
import { UnitType } from './units';

export const VILLAGE_SCORE = 50;
export const WARRIOR_SCORE = 5;
export const RIDER_SCORE = 6;
export const ARCHER_SCORE = 6;
export const BUILDING_SCORE = 15;
export const BRIDGE_SCORE = 5;
export const UPGRADE_SCORE = 20;
export const KILL_SCORE = 25;
export const CAPTURE_SCORE = 50;
export const PIRATE_KILL_SCORE = 30;
export const COMBO_SCORE = 30;
export const SKILL_SCORE = 15;
export const EXPLORED_SCORE = 3;
export const TEMPLE_SCORES: Record<number, number> = { 1: 10, 2: 15, 3: 20, 4: 25 };

const UNIT_SCORE: Partial<Record<UnitType, number>> = {
  warrior: WARRIOR_SCORE,
  rider: RIDER_SCORE,
  archer: ARCHER_SCORE,
};

export function boardScore(map: GameMap, playerIndex: number): number {
  let score = 0;
  for (const tile of map.tiles) {
    if (isExploredFor(tile, playerIndex)) score += EXPLORED_SCORE;
    if (tile.bridge?.owner === playerIndex) score += BRIDGE_SCORE;
    if (tile.ownedBy !== playerIndex) continue;
    if (tile.settlement) score += VILLAGE_SCORE;
    if (tile.unit) score += UNIT_SCORE[tile.unit.type] ?? 0;
    if (tile.building && tile.building.kind !== 'temple' && tile.building.kind !== 'forestTemple') score += BUILDING_SCORE;
  }
  return score;
}

export function awardTempleScores(map: GameMap, players: Player[]): void {
  for (const tile of map.tiles) {
    if (!tile.building || (tile.building.kind !== 'temple' && tile.building.kind !== 'forestTemple') || tile.ownedBy === null) continue;
    const player = players[tile.ownedBy];
    if (player) player.score += TEMPLE_SCORES[tile.building.level] ?? 0;
  }
}

export function awardScore(player: Player, amount: number): void {
  player.score += amount;
}

export function totalScore(map: GameMap, player: Player): number {
  return player.score + boardScore(map, player.index);
}

export interface PlayerStats {
  killedUnits: number;
  pirateKills: number;
  villagesCaptured: number;
  villageUpgrades: number;
}

export const EMPTY_STATS: PlayerStats = { killedUnits: 0, pirateKills: 0, villagesCaptured: 0, villageUpgrades: 0 };

export interface ScoreBreakdownItem {
  label: string;
  count: number;
  score: number;
}

export function scoreBreakdown(map: GameMap, player: Player, fastBonus: number): ScoreBreakdownItem[] {
  const stats = player.stats ?? EMPTY_STATS;
  const pirateKills = stats.pirateKills;
  const kills = Math.max(0, player.kills - pirateKills);
  const skillsOpened = player.skills.length;
  const explored = map.tiles.filter((t) => isExploredFor(t, player.index)).length;
  let villages = 0;
  let units = 0;
  let unitScore = 0;
  let buildings = 0;
  let buildingScore = 0;
  let bridges = 0;
  let bridgeScore = 0;
  let waterTemples = 0;
  let waterTempleScore = 0;
  let forestTemples = 0;
  let forestTempleScore = 0;
  for (const t of map.tiles) {
    if (t.bridge?.owner === player.index) {
      bridges += 1;
      bridgeScore += BRIDGE_SCORE;
    }
    if (t.ownedBy !== player.index) continue;
    if (t.settlement) villages += 1;
    if (t.unit) {
      units += 1;
      unitScore += UNIT_SCORE[t.unit.type] ?? 0;
    }
    if (!t.building) continue;
    if (t.building.kind === 'temple') {
      waterTemples += 1;
      waterTempleScore += TEMPLE_SCORES[t.building.level] ?? 0;
    } else if (t.building.kind === 'forestTemple') {
      forestTemples += 1;
      forestTempleScore += TEMPLE_SCORES[t.building.level] ?? 0;
    } else {
      buildings += 1;
      buildingScore += BUILDING_SCORE;
    }
  }
  return [
    { label: 'Killed units', count: stats.killedUnits, score: 0 },
    { label: 'Kills', count: kills, score: kills * KILL_SCORE },
    { label: 'Pirate kills', count: pirateKills, score: pirateKills * PIRATE_KILL_SCORE },
    { label: 'Buildings', count: buildings, score: buildingScore },
    { label: 'Bridges', count: bridges, score: bridgeScore },
    { label: 'WaterTemples', count: waterTemples, score: waterTempleScore },
    { label: 'ForestTemples', count: forestTemples, score: forestTempleScore },
    { label: 'Captured villages', count: stats.villagesCaptured, score: stats.villagesCaptured * CAPTURE_SCORE },
    { label: 'Village upgrades', count: stats.villageUpgrades, score: stats.villageUpgrades * UPGRADE_SCORE },
    { label: 'Skills opened', count: skillsOpened, score: skillsOpened * SKILL_SCORE },
    { label: 'Explored tiles', count: explored, score: explored * EXPLORED_SCORE },
    { label: 'Villages', count: villages, score: villages * VILLAGE_SCORE },
    { label: 'Units', count: units, score: unitScore },
    { label: 'Fast capture-mode bonus', count: 0, score: fastBonus },
  ];
}
