import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import { UNIT_TYPES, UNIT_IMAGE_FILES, UNIT_MOVE_POINTS, UNIT_ATTACK, UNIT_ATTACK_DISTANCE, UNIT_TYPE_NAMES, canAttack, canHeal, PIRATE_HP, canMove, healUnit, movePoints, makeUnit, HEAL_AMOUNT, unitMaintenance } from '../src/game/units';
import { UnitType } from '@enums';

describe('UNIT_TYPES', () => {
  it('defines warrior, rider, archer, swordsman', () => {
    expect(UNIT_TYPES.warrior).toEqual({ movePoints: 10, attack: 20, attackDistance: 1, maxHp: 50, defense: 10, price: 4, priceWood: 0, priceOre: 0 });
    expect(UNIT_TYPES.rider).toEqual({ movePoints: 40, attack: 22, attackDistance: 1, maxHp: 45, defense: 8, price: 6, priceWood: 0, priceOre: 0 });
    expect(UNIT_TYPES.archer).toEqual({ movePoints: 10, attack: 26, attackDistance: 2, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0 });
    expect(UNIT_TYPES.swordsman).toEqual({ movePoints: 10, attack: 40, attackDistance: 1, maxHp: 80, defense: 16, price: 10, priceWood: 0, priceOre: 2 });
  });

  it('defines the shield unit with 80 hp, 10 move points and a 8 money + 2 ore price', () => {
    expect(UNIT_TYPES.shield).toEqual({ movePoints: 10, attack: 7, attackDistance: 1, maxHp: 80, defense: 20, price: 8, priceWood: 0, priceOre: 2 });
  });

  it('defines the catapult unit with siege stats and a wood cost', () => {
    expect(UNIT_TYPES.catapult).toEqual({ movePoints: 10, attack: 50, attackDistance: 4, maxHp: 30, defense: 0, price: 15, priceWood: 10, priceOre: 3 });
    expect(UNIT_MOVE_POINTS.catapult).toBe(10);
    expect(UNIT_ATTACK.catapult).toBe(50);
    expect(UNIT_ATTACK_DISTANCE.catapult).toBe(4);
    expect(UNIT_TYPE_NAMES.catapult).toBe('Catapult');
  });

  it('defines the knight unit with 30 move points, 40 attack and an ore cost', () => {
    expect(UNIT_TYPES.knight).toEqual({ movePoints: 30, attack: 40, attackDistance: 1, maxHp: 70, defense: 12, price: 14, priceWood: 0, priceOre: 5 });
    expect(UNIT_MOVE_POINTS.knight).toBe(30);
    expect(UNIT_ATTACK.knight).toBe(40);
    expect(UNIT_ATTACK_DISTANCE.knight).toBe(1);
    expect(UNIT_TYPE_NAMES.knight).toBe('Knight');
  });

  it('gives pirates 80 hp and 5 defense', () => {
    expect(PIRATE_HP).toBe(80);
    expect(UNIT_TYPES.pirate).toEqual({ movePoints: 50, attack: 15, attackDistance: 3, maxHp: 80, defense: 5, price: 0, priceWood: 0, priceOre: 0 });
    const pirate = makeUnit(-1, UnitType.PIRATE, 0, 0);
    expect(pirate.hp).toBe(80);
    expect(pirate.defense).toBe(5);
  });
});

describe('UNIT_IMAGE_FILES', () => {
  it('maps every tribe and unit type to its texture file', () => {
    const warrior = (prefix: string) => ({ warrior: `${prefix}-warrior.png`, rider: `${prefix}-rider.png`, archer: `${prefix}-archer.png`, swordsman: `${prefix}-swordsman.png`, shield: `${prefix}-shield.png`, catapult: `${prefix}-catapult.png`, knight: `${prefix}-knight.png` });
    const sp = (prefix: string, special: Record<string, string>) => ({ ...warrior(prefix), ...special });
    expect(UNIT_IMAGE_FILES).toEqual({
      [Tribe.Cats]: sp('cats', { stalker: 'cats-stalker.png', builder: 'cats-warrior.png', banner: 'cats-warrior.png', berserker: 'cats-warrior.png', trapper: 'cats-warrior.png', stormcaller: 'cats-warrior.png', stunner: 'cats-warrior.png' }),
      [Tribe.Warriors]: sp('warriors', { stalker: 'warriors-warrior.png', builder: 'warriors-warrior.png', banner: 'warriors-banner-bearer.png', berserker: 'warriors-warrior.png', trapper: 'warriors-warrior.png', stormcaller: 'warriors-warrior.png', stunner: 'warriors-warrior.png' }),
      [Tribe.Villagers]: sp('villagers', { stalker: 'villagers-warrior.png', builder: 'villagers-builder.png', banner: 'villagers-warrior.png', berserker: 'villagers-warrior.png', trapper: 'villagers-warrior.png', stormcaller: 'villagers-warrior.png', stunner: 'villagers-warrior.png' }),
      [Tribe.Barbarians]: sp('barbarians', { stalker: 'barbarians-warrior.png', builder: 'barbarians-warrior.png', banner: 'barbarians-warrior.png', berserker: 'barbarians-berserker.png', trapper: 'barbarians-warrior.png', stormcaller: 'barbarians-warrior.png', stunner: 'barbarians-warrior.png' }),
      [Tribe.Forest]: sp('forest', { stalker: 'forest-warrior.png', builder: 'forest-warrior.png', banner: 'forest-warrior.png', berserker: 'forest-warrior.png', trapper: 'forest-trapper.png', stormcaller: 'forest-warrior.png', stunner: 'forest-warrior.png' }),
      [Tribe.Aqua]: sp('aqua', { stalker: 'aqua-warrior.png', builder: 'aqua-warrior.png', banner: 'aqua-warrior.png', berserker: 'aqua-warrior.png', trapper: 'aqua-warrior.png', stormcaller: 'aqua-stormcaller.png', stunner: 'aqua-warrior.png' }),
      [Tribe.Sand]: sp('sand', { stalker: 'sand-warrior.png', builder: 'sand-warrior.png', banner: 'sand-warrior.png', berserker: 'sand-warrior.png', trapper: 'sand-warrior.png', stormcaller: 'sand-warrior.png', stunner: 'sand-stunner.png' }),
    });
  });
});

