import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import {
  UNIT_TYPES,
  UNIT_IMAGE_FILES,
  UNIT_MOVEMENT,
  UNIT_ATTACK,
  UNIT_ATTACK_DISTANCE,
  UNIT_TYPE_NAMES,
  UnitType,
  canAttack,
  canHeal,
  canMove,
  healUnit,
  moveRange,
  makeUnit,
  HEAL_AMOUNT,
} from '../src/game/units';

describe('UNIT_TYPES', () => {
  it('defines warrior, rider, archer, swordsman', () => {
    expect(UNIT_TYPES.warrior).toEqual({ movement: 1, attack: 20, attackDistance: 1, maxHp: 50, defence: 0, price: 4, priceWood: 0, priceOre: 0, shape: 'circle' });
    expect(UNIT_TYPES.rider).toEqual({ movement: 4, attack: 20, attackDistance: 1, maxHp: 40, defence: 5, price: 6, priceWood: 0, priceOre: 0, shape: 'square' });
    expect(UNIT_TYPES.archer).toEqual({ movement: 1, attack: 20, attackDistance: 2, maxHp: 30, defence: 5, price: 6, priceWood: 0, priceOre: 0, shape: 'triangle' });
    expect(UNIT_TYPES.swordsman).toEqual({ movement: 1, attack: 40, attackDistance: 1, maxHp: 80, defence: 10, price: 15, priceWood: 0, priceOre: 3, shape: 'swordsman' });
  });

  it('defines the shield unit with 100 hp, 1 movement and a 10 money + 3 ore price', () => {
    expect(UNIT_TYPES.shield).toEqual({ movement: 1, attack: 10, attackDistance: 1, maxHp: 100, defence: 20, price: 10, priceWood: 0, priceOre: 3, shape: 'square' });
  });

  it('defines the catapult unit with siege stats and a wood cost', () => {
    expect(UNIT_TYPES.catapult).toEqual({ movement: 1, attack: 40, attackDistance: 4, maxHp: 30, defence: 0, price: 30, priceWood: 20, priceOre: 5, shape: 'square' });
    expect(UNIT_MOVEMENT.catapult).toBe(1);
    expect(UNIT_ATTACK.catapult).toBe(40);
    expect(UNIT_ATTACK_DISTANCE.catapult).toBe(4);
    expect(UNIT_TYPE_NAMES.catapult).toBe('Catapult');
  });

  it('defines the knight unit with 3 movement, 5 attack and an ore cost', () => {
    expect(UNIT_TYPES.knight).toEqual({ movement: 3, attack: 50, attackDistance: 1, maxHp: 50, defence: 10, price: 20, priceWood: 0, priceOre: 10, shape: 'swordsman' });
    expect(UNIT_MOVEMENT.knight).toBe(3);
    expect(UNIT_ATTACK.knight).toBe(50);
    expect(UNIT_ATTACK_DISTANCE.knight).toBe(1);
    expect(UNIT_TYPE_NAMES.knight).toBe('Knight');
  });
});

describe('UNIT_IMAGE_FILES', () => {
  it('maps every tribe and unit type to its texture file', () => {
    expect(UNIT_IMAGE_FILES).toEqual({
      [Tribe.Cats]: { warrior: 'cats-warrior.png', rider: 'cats-rider.png', archer: 'cats-archer.png', swordsman: 'cats-swordsman.png', shield: 'cats-shield.png', catapult: 'cats-catapult.png', knight: 'cats-knight.png' },
      [Tribe.Warriors]: { warrior: 'warriors-warrior.png', rider: 'warriors-rider.png', archer: 'warriors-archer.png', swordsman: 'warriors-swordsman.png', shield: 'warriors-shield.png', catapult: 'warriors-catapult.png', knight: 'warriors-knight.png' },
      [Tribe.Villagers]: { warrior: 'villagers-warrior.png', rider: 'villagers-rider.png', archer: 'villagers-archer.png', swordsman: 'villagers-swordsman.png', shield: 'villagers-shield.png', catapult: 'villagers-catapult.png', knight: 'villagers-knight.png' },
      [Tribe.Barbarians]: { warrior: 'barbarians-warrior.png', rider: 'barbarians-rider.png', archer: 'barbarians-archer.png', swordsman: 'barbarians-swordsman.png', shield: 'barbarians-shield.png', catapult: 'barbarians-catapult.png', knight: 'barbarians-knight.png' },
      [Tribe.Forest]: { warrior: 'forest-warrior.png', rider: 'forest-rider.png', archer: 'forest-archer.png', swordsman: 'forest-swordsman.png', shield: 'forest-shield.png', catapult: 'forest-catapult.png', knight: 'forest-knight.png' },
      [Tribe.Aqua]: { warrior: 'aqua-warrior.png', rider: 'aqua-rider.png', archer: 'aqua-archer.png', swordsman: 'aqua-swordsman.png', shield: 'aqua-shield.png', catapult: 'aqua-catapult.png', knight: 'aqua-knight.png' },
    });
  });
});

