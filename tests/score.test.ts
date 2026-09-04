import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Building, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit, UnitType } from '../src/game/units';
import {
  ARCHER_SCORE,
  awardScore,
  awardTempleScores,
  boardScore,
  BUILDING_SCORE,
  CAPTURE_SCORE,
  EXPLORED_SCORE,
  KILL_SCORE,
  PIRATE_KILL_SCORE,
  RIDER_SCORE,
  scoreBreakdown,
  SKILL_SCORE,
  totalScore,
  UPGRADE_SCORE,
  VILLAGE_SCORE,
  WARRIOR_SCORE,
} from '../src/game/score';

function unit(type: UnitType, owner: number): Unit {
  return {
    id: 'u',
    owner,
    type,
    q: 0,
    r: 0,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 5,
    attack: 2,
    attackDistance: 1,
    spawnVillage: null,
  };
}

function tile(
  q: number,
  r: number,
  ownedBy: number | null,
  settlement: Settlement | null = null,
  u: Unit | null = null,
  building: Building | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit: u, ownedBy, claimedByVillage: null, building };
}

function player(score = 0): Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'p',
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    isActive: true,
    score,
    kills: 0,
    skills: [],
  };
}

describe('score constants', () => {
  it('has the specified values', () => {
    expect(VILLAGE_SCORE).toBe(50);
    expect(WARRIOR_SCORE).toBe(5);
    expect(RIDER_SCORE).toBe(6);
    expect(ARCHER_SCORE).toBe(6);
    expect(BUILDING_SCORE).toBe(15);
    expect(UPGRADE_SCORE).toBe(20);
    expect(KILL_SCORE).toBe(25);
    expect(CAPTURE_SCORE).toBe(50);
    expect(PIRATE_KILL_SCORE).toBe(30);
    expect(SKILL_SCORE).toBe(15);
    expect(EXPLORED_SCORE).toBe(3);
  });
});

describe('boardScore', () => {
  it('counts villages, units by type, and buildings', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, 0, { owner: 0, level: 1, captureReady: false }),
      tile(1, 0, 0, null, unit('warrior', 0)),
      tile(2, 0, 0, null, unit('rider', 0)),
      tile(3, 0, 0, null, unit('archer', 0)),
      tile(4, 0, 0, null, null, { kind: 'sawmill', level: 1 }),
      tile(5, 0, 0, null, null, { kind: 'mine', level: 1 }),
    );
    expect(boardScore(map, 0)).toBe(
      VILLAGE_SCORE + WARRIOR_SCORE + RIDER_SCORE + ARCHER_SCORE + BUILDING_SCORE + BUILDING_SCORE,
    );
  });

  it('ignores tiles owned by other players', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, 0, { owner: 0, level: 1, captureReady: false }),
      tile(1, 0, 1, { owner: 1, level: 1, captureReady: false }),
      tile(2, 0, 1, null, unit('warrior', 1)),
    );
    expect(boardScore(map, 0)).toBe(VILLAGE_SCORE);
    expect(boardScore(map, 1)).toBe(VILLAGE_SCORE + WARRIOR_SCORE);
  });

  it('awards points per tile explored by the player', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const explored = tile(0, 0, null);
    explored.exploredBy = [0, 1];
    const mine = tile(1, 0, null);
    mine.exploredBy = [1];
    const notExplored = tile(2, 0, null);
    map.tiles.push(explored, mine, notExplored);
    expect(boardScore(map, 0)).toBe(EXPLORED_SCORE);
    expect(boardScore(map, 1)).toBe(EXPLORED_SCORE * 2);
  });

  it('counts explored tiles in addition to owned villages', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const village = tile(0, 0, 0, { owner: 0, level: 1, captureReady: false });
    village.exploredBy = [0];
    map.tiles.push(village);
    expect(boardScore(map, 0)).toBe(VILLAGE_SCORE + EXPLORED_SCORE);
  });

  it('does not count temples in the generic building score', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, 0, null, null, { kind: 'temple', level: 4 }),
      tile(1, 0, 0, null, null, { kind: 'sawmill', level: 1 }),
    );
    expect(boardScore(map, 0)).toBe(BUILDING_SCORE);
  });

  it('does not count forest temples in the generic building score', () => {
    const map: GameMap = {
      radius: 2,
      tiles: [tile(0, 0, 0, null, null, { kind: 'forestTemple', level: 4 })],
      spawns: [],
    };
    expect(boardScore(map, 0)).toBe(0);
  });
});

describe('awardScore', () => {
  it('adds the amount to the player score', () => {
    const p = player(10);
    awardScore(p, KILL_SCORE);
    expect(p.score).toBe(10 + KILL_SCORE);
  });
});

