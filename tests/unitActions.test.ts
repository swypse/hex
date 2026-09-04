import { describe, it, expect } from 'vitest';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit } from '../src/game/units';
import { unitCanAct } from '../src/game/unitActions';

function tile(q: number, r: number, terrain: TileType, unit: Unit | null = null, settlement: MapTile['settlement'] = null): MapTile {
  return { q, r, terrain, settlement, unit, ownedBy: settlement ? settlement.owner : null, claimedByVillage: null, building: null, exploredBy: [0] };
}

function unit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    ...overrides,
  };
}

function player(): Player {
  return {
    index: 0, tribe: Tribe.Villagers, isHuman: true, name: 'p',
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    isActive: true, score: 0, kills: 0, skills: [],
  };
}

describe('unitCanAct', () => {
  it('a fresh unit with open tiles can act', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const u = unit();
    map.tiles.push(tile(0, 0, TileType.GrasslandLand, u), tile(1, 0, TileType.GrasslandLand));
    expect(unitCanAct(map, map.tiles[0]!, u, player())).toBe(true);
  });

  it('a unit that moved with no target cannot act', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const u = unit({ hasMoved: true });
    map.tiles.push(tile(0, 0, TileType.GrasslandLand, u));
    expect(unitCanAct(map, map.tiles[0]!, u, player())).toBe(false);
  });

  it('a moved unit can still act when an enemy is in attack range', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const u = unit({ hasMoved: true });
    const enemy = unit({ id: 'e', owner: 1, q: 1, r: 0 });
    map.tiles.push(tile(0, 0, TileType.GrasslandLand, u), tile(1, 0, TileType.GrasslandLand, enemy));
    expect(unitCanAct(map, map.tiles[0]!, u, player())).toBe(true);
  });

  it('a damaged unit that can heal can act', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const u = unit({ hp: 3 });
    map.tiles.push(tile(0, 0, TileType.GrasslandLand, u), tile(1, 0, TileType.GrasslandLand));
    expect(unitCanAct(map, map.tiles[0]!, u, player())).toBe(true);
  });

  it('a unit on a capturable enemy village can act', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const u = unit();
    map.tiles.push(tile(0, 0, TileType.GrasslandLand, u, { owner: 1, level: 1, captureReady: true }));
    expect(unitCanAct(map, map.tiles[0]!, u, player())).toBe(true);
  });
});
