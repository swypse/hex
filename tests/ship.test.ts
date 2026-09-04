import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit } from '../src/game/units';
import { MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import {
  canUpgradeShip,
  gainShipAbility,
  isShip,
  revertShip,
  SHIP_ATTACK,
  SHIP_ATTACK_DISTANCE,
  SHIP_MOVEMENT,
  SHIP_UPGRADE_COST,
  shipAttack,
  shipAttackDistance,
  shipMovement,
  upgradeShip,
} from '../src/game/ship';

function unit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 50, attack: 20, attackDistance: 1, spawnVillage: null,
    ...overrides,
  };
}

function player(money: number, wood: number, ore = 0): Player {
  return {
    index: 0, tribe: Tribe.Villagers, isHuman: true, name: 'p',
    resources: { wood, stone: 0, money, ore },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

function tile(ownedBy: number | null): MapTile {
  return {
    q: 0, r: 0, terrain: TileType.Water, settlement: null, building: null,
    unit: null, ownedBy, claimedByVillage: null,
  };
}

describe('ship', () => {
  it('has the specified stats per level', () => {
    expect(SHIP_MOVEMENT).toEqual({ 1: 2, 2: 3, 3: 4 });
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

  it('shipMovement returns the ship range', () => {
    expect(shipMovement(unit({ shipLevel: 1 }))).toBe(2);
    expect(shipMovement(unit({ shipLevel: 3 }))).toBe(4);
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
    expect(canUpgradeShip(unit(), tile(0), player(100, 10))).toBe(false);
    expect(canUpgradeShip(unit({ shipLevel: 3 }), tile(0), player(100, 10))).toBe(false);
    expect(canUpgradeShip(unit({ shipLevel: 1 }), tile(1), player(100, 10))).toBe(false);
    expect(canUpgradeShip(unit({ shipLevel: 1 }), tile(0), player(7, 4))).toBe(false);
    expect(canUpgradeShip(unit({ shipLevel: 1 }), tile(0), player(8, 4))).toBe(true);
    expect(canUpgradeShip(unit({ shipLevel: 2 }), tile(0), player(16, 8, 1))).toBe(false);
    expect(canUpgradeShip(unit({ shipLevel: 2 }), tile(0), player(16, 8, 2))).toBe(true);
  });

  it('upgradeShip pays and levels up without blocking actions', () => {
    const u = unit({ shipLevel: 1, hasMoved: false, hasAttacked: false });
    const p = player(10, 5);
    expect(upgradeShip(u, tile(0), p)).toBe(true);
    expect(u.shipLevel).toBe(2);
    expect(p.resources.money).toBe(2);
    expect(p.resources.wood).toBe(1);
    expect(u.hasMoved).toBe(false);
    expect(u.hasAttacked).toBe(false);
  });

  it('upgradeShip pays ore for level 3', () => {
    const u = unit({ shipLevel: 2 });
    const p = player(20, 10, 2);
    expect(upgradeShip(u, tile(0), p)).toBe(true);
    expect(u.shipLevel).toBe(3);
    expect(p.resources.money).toBe(4);
    expect(p.resources.wood).toBe(2);
    expect(p.resources.ore).toBe(0);
  });
});