function mkUnit(overrides: Partial<import('../src/game/units').Unit> = {}): import('../src/game/units').Unit {
  return {
    id: 'u',
    owner: 0,
    type: 'warrior',
    q: 0,
    r: 0,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 50,
    attack: 20,
    attackDistance: 1,
    defence: 0,
    spawnVillage: null,
    ...overrides,
  };
}

function makeShield(overrides: Partial<import('../src/game/units').Unit> = {}): import('../src/game/units').Unit {
  return {
    id: 's',
    owner: 0,
    type: 'shield',
    q: 0,
    r: 0,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 100,
    attack: 10,
    attackDistance: 1,
    defence: 20,
    spawnVillage: null,
    ...overrides,
  };
}

function makeCatapult(overrides: Partial<import('../src/game/units').Unit> = {}): import('../src/game/units').Unit {
  return {
    id: 'c',
    owner: 0,
    type: 'catapult',
    q: 0,
    r: 0,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 30,
    attack: 40,
    attackDistance: 4,
    defence: 0,
    spawnVillage: null,
    ...overrides,
  };
}

describe('action availability', () => {
  it('canMove: fresh unit yes, warrior after attack no, rider after attack yes with full move', () => {
    expect(canMove(mkUnit())).toBe(true);
    expect(canMove(mkUnit({ hasMoved: true }))).toBe(false);
    expect(canMove(mkUnit({ hasHealed: true }))).toBe(false);
    expect(canMove(mkUnit({ hasAttacked: true }))).toBe(false);
    expect(canMove(mkUnit({ type: 'rider', hasAttacked: true }))).toBe(true);
    expect(moveRange(mkUnit({ type: 'rider', hasAttacked: true }))).toBe(4);
    expect(moveRange(mkUnit())).toBe(1);
    expect(moveRange(mkUnit({ type: 'rider' }))).toBe(4);
  });

  it('canAttack: available after moving, blocked after attacking/healing', () => {
    expect(canAttack(mkUnit())).toBe(true);
    expect(canAttack(mkUnit({ hasMoved: true }))).toBe(true);
    expect(canAttack(mkUnit({ hasAttacked: true }))).toBe(false);
    expect(canAttack(mkUnit({ hasHealed: true }))).toBe(false);
  });

  it('canAttack: shield cannot attack after moving, other units can', () => {
    expect(canAttack(makeShield())).toBe(true);
    expect(canAttack(makeShield({ hasMoved: true }))).toBe(false);
    expect(canAttack(makeShield({ hasAttacked: true }))).toBe(false);
    expect(canAttack(mkUnit({ hasMoved: true }))).toBe(true);
  });

  it('canAttack: catapult cannot attack after moving', () => {
    expect(canAttack(makeCatapult())).toBe(true);
    expect(canAttack(makeCatapult({ hasMoved: true }))).toBe(false);
    expect(canAttack(makeCatapult({ hasAttacked: true }))).toBe(false);
  });

  it('canAttack: a ship may always attack after moving, even a shield/catapult ship', () => {
    expect(canAttack(mkUnit({ shipLevel: 1, hasMoved: true }))).toBe(true);
    expect(canAttack(makeShield({ shipLevel: 1, hasMoved: true }))).toBe(true);
    expect(canAttack(makeCatapult({ shipLevel: 1, hasMoved: true }))).toBe(true);
    expect(canAttack(makeShield({ shipLevel: 1, hasMoved: true, hasAttacked: true }))).toBe(false);
    expect(canAttack(makeShield({ shipLevel: 1, hasHealed: true }))).toBe(false);
  });

  it('canMove: a ship never moves after attacking, even a rider ship', () => {
    expect(canMove(mkUnit({ shipLevel: 1 }))).toBe(true);
    expect(canMove(mkUnit({ shipLevel: 1, hasAttacked: true }))).toBe(false);
    expect(canMove(mkUnit({ type: 'rider', shipLevel: 1, hasAttacked: true }))).toBe(false);
    expect(canMove(mkUnit({ shipLevel: 1, hasMoved: true }))).toBe(false);
    expect(canMove(mkUnit({ type: 'rider', hasAttacked: true }))).toBe(true);
  });

  it('canHeal: only as a first action and when damaged', () => {
    expect(canHeal(mkUnit({ hp: 30 }))).toBe(true);
    expect(canHeal(mkUnit())).toBe(false);
    expect(canHeal(mkUnit({ hp: 30, hasMoved: true }))).toBe(false);
    expect(canHeal(mkUnit({ hp: 30, hasAttacked: true }))).toBe(false);
  });

  it('healUnit adds HEAL_AMOUNT hp capped at maxHp and marks hasHealed', () => {
    const unit = mkUnit({ hp: 40 });
    healUnit(unit);
    expect(unit.hp).toBe(50);
    expect(unit.hasHealed).toBe(true);
    expect(HEAL_AMOUNT).toBe(20);
    const full = mkUnit();
    healUnit(full);
    expect(full.hp).toBe(50);
  });
});

