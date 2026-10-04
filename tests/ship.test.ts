import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit } from '../src/game/units';
import { makeUnit } from '../src/game/units';
import { GameMap, MapTile } from '../src/game/map-gen';
import { migrateLegacyResources, totalStock } from '../src/game/stock';
import { TileType } from '../src/game/tile-types';
import {
  canUpgradeShip,
  gainShipAbility,
  isShip,
  revertShip,
  SHIP_ATTACK,
  SHIP_ATTACK_DISTANCE,
  SHIP_MOVE_POINTS,
  SHIP_UPGRADE_COST,
  shipAttack,
  shipAttackDistance,
  shipMovePoints,
  upgradeShip,
} from '../src/game/ship';
import { UnitType } from '@enums';

function unit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u', owner: 0, type: UnitType.WARRIOR, q: 0, r: 0,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 50, attack: 20, attackDistance: 1, spawnVillage: null,
    ...overrides,
  };
}

function player(money: number, wood: number, ore = 0): Player {
  return {
    index: 0, tribe: Tribe.Villagers, isHuman: true, name: 'p',
    resources: { wood, stone: 0, money, ore, food: 20 },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

function tile(ownedBy: number | null): MapTile {
  return {
    q: 0, r: 0, terrain: TileType.Water, settlement: null, building: null,
    unit: null, ownedBy, claimedByVillage: null,
  };
}

/** A map holding `t` and a village of the player that holds the player's
 *  (legacy-literal) materials. */
function mapFor(p: Player, t: MapTile): GameMap {
  const village: MapTile = {
    q: 5, r: 5, terrain: TileType.GrasslandLand, settlement: { owner: p.index, level: 1, captureReady: false, capital: true },
    building: null, unit: null, ownedBy: p.index, claimedByVillage: null,
  };
  const map: GameMap = { radius: 6, tiles: [t, village], spawns: [] };
  migrateLegacyResources(map, [p]);
  return map;
}

/** `canUpgradeShip` for a ship on a cell owned by `ownedBy`. */
function canUpgrade(u: Unit, ownedBy: number | null, p: Player): boolean {
  const t = tile(ownedBy);
  return canUpgradeShip(mapFor(p, t), u, t, p);
}

describe('ship', () => {
  it('has the specified stats per level', () => {
    expect(SHIP_MOVE_POINTS).toEqual({ 1: 20, 2: 30, 3: 40 });
    expect(SHIP_ATTACK).toEqual({ 1: 10, 2: 20, 3: 30 });
    expect(SHIP_ATTACK_DISTANCE).toEqual({ 1: 2, 2: 2, 3: 3 });
    expect(SHIP_UPGRADE_COST).toEqual({
      2: { money: 8, wood: 4, ore: 0 },
      3: { money: 16, wood: 8, ore: 2 },
    });
  });

  it('gainShipAbility and revertShip toggle the flag', () => {
    const u = unit();
    expect(isShip(u)).toBe(false);
    gainShipAbility(u);
    expect(u.shipLevel).toBe(1);
    expect(isShip(u)).toBe(true);
    revertShip(u);
    expect(u.shipLevel).toBeUndefined();
    expect(isShip(u)).toBe(false);
  });

  it('shipMovePoints returns the ship move points', () => {
    expect(shipMovePoints(unit({ shipLevel: 1 }))).toBe(20);
    expect(shipMovePoints(unit({ shipLevel: 3 }))).toBe(40);
  });

  it('shipAttack uses fixed values per level', () => {
    expect(shipAttack(unit({ attack: 20, shipLevel: 1 }))).toBe(10);
    expect(shipAttack(unit({ attack: 20, shipLevel: 2 }))).toBe(20);
    expect(shipAttack(unit({ attack: 20, shipLevel: 3 }))).toBe(30);
    expect(shipAttack(unit({ attack: 20 }))).toBe(20);
  });

  it('shipAttackDistance uses fixed values per level', () => {
    expect(shipAttackDistance(unit({ attackDistance: 1, shipLevel: 1 }))).toBe(2);
    expect(shipAttackDistance(unit({ attackDistance: 1, shipLevel: 2 }))).toBe(2);
    expect(shipAttackDistance(unit({ attackDistance: 1, shipLevel: 3 }))).toBe(3);
    expect(shipAttackDistance(unit({ attackDistance: 1 }))).toBe(1);
  });

  it('canUpgradeShip requires a ship below level 3, on an owned cell, with the cost', () => {
    expect(canUpgrade(unit(), 0, player(100, 10))).toBe(false);
    expect(canUpgrade(unit({ shipLevel: 3 }), 0, player(100, 10))).toBe(false);
    expect(canUpgrade(unit({ shipLevel: 1 }), 1, player(100, 10))).toBe(false);
    expect(canUpgrade(unit({ shipLevel: 1 }), 0, player(7, 4))).toBe(false);
    expect(canUpgrade(unit({ shipLevel: 1 }), 0, player(8, 4))).toBe(true);
    expect(canUpgrade(unit({ shipLevel: 2 }), 0, player(16, 8, 1))).toBe(false);
    expect(canUpgrade(unit({ shipLevel: 2 }), 0, player(16, 8, 2))).toBe(true);
  });

  it('upgradeShip pays and levels up without blocking actions', () => {
    const u = unit({ shipLevel: 1, hasMoved: false, hasAttacked: false });
    const p = player(10, 5);
    const t = tile(0);
    const map = mapFor(p, t);
    expect(upgradeShip(map, u, t, p)).toBe(true);
    expect(u.shipLevel).toBe(2);
    expect(p.resources.money).toBe(2);
    expect(totalStock(map, 0).wood).toBe(1);
    expect(u.hasMoved).toBe(false);
    expect(u.hasAttacked).toBe(false);
  });

  it('upgradeShip pays ore for level 3', () => {
    const u = unit({ shipLevel: 2 });
    const p = player(20, 10, 2);
    const t = tile(0);
    const map = mapFor(p, t);
    expect(upgradeShip(map, u, t, p)).toBe(true);
    expect(u.shipLevel).toBe(3);
    expect(p.resources.money).toBe(4);
    expect(totalStock(map, 0).wood).toBe(2);
    expect(totalStock(map, 0).ore).toBe(0);
  });

  it('keeps the crew defense when a unit becomes a ship', () => {
    const u = makeUnit(0, UnitType.SWORDSMAN, 0, 0);
    expect(u.defense).toBe(16);
    gainShipAbility(u);
    expect(u.shipLevel).toBe(1);
    expect(u.defense).toBe(16);

    const shield = makeUnit(0, UnitType.SHIELD, 0, 0);
    gainShipAbility(shield);
    expect(shield.defense).toBe(20);
  });
});
