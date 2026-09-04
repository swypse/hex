import { describe, it, expect } from 'vitest';
import {
  ALL_TILE_TYPES,
  isForestType,
  isLandType,
  isMountainType,
  isWaterType,
  TILE_TYPE_COLORS,
  TILE_TYPE_NAMES,
  TileType,
} from '../src/game/tileTypes';

describe('tile types', () => {
  it('defines all 17 tile types', () => {
    expect(ALL_TILE_TYPES).toHaveLength(17);
    expect(ALL_TILE_TYPES).toContain(TileType.Water);
    expect(ALL_TILE_TYPES).toContain(TileType.Settlement);
  });

  it('assigns a numeric color to every tile type', () => {
    for (const type of ALL_TILE_TYPES) {
      expect(typeof TILE_TYPE_COLORS[type]).toBe('number');
    }
  });

  it('defines a display name for every tile type', () => {
    for (const type of ALL_TILE_TYPES) {
      expect(TILE_TYPE_NAMES[type]).toBeTruthy();
    }
    expect(TILE_TYPE_NAMES[TileType.Water]).toBe('Water');
  });

  it('classifies land, forest, mountain, and water correctly', () => {
    const land = ALL_TILE_TYPES.filter(isLandType);
    const forest = ALL_TILE_TYPES.filter(isForestType);
    const mountain = ALL_TILE_TYPES.filter(isMountainType);
    const water = ALL_TILE_TYPES.filter(isWaterType);
    expect(land).toHaveLength(5);
    expect(forest).toHaveLength(5);
    expect(mountain).toHaveLength(5);
    expect(water).toEqual([TileType.Water]);
  });

  it('still exposes tile classification helpers', () => {
    expect(typeof isLandType).toBe('function');
    expect(typeof isForestType).toBe('function');
    expect(typeof isMountainType).toBe('function');
    expect(typeof isWaterType).toBe('function');
  });
});