describe('awardTempleScores', () => {
  it('grants 10/15/20/25 by temple level at game end for own temples only', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, 0, null, null, { kind: 'temple', level: 1 }),
      tile(1, 0, 0, null, null, { kind: 'temple', level: 2 }),
      tile(2, 0, 0, null, null, { kind: 'temple', level: 4 }),
      tile(3, 0, 1, null, null, { kind: 'temple', level: 4 }),
    );
    const p0 = player();
    const p1 = { ...player(), index: 1 };
    awardTempleScores(map, [p0, p1]);
    expect(p0.score).toBe(10 + 15 + 25);
    expect(p1.score).toBe(25);
  });

  it('awards end-game temple scores for forest temples', () => {
    const map: GameMap = {
      radius: 2,
      tiles: [
        tile(0, 0, 0, null, null, { kind: 'forestTemple', level: 1 }),
        tile(1, 0, 0, null, null, { kind: 'forestTemple', level: 3 }),
      ],
      spawns: [],
    };
    const p = player();
    awardTempleScores(map, [p]);
    expect(p.score).toBe(10 + 20);
  });
});

describe('totalScore', () => {
  it('sums stored score and board score', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, 0, { owner: 0, level: 1, captureReady: false }));
    const p = player(UPGRADE_SCORE);
    expect(totalScore(map, p)).toBe(UPGRADE_SCORE + VILLAGE_SCORE);
  });
});

describe('scoreBreakdown', () => {
  it('itemizes action scores and board scores, summing to totalScore', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, 0, { owner: 0, level: 1, captureReady: false }, unit('warrior', 0)),
      tile(1, 0, 0, null, null, { kind: 'sawmill', level: 1 }),
      tile(2, 0, 0, null, null, { kind: 'temple', level: 2 }),
      tile(3, 0, 0, null, null, { kind: 'forestTemple', level: 3 }),
    );
    const p: Player = {
      index: 0, tribe: Tribe.Villagers, isHuman: true, name: 'p',
      resources: { wood: 0, stone: 0, money: 0, ore: 0 },
      score: 25 + 30 + 50 + 20 + 15 + 15 + 20 + 40,
      kills: 2, skills: ['swordsman'], isActive: true,
      stats: { killedUnits: 3, pirateKills: 1, villagesCaptured: 1, villageUpgrades: 1 },
    };
    const items = scoreBreakdown(map, p, 40);
    const byLabel = new Map(items.map((i) => [i.label, i]));
    expect(byLabel.get('Killed units')!.count).toBe(3);
    expect(byLabel.get('Kills')!.count).toBe(1);
    expect(byLabel.get('Kills')!.score).toBe(KILL_SCORE);
    expect(byLabel.get('Pirate kills')!.count).toBe(1);
    expect(byLabel.get('Pirate kills')!.score).toBe(PIRATE_KILL_SCORE);
    expect(byLabel.get('Buildings')!.count).toBe(1);
    expect(byLabel.get('Buildings')!.score).toBe(BUILDING_SCORE);
    expect(byLabel.get('WaterTemples')!.score).toBe(15);
    expect(byLabel.get('ForestTemples')!.score).toBe(20);
    expect(byLabel.get('Captured villages')!.count).toBe(1);
    expect(byLabel.get('Captured villages')!.score).toBe(CAPTURE_SCORE);
    expect(byLabel.get('Village upgrades')!.count).toBe(1);
    expect(byLabel.get('Village upgrades')!.score).toBe(UPGRADE_SCORE);
    expect(byLabel.get('Skills opened')!.count).toBe(1);
    expect(byLabel.get('Skills opened')!.score).toBe(SKILL_SCORE);
    expect(byLabel.get('Fast capture-mode bonus')!.score).toBe(40);
    const sum = items.reduce((acc, i) => acc + i.score, 0);
    expect(sum).toBe(totalScore(map, p));
  });
});

describe('bridge score', () => {
  function bridgeTile(owner: number): MapTile {
    return {
      q: 0, r: 0, terrain: TileType.Water, settlement: null, building: null,
      unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0],
      bridge: { owner, dir: 'we' as const },
    };
  }

  it('adds 5 per owned bridge', () => {
    const map: GameMap = { radius: 1, tiles: [bridgeTile(0)], spawns: [] };
    expect(boardScore(map, 0)).toBe(EXPLORED_SCORE + 5);
  });

  it("does not count another player's bridge", () => {
    const map: GameMap = { radius: 1, tiles: [bridgeTile(1)], spawns: [] };
    expect(boardScore(map, 0)).toBe(EXPLORED_SCORE);
  });

  it('breakdown lists owned bridges', () => {
    const map: GameMap = { radius: 1, tiles: [bridgeTile(0)], spawns: [] };
    const items = scoreBreakdown(map, player(), 0);
    const row = items.find((i) => i.label === 'Bridges')!;
    expect(row.count).toBe(1);
    expect(row.score).toBe(5);
  });
});
