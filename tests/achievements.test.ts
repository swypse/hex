import { describe, expect, it } from 'vitest';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import { SKILLS } from '../src/game/skills';
import { EMPTY_STATS } from '../src/game/score';
import { Player } from '../src/game/players';
import {
  ACHIEVEMENTS,
  achievementInfo,
  achievementTotalScore,
  awardAchievementScores,
  evaluateAchievements,
  currentlyMetIds,
  unlockedAchievements,
  type AchievementId,
} from '../src/game/achievements';

function tile(q: number, r: number, over: Partial<MapTile> = {}): MapTile {
  return {
    q, r, terrain: TileType.GrasslandLand, settlement: null, building: null,
    unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [],
    ...over,
  };
}

function mapOf(tiles: MapTile[]): GameMap {
  return { radius: 3, spawns: [], tiles };
}

function player(over: Partial<Player> = {}): Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'P',
    resources: { ...START_RESOURCES },
    score: 0,
    kills: 0,
    skills: [],
    isActive: true,
    stats: { ...EMPTY_STATS },
    achievements: [],
    ...over,
  };
}

describe('achievements', () => {
  it('exposes one info entry per achievement id', () => {
    for (const a of ACHIEVEMENTS) {
      expect(achievementInfo(a.id).points).toBeGreaterThan(0);
      expect(a.nameKey.startsWith('ach.')).toBe(true);
    }
  });

  it('unlocks Nothing Left to Learn when every skill is opened', () => {
    const p = player({ skills: Object.keys(SKILLS) as Player['skills'] });
    expect(evaluateAchievements(mapOf([tile(0, 0)]), p)).toContain('nothingLeftToLearn');
  });

  it('unlocks kill/counter achievements from stats', () => {
    const stats = {
      killedUnits: 0, pirateKills: 3, villagesCaptured: 0, villageUpgrades: 0,
      knightCombos: 3, enemyShipsKilled: 3, shipsCapturedByPirates: 3, bonusesCollected: 3,
      tribesEliminated: 0,
    };
    const p = player({ kills: 10, stats });
    const opened = new Set(evaluateAchievements(mapOf([tile(0, 0)]), p));
    expect(opened).toContain('perfectChain');
    expect(opened).toContain('piratePurger');
    expect(opened).toContain('pirateLuckyDay');
    expect(opened).toContain('tenFoesNoSurvivors');
    expect(opened).toContain('tripleSinkJob');
    expect(opened).toContain('bonusHunter');
  });

  it('does not unlock a stat achievement below its threshold', () => {
    const p = player({ kills: 9 });
    p.stats!.pirateKills = 2;
    p.stats!.knightCombos = 2;
    p.stats!.enemyShipsKilled = 2;
    p.stats!.shipsCapturedByPirates = 2;
    p.stats!.bonusesCollected = 2;
    expect(evaluateAchievements(mapOf([tile(0, 0)]), p)).toEqual([]);
  });

  it('unlocks The Great Connector when 4 owned villages share a road network', () => {
    const tiles = [
      tile(0, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
      tile(1, 0, { roadOwner: 0 }),
      tile(2, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
      tile(3, 0, { roadOwner: 0 }),
      tile(4, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
      tile(5, 0, { roadOwner: 0 }),
      tile(6, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
    ];
    const p = player();
    expect(evaluateAchievements(mapOf(tiles), p)).toContain('greatConnector');
  });

  it('does not unlock The Great Connector for fewer than 4 connected villages', () => {
    const tiles = [
      tile(0, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
      tile(1, 0, { roadOwner: 0 }),
      tile(2, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
    ];
    const p = player();
    expect(evaluateAchievements(mapOf(tiles), p)).not.toContain('greatConnector');
  });

  it('unlocks The Great Connector when villages are linked through ports over own water', () => {
    const tiles = [
      tile(0, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
      tile(1, 0, { roadOwner: 0 }),
      tile(2, 0, { terrain: TileType.Water, building: { kind: 'port', level: 1 }, ownedBy: 0 }),
      tile(3, 0, { terrain: TileType.Water, ownedBy: 0 }),
      tile(4, 0, { terrain: TileType.Water, building: { kind: 'port', level: 1 }, ownedBy: 0 }),
      tile(5, 0, { roadOwner: 0 }),
      tile(6, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
      tile(7, 0, { roadOwner: 0 }),
      tile(8, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
      tile(9, 0, { roadOwner: 0 }),
      tile(10, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
    ];
    const p = player();
    expect(evaluateAchievements(mapOf(tiles), p)).toContain('greatConnector');
  });

  it('does not unlock The Great Connector when the water gap between ports is unowned', () => {
    const tiles = [
      tile(0, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
      tile(1, 0, { roadOwner: 0 }),
      tile(2, 0, { terrain: TileType.Water, building: { kind: 'port', level: 1 }, ownedBy: 0 }),
      tile(3, 0, { terrain: TileType.Water }),
      tile(4, 0, { terrain: TileType.Water, building: { kind: 'port', level: 1 }, ownedBy: 0 }),
      tile(5, 0, { roadOwner: 0 }),
      tile(6, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
      tile(7, 0, { roadOwner: 0 }),
      tile(8, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
      tile(9, 0, { roadOwner: 0 }),
      tile(10, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
    ];
    const p = player();
    expect(evaluateAchievements(mapOf(tiles), p)).not.toContain('greatConnector');
  });

  it('unlocks Master Cartographer only when every tile is explored', () => {
    const p = player();
    expect(evaluateAchievements(mapOf([tile(0, 0), tile(1, 0)]), p)).toEqual([]);
    const full = mapOf([
      tile(0, 0, { exploredBy: [0] }),
      tile(1, 0, { exploredBy: [0] }),
    ]);
    expect(evaluateAchievements(full, p)).toContain('masterCartographer');
  });

  it('records an unlock only once', () => {
    const p = player({ kills: 10 });
    const first = evaluateAchievements(mapOf([tile(0, 0)]), p);
    expect(first).toContain('tenFoesNoSurvivors');
    expect(unlockedAchievements(p)).toContain('tenFoesNoSurvivors');
    expect(evaluateAchievements(mapOf([tile(0, 0)]), p)).toEqual([]);
  });

  it('respects the start-of-game baseline skip', () => {
    const p = player();
    const met = new Set<AchievementId>(currentlyMetIds(mapOf([tile(0, 0, { exploredBy: [0] })]), p));
    expect(met.has('masterCartographer')).toBe(true);
    expect(evaluateAchievements(mapOf([tile(0, 0, { exploredBy: [0] })]), p, met)).toEqual([]);
  });

  it('awards the sum of unlocked achievement points at game end', () => {
    const p = player({ kills: 10 });
    p.achievements = ['tenFoesNoSurvivors', 'bonusHunter'];
    p.stats!.bonusesCollected = 3;
    awardAchievementScores([p]);
    expect(p.score).toBe(achievementTotalScore(p));
    expect(p.score).toBe(achievementInfo('tenFoesNoSurvivors').points + achievementInfo('bonusHunter').points);
  });
});