function mkUnit(overrides: Partial<import('../src/game/units').Unit> = {}): import('../src/game/units').Unit {
  return {
    id: 'u',
    owner: 0,
    type: UnitType.WARRIOR,
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
    type: UnitType.SHIELD,
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
    type: UnitType.CATAPULT,
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
    expect(canMove(mkUnit({ type: UnitType.RIDER, hasAttacked: true }))).toBe(true);
    expect(movePoints(mkUnit({ type: UnitType.RIDER, hasAttacked: true }))).toBe(40);
    expect(movePoints(mkUnit())).toBe(10);
    expect(movePoints(mkUnit({ type: UnitType.RIDER }))).toBe(40);
    expect(movePoints(mkUnit({ type: UnitType.KNIGHT }))).toBe(30);
    expect(movePoints(mkUnit({ type: UnitType.PIRATE }))).toBe(50);
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
    expect(canMove(mkUnit({ type: UnitType.RIDER, shipLevel: 1, hasAttacked: true }))).toBe(false);
    expect(canMove(mkUnit({ shipLevel: 1, hasMoved: true }))).toBe(false);
    expect(canMove(mkUnit({ type: UnitType.RIDER, hasAttacked: true }))).toBe(true);
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
    const rider = mkUnit({ type: UnitType.RIDER, hasAttacked: true, stunTurns: 1 });
    expect(canMove(rider)).toBe(false);
    const shieldShip = makeShield({ shipLevel: 1, hasMoved: true, stunTurns: 1 });
    expect(canAttack(shieldShip)).toBe(false);
  });
});

describe('makeUnit', () => {
  it('creates a fresh unit with stats derived from UNIT_TYPES', () => {
    const u = makeUnit(2, UnitType.ARCHER, 3, 4, { id: 'a1' });
    expect(u.id).toBe('a1');
    expect(u.owner).toBe(2);
    expect(u.type).toBe(UnitType.ARCHER);
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
    const u = makeUnit(0, UnitType.WARRIOR, 0, 0, {
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
    const u = makeUnit(0, UnitType.RIDER, 5, -2);
    expect(u.id).toBe('rider-5,-2');
  });
});

describe('unitMaintenance', () => {
  it('maps every land unit type to its upkeep', () => {
    const costs: [UnitType, number][] = [
      [UnitType.WARRIOR, 1],
      [UnitType.ARCHER, 2],
      [UnitType.SWORDSMAN, 3],
      [UnitType.RIDER, 2],
      [UnitType.KNIGHT, 4],
      [UnitType.CATAPULT, 5],
      [UnitType.SHIELD, 2],
      [UnitType.PIRATE, 0],
    ];
    for (const [type, cost] of costs) {
      expect(unitMaintenance(makeUnit(0, type, 0, 0, {}))).toBe(cost);
    }
  });

  it('charges ships by their level regardless of the land type', () => {
    expect(unitMaintenance(makeUnit(0, UnitType.WARRIOR, 0, 0, { shipLevel: 1 }))).toBe(2);
    expect(unitMaintenance(makeUnit(0, UnitType.CATAPULT, 0, 0, { shipLevel: 2 }))).toBe(3);
    expect(unitMaintenance(makeUnit(0, UnitType.WARRIOR, 0, 0, { shipLevel: 3 }))).toBe(4);
  });
});

describe('special units', () => {
  const cases: Array<[UnitType, number, number, number, number, number, number, number, number]> = [
    [UnitType.STALKER, 20, 10, 1, 20, 0, 9, 0, 2],
    [UnitType.BUILDER, 8, 10, 1, 40, 0, 15, 0, 0],
    [UnitType.BANNER, 8, 10, 1, 30, 0, 7, 0, 2],
    [UnitType.BERSERKER, 10, 26, 1, 50, 8, 10, 0, 2],
    [UnitType.TRAPPER, 10, 20, 1, 44, 8, 6, 0, 2],
    [UnitType.STORMCALLER, 20, 20, 1, 44, 8, 6, 0, 2],
    [UnitType.STUNNER, 8, 20, 2, 40, 10, 7, 0, 2],
  ];
  for (const [type, move, atk, range, hp, def, price, wood, ore] of cases) {
    it(`defines the ${type} unit`, () => {
      expect(UNIT_TYPES[type]).toEqual({ movePoints: move, attack: atk, attackDistance: range, maxHp: hp, defense: def, price, priceWood: wood, priceOre: ore });
      expect(UNIT_TYPE_NAMES[type]).toBeTruthy();
      expect(unitMaintenance(makeUnit(0, type, 0, 0))).toBeGreaterThanOrEqual(2);
    });
  }
});