describe('makeUnit', () => {
  it('creates a fresh unit with stats derived from UNIT_TYPES', () => {
    const u = makeUnit(2, 'archer', 3, 4, { id: 'a1' });
    expect(u.id).toBe('a1');
    expect(u.owner).toBe(2);
    expect(u.type).toBe('archer');
    expect(u.q).toBe(3);
    expect(u.r).toBe(4);
    expect(u.hasMoved).toBe(false);
    expect(u.hasAttacked).toBe(false);
    expect(u.hasHealed).toBe(false);
    expect(u.hp).toBe(UNIT_TYPES.archer.maxHp);
    expect(u.attack).toBe(UNIT_TYPES.archer.attack);
    expect(u.attackDistance).toBe(UNIT_TYPES.archer.attackDistance);
    expect(u.spawnVillage).toBeNull();
  });

  it('applies opt overrides', () => {
    const u = makeUnit(0, 'warrior', 0, 0, {
      id: 'w1',
      hasMoved: true,
      hasAttacked: true,
      hasHealed: true,
      hp: 2,
      spawnVillage: { q: 1, r: 1 },
    });
    expect(u.hasMoved).toBe(true);
    expect(u.hasAttacked).toBe(true);
    expect(u.hasHealed).toBe(true);
    expect(u.hp).toBe(2);
    expect(u.spawnVillage).toEqual({ q: 1, r: 1 });
  });

  it('defaults id from type and position when omitted', () => {
    const u = makeUnit(0, 'rider', 5, -2);
    expect(u.id).toBe('rider-5,-2');
  });
});

describe('moveRange road bonus', () => {
  function roadTile(owner: number | null): MapTile {
    return {
      q: 0, r: 0, terrain: TileType.GrasslandLand, height: 0.1,
      settlement: null, building: null, roadOwner: owner,
      unit: null, ownedBy: owner, claimedByVillage: null, exploredBy: [],
    };
  }

  it('moveRange adds +1 on the unit own road tile only', () => {
    expect(moveRange(mkUnit(), roadTile(null))).toBe(1);
    expect(moveRange(mkUnit(), roadTile(1))).toBe(1);
    expect(moveRange(mkUnit(), roadTile(0))).toBe(2);
    expect(moveRange(mkUnit({ type: 'rider' }), roadTile(0))).toBe(5);
    expect(moveRange(mkUnit({ type: 'rider', hasAttacked: true }), roadTile(0))).toBe(5);
    expect(moveRange(mkUnit())).toBe(1);
  });

  it('moveRange adds +1 on the unit own village connected to a road', () => {
    const village: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandLand, height: 0.1,
      settlement: { owner: 0, level: 1, captureReady: false },
      building: null, roadOwner: null,
      unit: null, ownedBy: 0, claimedByVillage: { q: 0, r: 0 }, exploredBy: [],
    };
    const emptyNeighbor: MapTile = {
      q: 1, r: 0, terrain: TileType.GrasslandLand, height: 0.1,
      settlement: null, building: null, roadOwner: null,
      unit: null, ownedBy: 0, claimedByVillage: null, exploredBy: [],
    };
    const road: MapTile = { ...emptyNeighbor, roadOwner: 0 };
    const enemyRoad: MapTile = { ...emptyNeighbor, roadOwner: 1 };
    const map: GameMap = { radius: 2, tiles: [village, road], spawns: [] };
    // No road connected yet: no bonus.
    expect(moveRange(mkUnit(), village, { ...map, tiles: [village, emptyNeighbor] })).toBe(1);
    // Road of another player adjacent: no bonus.
    expect(moveRange(mkUnit(), village, { ...map, tiles: [village, enemyRoad] })).toBe(1);
    // Own road adjacent: +1 bonus.
    expect(moveRange(mkUnit(), village, map)).toBe(2);
    expect(moveRange(mkUnit({ type: 'rider' }), village, map)).toBe(5);
  });
});
