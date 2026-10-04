import { describe, it, expect } from 'vitest';
import {
  VILLAGE_BUILD_COLUMN_COUNTS,
  isVillageTallColumn,
  villageColumnBlocks,
  villageColumnMiddleCount,
} from '../src/game/village-build';
import { VillageBuildSide } from '@enums';

describe('village column block counts', () => {
  it('defines 8 columns: left 3, right 2, left-back 2, right-back 1', () => {
    expect(VILLAGE_BUILD_COLUMN_COUNTS).toEqual({ l: 3, r: 2, lBack: 2, rBack: 1 });
  });

  it('marks tall columns: left 2-3, right 1-2; left1 + backs stay short', () => {
    expect(isVillageTallColumn(VillageBuildSide.LEFT, 0)).toBe(false);
    expect(isVillageTallColumn(VillageBuildSide.LEFT, 1)).toBe(true);
    expect(isVillageTallColumn(VillageBuildSide.LEFT, 2)).toBe(true);
    expect(isVillageTallColumn(VillageBuildSide.RIGHT, 0)).toBe(true);
    expect(isVillageTallColumn(VillageBuildSide.RIGHT, 1)).toBe(true);
    expect(isVillageTallColumn(VillageBuildSide.LEFT_BACK, 0)).toBe(false);
    expect(isVillageTallColumn(VillageBuildSide.LEFT_BACK, 1)).toBe(false);
    expect(isVillageTallColumn(VillageBuildSide.RIGHT_BACK, 0)).toBe(false);
  });

  it('counts blocks per level: on 1 village level each column has 1 block', () => {
    for (const side of [VillageBuildSide.LEFT, VillageBuildSide.RIGHT, VillageBuildSide.LEFT_BACK, VillageBuildSide.RIGHT_BACK]) {
      for (let col = 0; col < VILLAGE_BUILD_COLUMN_COUNTS[side]; col++) {
        expect(villageColumnBlocks(side, col, 1)).toBe(1);
      }
    }
  });

  it('level 2: tall columns get a 2nd block, short stay at 1', () => {
    expect(villageColumnBlocks(VillageBuildSide.LEFT, 0, 2)).toBe(1);
    expect(villageColumnBlocks(VillageBuildSide.LEFT, 1, 2)).toBe(2);
    expect(villageColumnBlocks(VillageBuildSide.RIGHT, 0, 2)).toBe(2);
    expect(villageColumnBlocks(VillageBuildSide.LEFT_BACK, 0, 2)).toBe(1);
  });

  it('level 3: every column has 2 blocks; level 4: tall only get a 3rd', () => {
    expect(villageColumnBlocks(VillageBuildSide.LEFT, 0, 3)).toBe(2);
    expect(villageColumnBlocks(VillageBuildSide.LEFT, 1, 3)).toBe(2);
    expect(villageColumnBlocks(VillageBuildSide.LEFT_BACK, 1, 3)).toBe(2);
    expect(villageColumnBlocks(VillageBuildSide.LEFT, 0, 4)).toBe(2);
    expect(villageColumnBlocks(VillageBuildSide.LEFT, 1, 4)).toBe(3);
    expect(villageColumnBlocks(VillageBuildSide.RIGHT_BACK, 0, 4)).toBe(2);
  });

  it('middle count is one less than block count', () => {
    expect(villageColumnMiddleCount(VillageBuildSide.LEFT, 1, 4)).toBe(2);
    expect(villageColumnMiddleCount(VillageBuildSide.LEFT, 0, 1)).toBe(0);
  });
});