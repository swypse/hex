import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/map-gen';
import { TileType } from '../src/game/tile-types';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit } from '../src/game/units';
import {
  captureWinnerIndex,
  computeWinner,
  countUnits,
  GAME_MODE_NAMES,
  quickCaptureScore,
  quickCaptureTurnsCount,
  rankPlayers,
  shouldPromptWatch,
  starRating,
} from '../src/game/game-mode';

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

  it('computes quick-capture turns and bonus', () => {
    expect(quickCaptureTurnsCount(2)).toBe(20);
    expect(quickCaptureTurnsCount(3)).toBe(25);
    expect(quickCaptureTurnsCount(4)).toBe(30);
    expect(quickCaptureScore(2)).toBe(40);
    expect(quickCaptureScore(4)).toBe(80);
  });

  it('rates capture games by score and the quick-capture turns budget', () => {
    // 3 players: 3★ needs >= 1100 and turn <= 25; 2★ needs >= 850.
    expect(starRating(1200, 3, 'capture', 10)).toBe(3);
    expect(starRating(1200, 3, 'capture', 26)).toBe(2);
    expect(starRating(900, 3, 'capture', 10)).toBe(2);
    expect(starRating(100, 3, 'capture', 10)).toBe(1);
  });

  it('rates 30-turn games by score only', () => {
    // 3 players: 3★ needs >= 3400; 2★ needs >= 2600.
    expect(starRating(3500, 3, 'turns30', 30)).toBe(3);
    expect(starRating(3000, 3, 'turns30', 30)).toBe(2);
    expect(starRating(100, 3, 'turns30', 30)).toBe(1);
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

describe('shouldPromptWatch', () => {
  const base = { netMode: 'single', mode: 'capture' as const, gameOver: false, watching: false, localActive: false, overlayKind: null };
  it('prompts when the local player is eliminated in single capture', () => {
    expect(shouldPromptWatch(base)).toBe(true);
  });
  it('does not prompt on a live player', () => {
    expect(shouldPromptWatch({ ...base, localActive: true })).toBe(false);
  });
  it('does not prompt when game is over', () => {
    expect(shouldPromptWatch({ ...base, gameOver: true })).toBe(false);
  });
  it('does not prompt in multiplayer or non-capture mode', () => {
    expect(shouldPromptWatch({ ...base, netMode: 'host' })).toBe(false);
    expect(shouldPromptWatch({ ...base, mode: 'turns30' })).toBe(false);
  });
  it('does not prompt while already watching or already prompted', () => {
    expect(shouldPromptWatch({ ...base, watching: true })).toBe(false);
    expect(shouldPromptWatch({ ...base, overlayKind: 'watchingPrompt' })).toBe(false);
  });
});
