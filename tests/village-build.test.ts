import { describe, it, expect } from 'vitest';
import {
  VILLAGE_BUILD_COLUMN_COUNTS,
  isVillageTallColumn,
  villageColumnBlocks,
  villageColumnMiddleCount,
} from '../src/game/village-build';

describe('village column block counts', () => {
  it('defines 8 columns: left 3, right 2, left-back 2, right-back 1', () => {
    expect(VILLAGE_BUILD_COLUMN_COUNTS).toEqual({ l: 3, r: 2, lBack: 2, rBack: 1 });
  });

  it('marks tall columns: left 2-3, right 1-2; left1 + backs stay short', () => {
    expect(isVillageTallColumn('l', 0)).toBe(false);
    expect(isVillageTallColumn('l', 1)).toBe(true);
    expect(isVillageTallColumn('l', 2)).toBe(true);
    expect(isVillageTallColumn('r', 0)).toBe(true);
    expect(isVillageTallColumn('r', 1)).toBe(true);
    expect(isVillageTallColumn('lBack', 0)).toBe(false);
    expect(isVillageTallColumn('lBack', 1)).toBe(false);
    expect(isVillageTallColumn('rBack', 0)).toBe(false);
  });

  it('counts blocks per level: on 1 village level each column has 1 block', () => {
    for (const side of ['l', 'r', 'lBack', 'rBack'] as const) {
      for (let col = 0; col < VILLAGE_BUILD_COLUMN_COUNTS[side]; col++) {
        expect(villageColumnBlocks(side, col, 1)).toBe(1);
      }
    }
  });

  it('level 2: tall columns get a 2nd block, short stay at 1', () => {
    expect(villageColumnBlocks('l', 0, 2)).toBe(1);
    expect(villageColumnBlocks('l', 1, 2)).toBe(2);
    expect(villageColumnBlocks('r', 0, 2)).toBe(2);
    expect(villageColumnBlocks('lBack', 0, 2)).toBe(1);
  });

  it('level 3: every column has 2 blocks; level 4: tall only get a 3rd', () => {
    expect(villageColumnBlocks('l', 0, 3)).toBe(2);
    expect(villageColumnBlocks('l', 1, 3)).toBe(2);
    expect(villageColumnBlocks('lBack', 1, 3)).toBe(2);
    expect(villageColumnBlocks('l', 0, 4)).toBe(2);
    expect(villageColumnBlocks('l', 1, 4)).toBe(3);
    expect(villageColumnBlocks('rBack', 0, 4)).toBe(2);
  });

  it('middle count is one less than block count', () => {
    expect(villageColumnMiddleCount('l', 1, 4)).toBe(2);
    expect(villageColumnMiddleCount('l', 0, 1)).toBe(0);
  });
});