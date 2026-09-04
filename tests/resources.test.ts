import { describe, it, expect } from 'vitest';
import {
  canAfford,
  pay,
  START_RESOURCES,
  UPGRADE_COST,
  villageUpgradeCost,
} from '../src/game/resources';

describe('resources', () => {
  it('starts with 3 wood, 2 stone, 5 money, 0 ore', () => {
    expect(START_RESOURCES).toEqual({ wood: 3, stone: 2, money: 5, ore: 0 });
  });

  it('upgrade cost is 2 wood, 1 stone, 2 money, 0 ore', () => {
    expect(UPGRADE_COST).toEqual({ wood: 2, stone: 1, money: 2, ore: 0 });
  });

  it('village upgrade cost scales with the current level', () => {
    expect(villageUpgradeCost(1)).toEqual({ wood: 2, stone: 1, money: 2, ore: 0 });
    expect(villageUpgradeCost(2)).toEqual({ wood: 4, stone: 2, money: 4, ore: 0 });
    expect(villageUpgradeCost(3)).toEqual({ wood: 6, stone: 3, money: 6, ore: 0 });
    expect(villageUpgradeCost(4)).toEqual({ wood: 8, stone: 4, money: 8, ore: 0 });
  });

  it('canAfford checks every resource', () => {
    expect(canAfford({ wood: 2, stone: 1, money: 2, ore: 0 }, UPGRADE_COST)).toBe(true);
    expect(canAfford({ wood: 1, stone: 1, money: 2, ore: 0 }, UPGRADE_COST)).toBe(false);
    expect(canAfford({ wood: 2, stone: 0, money: 2, ore: 0 }, UPGRADE_COST)).toBe(false);
    expect(canAfford({ wood: 2, stone: 1, money: 1, ore: 0 }, UPGRADE_COST)).toBe(false);
    expect(canAfford({ wood: 0, stone: 0, money: 5, ore: 0 }, { wood: 0, stone: 0, money: 0, ore: 1 })).toBe(false);
  });

  it('pay subtracts the cost', () => {
    expect(pay(START_RESOURCES, UPGRADE_COST)).toEqual({ wood: 1, stone: 1, money: 3, ore: 0 });
  });
});
