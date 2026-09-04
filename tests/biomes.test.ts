import { describe, it, expect } from 'vitest';
import {
  BIOME_FOREST,
  BIOME_LAND,
  BIOME_MOUNTAIN,
  BIOME_NAMES,
  Biome,
  biomeFor,
  generateTerrain,
} from '../src/game/biomes';
import { isForestType, isLandType, isMountainType, TileType } from '../src/game/tileTypes';
import { TerrainTile } from '../src/game/biomes';

describe('biomes', () => {
  it('classifies temperature and rain into all five biomes', () => {
    expect(biomeFor(0.3, 0.3)).toBe(Biome.Tundra);
    expect(biomeFor(0.3, 0.7)).toBe(Biome.Taiga);
    expect(biomeFor(0.7, 0.3)).toBe(Biome.Desert);
    expect(biomeFor(0.7, 0.7)).toBe(Biome.Rainforest);
    expect(biomeFor(0.5, 0.5)).toBe(Biome.Grassland);
    expect(biomeFor(0.5, 0.3)).toBe(Biome.Grassland);
    expect(biomeFor(0.5, 0.7)).toBe(Biome.Grassland);
  });

  it('has a display name for every biome', () => {
    for (const b of Object.values(Biome).filter((v): v is Biome => typeof v === 'number')) {
      expect(typeof BIOME_NAMES[b]).toBe('string');
    }
  });

  it('maps every biome to a land, forest, and mountain tile', () => {
    for (const b of Object.values(Biome).filter((v): v is Biome => typeof v === 'number')) {
      expect(isLandType(BIOME_LAND[b])).toBe(true);
      expect(isForestType(BIOME_FOREST[b])).toBe(true);
      expect(isMountainType(BIOME_MOUNTAIN[b])).toBe(true);
    }
  });

  it('sets height, temperature, rain, biome, and terrain for every tile', () => {
    const tiles: TerrainTile[] = Array.from({ length: 200 }, (_, i) => ({
      q: i % 20,
      r: Math.floor(i / 20),
      terrain: TileType.GrasslandLand,
    }));
    generateTerrain(tiles, 42);
    for (const t of tiles) {
      expect(typeof t.height).toBe('number');
      expect(t.height!).toBeGreaterThanOrEqual(0);
      expect(t.height!).toBeLessThanOrEqual(1);
      expect(typeof t.temperature).toBe('number');
      expect(typeof t.rain).toBe('number');
      expect(typeof t.biome).toBe('number');
      expect(typeof t.terrain).toBe('number');
    }
  });

  it('is deterministic for a fixed seed', () => {
    const make = (): TerrainTile[] =>
      Array.from({ length: 100 }, (_, i) => ({
        q: i % 10,
        r: Math.floor(i / 10),
        terrain: TileType.GrasslandLand,
      }));
    const a = make();
    const b = make();
    generateTerrain(a, 7);
    generateTerrain(b, 7);
    expect(a.map((t) => [t.height, t.temperature, t.rain, t.biome, t.terrain])).toEqual(
      b.map((t) => [t.height, t.temperature, t.rain, t.biome, t.terrain]),
    );
  });

  it('produces roughly 40% water and 10% mountains on a large map', () => {
    const tiles = Array.from({ length: 1200 }, (_, i) => {
      const q = (i * 13) % 60;
      return {
        q,
        r: Math.floor(q / 2),
        terrain: TileType.GrasslandLand,
      };
    });
    generateTerrain(tiles, 123);
    const water = tiles.filter((t) => t.terrain === TileType.Water).length / tiles.length;
    const mountain = tiles.filter((t) => isMountain(t.terrain)).length / tiles.length;
    expect(water).toBeGreaterThan(0.35);
    expect(water).toBeLessThan(0.45);
    expect(mountain).toBeGreaterThan(0.09);
    expect(mountain).toBeLessThan(0.14);
  });
});

function isMountain(t: TileType): boolean {
  return [
    TileType.GrasslandMountain,
    TileType.DesertMountain,
    TileType.TundraMountain,
    TileType.TaigaMountain,
    TileType.RainforestMountain,
  ].includes(t);
}
