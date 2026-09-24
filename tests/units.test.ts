import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import {
  UNIT_TYPES,
  UNIT_IMAGE_FILES,
  UNIT_MOVE_POINTS,
  UNIT_ATTACK,
  UNIT_ATTACK_DISTANCE,
  UNIT_TYPE_NAMES,
  UnitType,
  canAttack,
  canHeal,
  PIRATE_HP,
  canMove,
  healUnit,
  movePoints,
  makeUnit,
  HEAL_AMOUNT,
  unitMaintenance,
} from '../src/game/units';

describe('UNIT_TYPES', () => {
  it('defines warrior, rider, archer, swordsman', () => {
    expect(UNIT_TYPES.warrior).toEqual({ movePoints: 10, attack: 20, attackDistance: 1, maxHp: 50, defense: 10, price: 4, priceWood: 0, priceOre: 0, shape: 'circle' });
    expect(UNIT_TYPES.rider).toEqual({ movePoints: 40, attack: 22, attackDistance: 1, maxHp: 45, defense: 8, price: 6, priceWood: 0, priceOre: 0, shape: 'square' });
    expect(UNIT_TYPES.archer).toEqual({ movePoints: 10, attack: 26, attackDistance: 2, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0, shape: 'triangle' });
    expect(UNIT_TYPES.swordsman).toEqual({ movePoints: 10, attack: 40, attackDistance: 1, maxHp: 80, defense: 16, price: 10, priceWood: 0, priceOre: 2, shape: 'swordsman' });
  });

  it('defines the shield unit with 80 hp, 10 move points and a 8 money + 2 ore price', () => {
    expect(UNIT_TYPES.shield).toEqual({ movePoints: 10, attack: 7, attackDistance: 1, maxHp: 80, defense: 20, price: 8, priceWood: 0, priceOre: 2, shape: 'square' });
  });

  it('defines the catapult unit with siege stats and a wood cost', () => {
    expect(UNIT_TYPES.catapult).toEqual({ movePoints: 10, attack: 50, attackDistance: 4, maxHp: 30, defense: 0, price: 15, priceWood: 10, priceOre: 3, shape: 'square' });
    expect(UNIT_MOVE_POINTS.catapult).toBe(10);
    expect(UNIT_ATTACK.catapult).toBe(50);
    expect(UNIT_ATTACK_DISTANCE.catapult).toBe(4);
    expect(UNIT_TYPE_NAMES.catapult).toBe('Catapult');
  });

  it('defines the knight unit with 30 move points, 4.6 attack and an ore cost', () => {
    expect(UNIT_TYPES.knight).toEqual({ movePoints: 30, attack: 46, attackDistance: 1, maxHp: 70, defense: 12, price: 14, priceWood: 0, priceOre: 5, shape: 'swordsman' });
    expect(UNIT_MOVE_POINTS.knight).toBe(30);
    expect(UNIT_ATTACK.knight).toBe(46);
    expect(UNIT_ATTACK_DISTANCE.knight).toBe(1);
    expect(UNIT_TYPE_NAMES.knight).toBe('Knight');
  });

  it('gives pirates 80 hp and 5 defense', () => {
    expect(PIRATE_HP).toBe(80);
    expect(UNIT_TYPES.pirate).toEqual({ movePoints: 50, attack: 15, attackDistance: 3, maxHp: 80, defense: 5, price: 0, priceWood: 0, priceOre: 0, shape: 'square' });
    const pirate = makeUnit(-1, 'pirate', 0, 0);
    expect(pirate.hp).toBe(80);
    expect(pirate.defense).toBe(5);
  });
});

