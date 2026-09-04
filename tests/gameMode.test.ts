import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit } from '../src/game/units';
import {
  bonusScoreFor,
  captureWinnerIndex,
  computeWinner,
  countUnits,
  expectedTurnsFor,
  GAME_MODE_NAMES,
  rankPlayers,
} from '../src/game/gameMode';

function tile(
  q: number,
  r: number,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
  ownedBy: number | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy, claimedByVillage: null, building: null };
}

function player(index: number, overrides: Partial<Player> = {}): Player {
  return {
    index, tribe: Tribe.Villagers, isHuman: index === 0, name: `P${index}`,
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    score: 0, kills: 0, skills: [], isActive: true,
    ...overrides,
  };
}

function unit(owner: number, id: string): Unit {
  return { id, owner, type: 'warrior', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: null };
}

describe('gameMode', () => {
  it('has mode names', () => {
    expect(GAME_MODE_NAMES.capture).toBe('Capture the map');
    expect(GAME_MODE_NAMES.turns30).toBe('30 Turns');
  });

  it('computes expected turns and bonus', () => {
    expect(expectedTurnsFor(2)).toBe(15);
    expect(expectedTurnsFor(3)).toBe(20);
    expect(expectedTurnsFor(4)).toBe(25);
    expect(bonusScoreFor(2)).toBe(20);
    expect(bonusScoreFor(4)).toBe(40);
  });

  it('counts units on the map per player', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, unit(0, 'a')),
      tile(1, 0, null, unit(0, 'b')),
      tile(2, 0, null, unit(1, 'c')),
    );
    expect(countUnits(map, 0)).toBe(2);
    expect(countUnits(map, 1)).toBe(1);
  });

  it('captureWinnerIndex returns the single owner of all owned villages, ignoring free ones', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(1, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(2, 0, { owner: null, level: 1, captureReady: false }),
    );
    expect(captureWinnerIndex(map)).toBe(1);
  });

  it('captureWinnerIndex returns null when ownership is split', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 0, level: 1, captureReady: false }, null, 0),
      tile(1, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
    );
    expect(captureWinnerIndex(map)).toBeNull();
  });

  it('computeWinner picks the highest score', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const players = [player(0, { name: 'B', score: 10 }), player(1, { name: 'A', score: 20 })];
    expect(computeWinner(players, map)).toBe(1);
  });

  it('computeWinner breaks score ties by kills', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const players = [player(0, { name: 'A', score: 10, kills: 2 }), player(1, { name: 'B', score: 10, kills: 5 })];
    expect(computeWinner(players, map)).toBe(1);
  });

  it('computeWinner breaks score+kills ties by fewer units', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const a = player(0, { name: 'A', score: 10, kills: 2 });
    const b = player(1, { name: 'B', score: 10, kills: 2 });
    map.tiles.push(
      tile(0, 0, null, unit(0, 'a1')),
      tile(1, 0, null, unit(0, 'a2')),
      tile(2, 0, null, unit(1, 'b1')),
    );
    expect(computeWinner([a, b], map)).toBe(1);
  });

  it('computeWinner breaks all ties alphabetically', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const players = [player(0, { name: 'Zed' }), player(1, { name: 'Alice' })];
    expect(computeWinner(players, map)).toBe(1);
  });

  it('computeWinner ignores inactive players', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const players = [player(0, { name: 'A', score: 999, isActive: false }), player(1, { name: 'B' })];
    expect(computeWinner(players, map)).toBe(1);
  });

  it('ranks by score, then kills, then fewest units, then name', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, unit(0, 'a')),
      tile(1, 0, null, unit(1, 'b')),
    );
    const a = player(0, { score: 100, kills: 5 });
    const b = player(1, { score: 100, kills: 3 });
    const c = player(2, { score: 50 });
    const ranked = rankPlayers([a, b, c], map);
    expect(ranked.map((p) => p.index)).toEqual([0, 1, 2]);
  });
});
