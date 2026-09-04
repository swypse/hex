import { describe, it, expect } from 'vitest';
import { activeBuffs, damageReduction, BUFF_INFO } from '../src/game/buffs';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Unit } from '../src/game/units';

function tile(q: number, r: number, terrain: TileType, ownedBy: number | null, building: MapTile['building'] = null): MapTile {
  return { q, r, terrain, settlement: null, building, unit: null, ownedBy, claimedByVillage: null };
}

function makeWaterMap(): GameMap {
  return {
    radius: 4,
    tiles: [
      tile(0, 0, TileType.Water, 0, { kind: 'temple', level: 1 }),
      tile(1, 0, TileType.Water, 0, { kind: 'temple', level: 1 }),
      tile(2, 0, TileType.Water, 0, { kind: 'temple', level: 1 }),
      tile(3, 0, TileType.Water, 1, { kind: 'temple', level: 1 }),
    ],
    spawns: [],
  };
}

function makeForestMap(): GameMap {
  return {
    radius: 4,
    tiles: [
      tile(0, 0, TileType.GrasslandForest, 0, { kind: 'forestTemple', level: 1 }),
      tile(1, 0, TileType.GrasslandForest, 0, { kind: 'forestTemple', level: 1 }),
      tile(2, 0, TileType.GrasslandForest, 0, { kind: 'forestTemple', level: 1 }),
    ],
    spawns: [],
  };
}

function makeUnit(id: string, owner: number, q: number, r: number, ship: boolean): Unit {
  return {
    id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    ...(ship ? { shipLevel: 1 as const } : {}),
  };
}

describe('activeBuffs', () => {
  it('gives no buff below 3 temples', () => {
    expect(activeBuffs(makeWaterMap(), 1)).toEqual([]);
  });

  it('gives water protection at 3 owned water temples', () => {
    expect(activeBuffs(makeWaterMap(), 0)).toContain('waterProtection');
  });

  it('gives forest protection at 3 owned forest temples', () => {
    expect(activeBuffs(makeForestMap(), 0)).toContain('forestProtection');
  });
});

describe('damageReduction', () => {
  it('reduces ship damage with water protection', () => {
    const map = makeWaterMap();
    const ship = makeUnit('s', 0, 0, 0, true);
    expect(damageReduction(map, ship, tile(0, 0, TileType.Water, 0))).toBe(10);
  });

  it('reduces forest-cell damage with forest protection', () => {
    const map = makeForestMap();
    const unit = makeUnit('u', 0, 0, 0, false);
    expect(damageReduction(map, unit, tile(0, 0, TileType.GrasslandForest, 1))).toBe(10);
  });

  it('returns 0 for a protected player unit not on a forest tile', () => {
    const map = makeForestMap();
    const unit = makeUnit('u', 0, 0, 0, false);
    expect(damageReduction(map, unit, tile(0, 0, TileType.GrasslandLand, 0))).toBe(0);
  });

  it('returns 0 for units of a player without the buff', () => {
    const map = makeWaterMap();
    const unit = makeUnit('u', 1, 3, 0, true);
    expect(damageReduction(map, unit, tile(3, 0, TileType.Water, 1))).toBe(0);
  });

  it('defines the requested tooltip texts', () => {
    expect(BUFF_INFO.waterProtection.tooltip).toBe('Water Protection: -10 dmg for ships');
    expect(BUFF_INFO.forestProtection.tooltip).toBe('Forest Protection: -10 dmg for units in forest');
  });
});