describe('UNIT_IMAGE_FILES', () => {
  it('maps every tribe and unit type to its texture file', () => {
    const sp = ':', t = (prefix: string) => ({
      warrior: `${prefix}-warrior.png`, rider: `${prefix}-rider.png`, archer: `${prefix}-archer.png`, swordsman: `${prefix}-swordsman.png`, shield: `${prefix}-shield.png`, catapult: `${prefix}-catapult.png`, knight: `${prefix}-knight.png`,
      stalker: `${prefix}-warrior.png`, builder: `${prefix}-warrior.png`, banner: `${prefix}-warrior.png`, berserker: `${prefix}-warrior.png`, trapper: `${prefix}-warrior.png`, stormcaller: `${prefix}-warrior.png`, stunner: `${prefix}-warrior.png`,
    });
    void sp;
    expect(UNIT_IMAGE_FILES).toEqual({
      [Tribe.Cats]: t('cats'),
      [Tribe.Warriors]: t('warriors'),
      [Tribe.Villagers]: t('villagers'),
      [Tribe.Barbarians]: t('barbarians'),
      [Tribe.Forest]: t('forest'),
      [Tribe.Aqua]: t('aqua'),
      [Tribe.Sand]: t('sand'),
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
    defense: 0,
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
    attack: 7,
    attackDistance: 1,
    defense: 20,
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
    defense: 0,
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
    expect(movePoints(mkUnit({ type: 'rider', hasAttacked: true }))).toBe(40);
    expect(movePoints(mkUnit())).toBe(10);
    expect(movePoints(mkUnit({ type: 'rider' }))).toBe(40);
    expect(movePoints(mkUnit({ type: 'knight' }))).toBe(30);
    expect(movePoints(mkUnit({ type: 'pirate' }))).toBe(50);
    expect(movePoints(mkUnit({ shipLevel: 1 }))).toBe(20);
    expect(movePoints(mkUnit({ shipLevel: 2 }))).toBe(30);
    expect(movePoints(mkUnit({ shipLevel: 3 }))).toBe(40);
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
    expect(HEAL_AMOUNT).toBe(15);
    const full = mkUnit();
    healUnit(full);
    expect(full.hp).toBe(50);
  });

  it('a stunned unit cannot move, attack or heal', () => {
    const u = mkUnit({ hp: 30, stunTurns: 1 });
    expect(canMove(u)).toBe(false);
    expect(canAttack(u)).toBe(false);
    expect(canHeal(u)).toBe(false);
    const rider = mkUnit({ type: 'rider', hasAttacked: true, stunTurns: 1 });
    expect(canMove(rider)).toBe(false);
    const shieldShip = makeShield({ shipLevel: 1, hasMoved: true, stunTurns: 1 });
    expect(canAttack(shieldShip)).toBe(false);
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

describe('unitMaintenance', () => {
  it('maps every land unit type to its upkeep', () => {
    const costs: [UnitType, number][] = [
      ['warrior', 1],
      ['archer', 2],
      ['swordsman', 3],
      ['rider', 2],
      ['knight', 4],
      ['catapult', 5],
      ['shield', 2],
      ['pirate', 0],
    ];
    for (const [type, cost] of costs) {
      expect(unitMaintenance(makeUnit(0, type, 0, 0, {}))).toBe(cost);
    }
  });

  it('charges ships by their level regardless of the land type', () => {
    expect(unitMaintenance(makeUnit(0, 'warrior', 0, 0, { shipLevel: 1 }))).toBe(2);
    expect(unitMaintenance(makeUnit(0, 'catapult', 0, 0, { shipLevel: 2 }))).toBe(3);
    expect(unitMaintenance(makeUnit(0, 'warrior', 0, 0, { shipLevel: 3 }))).toBe(4);
  });
});

describe('special units', () => {
  const cases: Array<[UnitType, number, number, number, number, number, number, number, number]> = [
    ['stalker', 12, 30, 1, 60, 0, 9, 2, 0],
    ['builder', 8, 10, 1, 50, 0, 7, 0, 0],
    ['banner', 8, 20, 1, 60, 8, 10, 0, 0],
    ['berserker', 10, 50, 1, 70, 12, 11, 0, 3],
    ['trapper', 10, 20, 1, 50, 8, 9, 2, 0],
    ['stormcaller', 20, 20, 1, 50, 8, 9, 0, 2],
    ['stunner', 8, 40, 2, 40, 10, 7, 0, 0],
  ];
  for (const [type, move, atk, range, hp, def, price, wood, ore] of cases) {
    it(`defines the ${type} unit`, () => {
      expect(UNIT_TYPES[type]).toEqual({ movePoints: move, attack: atk, attackDistance: range, maxHp: hp, defense: def, price, priceWood: wood, priceOre: ore, shape: 'circle' });
      expect(UNIT_TYPE_NAMES[type]).toBeTruthy();
      expect(unitMaintenance(makeUnit(0, type, 0, 0))).toBeGreaterThanOrEqual(2);
    });
  }
});
