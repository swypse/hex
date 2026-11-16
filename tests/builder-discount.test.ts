import { describe, expect, it } from 'vitest';
import { BUILDER_DISCOUNT, builderPrice } from '../src/game/economy/builder-discount';
import { BUILDING_COSTS } from '../src/game/economy/buildings';
import { ROAD_COST } from '../src/game/economy/roads';

describe('builderPrice', () => {
  it('cuts every resource by the builder discount', () => {
    expect(BUILDER_DISCOUNT).toBe(0.2);
    expect(builderPrice(ROAD_COST)).toEqual({ wood: 4, stone: 2, money: 8, ore: 0, food: 0 });
    const mine = BUILDING_COSTS.mine;
    expect(builderPrice(mine).money).toBe(Math.round(mine.money * 0.8));
  });
});
