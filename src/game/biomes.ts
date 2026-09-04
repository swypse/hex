import { hexToPixel } from './hex';
import { TileType } from './tileTypes';
import { createPerlin } from './perlin';

export enum Biome {
  Grassland,
  Desert,
  Tundra,
  Taiga,
  Rainforest,
}

export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.Grassland]: 'Grassland',
  [Biome.Desert]: 'Desert',
  [Biome.Tundra]: 'Tundra',
  [Biome.Taiga]: 'Taiga',
  [Biome.Rainforest]: 'Rainforest',
};

export const BIOME_LAND: Record<Biome, TileType> = {
  [Biome.Grassland]: TileType.GrasslandLand,
  [Biome.Desert]: TileType.DesertLand,
  [Biome.Tundra]: TileType.TundraLand,
  [Biome.Taiga]: TileType.TaigaLand,
  [Biome.Rainforest]: TileType.RainforestLand,
};

export const BIOME_FOREST: Record<Biome, TileType> = {
  [Biome.Grassland]: TileType.GrasslandForest,
  [Biome.Desert]: TileType.DesertForest,
  [Biome.Tundra]: TileType.TundraForest,
  [Biome.Taiga]: TileType.TaigaForest,
  [Biome.Rainforest]: TileType.RainforestForest,
};

export const BIOME_MOUNTAIN: Record<Biome, TileType> = {
  [Biome.Grassland]: TileType.GrasslandMountain,
  [Biome.Desert]: TileType.DesertMountain,
  [Biome.Tundra]: TileType.TundraMountain,
  [Biome.Taiga]: TileType.TaigaMountain,
  [Biome.Rainforest]: TileType.RainforestMountain,
};

const TEMP_COLD = 0.45;
const TEMP_WARM = 0.55;
const RAIN_DRY = 0.45;

const ALL_BIOMES: Biome[] = [
  Biome.Grassland,
  Biome.Desert,
  Biome.Tundra,
  Biome.Taiga,
  Biome.Rainforest,
];

export function biomeFor(temperature: number, rain: number): Biome {
  if (temperature < TEMP_COLD) return rain < RAIN_DRY ? Biome.Tundra : Biome.Taiga;
  if (temperature > TEMP_WARM) return rain < RAIN_DRY ? Biome.Desert : Biome.Rainforest;
  return Biome.Grassland;
}

const HEIGHT_FREQ = 0.15;
const TEMP_FREQ = 0.08;
const RAIN_FREQ = 0.1;

export interface TerrainTile {
  q: number;
  r: number;
  terrain: TileType;
  height?: number;
  temperature?: number;
  rain?: number;
  biome?: Biome;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.floor((sorted.length - 1) * p)]!;
}

export function generateTerrain(tiles: TerrainTile[], seed: number): void {
  const heightNoise = createPerlin(seed);
  const tempNoise = createPerlin(seed + 1);
  const rainNoise = createPerlin(seed + 2);

  for (const t of tiles) {
    const p = hexToPixel(t, 1);
    t.height = heightNoise(p.x * HEIGHT_FREQ, p.y * HEIGHT_FREQ);
    t.temperature = tempNoise(p.x * TEMP_FREQ, p.y * TEMP_FREQ);
    t.rain = rainNoise(p.x * RAIN_FREQ, p.y * RAIN_FREQ);
    t.biome = biomeFor(t.temperature, t.rain);
  }

  const heights = tiles.map((t) => t.height!).sort((a, b) => a - b);
  const waterThreshold = percentile(heights, 0.4);
  const mountainThreshold = percentile(heights, 0.9);

  const rainMedians = new Map<Biome, number>();
  for (const b of ALL_BIOMES) {
    const rains = tiles
      .filter((t) => t.biome === b && t.height! >= waterThreshold && t.height! < mountainThreshold)
      .map((t) => t.rain!)
      .sort((a, b) => a - b);
    if (rains.length === 0) continue;
    rainMedians.set(b, percentile(rains, 0.5));
  }

  for (const t of tiles) {
    if (t.height! < waterThreshold) {
      t.terrain = TileType.Water;
    } else if (t.height! >= mountainThreshold) {
      t.terrain = BIOME_MOUNTAIN[t.biome!];
    } else {
      const median = rainMedians.get(t.biome!);
      t.terrain =
        median !== undefined && t.rain! >= median ? BIOME_FOREST[t.biome!] : BIOME_LAND[t.biome!];
    }
  }
}
