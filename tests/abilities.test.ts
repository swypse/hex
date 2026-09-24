import { describe, it, expect } from 'vitest';
import { GameMap, MapTile } from '../src/game/map-gen';
import { makeUnit } from '../src/game/units';
import { isWaterType, TileType } from '../src/game/tile-types';
import { bannerAttackBonus, berserkerRage, effectiveAttack, isStunned } from '../src/game/abilities';

function tile(q: number, r: number, terrain: TileType = TileType.GrasslandLand): MapTile {
  return { q, r, terrain, settlement: null, building: null, unit: null, ownedBy: null, claimedByVillage: null };
}

function mapWith(size = 6): GameMap {
  const tiles: MapTile[] = [];
  for (let q = -size; q <= size; q++) {
    for (let r = -size; r <= size; r++) {
      tiles.push(tile(q, r));
    }
  }
  return { radius: size, tiles, spawns: [] };
}

function put(map: GameMap, q: number, r: number, unit: ReturnType<typeof makeUnit>): void {
  const t = map.tiles.find((x) => x.q === q && x.r === r)!;
  t.unit = unit;
}

describe('banner aura', () => {
  it('gives +10 to allies within 2 hexes, not to the banner itself', () => {
    const map = mapWith();
    const banner = makeUnit(0, 'banner', 0, 0);
    put(map, 0, 0, banner);
    const ally = makeUnit(0, 'warrior', 2, 0);
    put(map, 2, 0, ally);
    expect(bannerAttackBonus(map, ally)).toBe(10);
    expect(bannerAttackBonus(map, banner)).toBe(0);
  });

  it('does not apply to enemies or units beyond range 2', () => {
    const map = mapWith();
    put(map, 0, 0, makeUnit(0, 'banner', 0, 0));
    const enemy = makeUnit(1, 'warrior', 1, 0);
    put(map, 1, 0, enemy);
    expect(bannerAttackBonus(map, enemy)).toBe(0);
    const far = makeUnit(0, 'warrior', 3, 0);
    put(map, 3, 0, far);
    expect(bannerAttackBonus(map, far)).toBe(0);
  });

  it('is a flat +10 even with several banners nearby', () => {
    const map = mapWith();
    put(map, 0, 0, makeUnit(0, 'banner', 0, 0));
    put(map, 1, 0, makeUnit(0, 'banner', 1, 0));
    const ally = makeUnit(0, 'warrior', 0, 1);
    put(map, 0, 1, ally);
    expect(bannerAttackBonus(map, ally)).toBe(10);
  });
});

describe('berserker rage', () => {
  it('gives +20 at or below 50% HP, else 0', () => {
    const u = makeUnit(0, 'berserker', 0, 0);
    expect(berserkerRage(u)).toBe(0);
    u.hp = 35; // exactly 50% of 70
    expect(berserkerRage(u)).toBe(20);
    u.hp = 20;
    expect(berserkerRage(u)).toBe(20);
  });

  it('only applies to berserkers', () => {
    expect(berserkerRage(makeUnit(0, 'warrior', 0, 0, { hp: 1 }))).toBe(0);
  });
});

describe('effectiveAttack', () => {
  it('combines base + banner + rage', () => {
    const map = mapWith();
    put(map, 1, 0, makeUnit(0, 'banner', 1, 0));
    const berserker = makeUnit(0, 'berserker', 0, 0, { hp: 20 }); // raging
    put(map, 0, 0, berserker);
    expect(effectiveAttack(berserker, map)).toBe(50 + 20 + 10);
  });

  it('no map means no aura but rage still applies', () => {
    expect(effectiveAttack(makeUnit(0, 'warrior', 0, 0), null)).toBe(20);
    expect(effectiveAttack(makeUnit(0, 'berserker', 0, 0, { hp: 10 }), null)).toBe(50 + 20);
  });
});

describe('stun', () => {
  it('isStunned is true while stunTurns >= 1', () => {
    const u = makeUnit(0, 'warrior', 0, 0);
    expect(isStunned(u)).toBe(false);
    u.stunTurns = 1;
    expect(isStunned(u)).toBe(true);
    u.stunTurns = 0;
    expect(isStunned(u)).toBe(false);
  });
});

void isWaterType; // keep the import for potential terrain-specific future assertions