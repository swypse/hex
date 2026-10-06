import type { Texture } from 'pixi.js';
import { TileType } from '../game/map/tile-types';
import { TERRAIN_ATLAS_FILE, TERRAIN_ATLAS_FRAMES } from '../atlas-data/terrain-atlas-data.gen';
import { TERRAIN_BIOME_ATLASES } from '../atlas-data/terrain-biomes-data.gen';
import { createAtlas } from '../gfx/atlas';

/** Terrain tile PNG frame keys per tile type. Frame keys are the base names of
 *  the PNGs in `src/assets/terrain/` (see `npm run pack:terrain`). */
export const TERRAIN_TILE_FILES: Record<TileType, string> = {
  [TileType.GrasslandLand]: 'grassland-land',
  [TileType.GrasslandForest]: 'grassland-forest',
  [TileType.GrasslandMountain]: 'grassland-mountain',
  [TileType.DesertLand]: 'desert-land',
  [TileType.DesertForest]: 'desert-forest',
  [TileType.DesertMountain]: 'desert-mountain',
  [TileType.TundraLand]: 'tundra-land',
  [TileType.TundraForest]: 'tundra-forest',
  [TileType.TundraMountain]: 'tundra-mountain',
  [TileType.TaigaLand]: 'taiga-land',
  [TileType.TaigaForest]: 'taiga-forest',
  [TileType.TaigaMountain]: 'taiga-mountain',
  [TileType.RainforestLand]: 'rainforest-land',
  [TileType.RainforestForest]: 'rainforest-forest',
  [TileType.RainforestMountain]: 'rainforest-mountain',
  [TileType.Water]: 'water',
  [TileType.Settlement]: 'grassland-land',
  [TileType.Ice]: 'ice',
};

/** Atlas frame key of the fog overlay tile. */
export const TERRAIN_FOG_FILE = 'fog';

/** Season whose biome tile variant is used by default. */
export const DEFAULT_TERRAIN_SEASON = 'spring';

const atlas = createAtlas({ file: TERRAIN_ATLAS_FILE, frames: TERRAIN_ATLAS_FRAMES, tag: 'terrainAtlas' });
const biomeAtlases = Object.fromEntries(
  Object.entries(TERRAIN_BIOME_ATLASES).map(([biome, spec]) => [biome, createAtlas({ file: spec.file, frames: spec.frames, tag: `terrainAtlas/${biome}` })]),
);

/** Loads the single packed terrain atlas image once (plus one atlas per biome)
 *  and shares the same load promise with every caller. A failed load resolves
 *  without a texture, so callers degrade to solid fills instead of retrying forever. */
export function ensureTerrainAtlas(): Promise<void> {
  return Promise.all([atlas.ensure(), ...Object.values(biomeAtlases).map((b) => b.ensure())]).then(() => undefined);
}

/** Returns the terrain PNG texture for an atlas frame key, sliced out of the
 *  packed atlas (one HTTP image total). Null when the atlas is unavailable. */
export function terrainFrameTexture(frameKey: string): Texture | null {
  return atlas.frameTexture(frameKey);
}

/** Returns the seasonal biome texture for a tile base name (e.g.
 *  'grassland-land' + 'spring'), sliced from that biome's own atlas. Falls back
 *  to the generic terrain atlas frame when no biome variant exists. */
export function terrainTileTexture(baseKey: string, season: string = DEFAULT_TERRAIN_SEASON): Texture | null {
  const biome = baseKey.split('-')[0] ?? '';
  const frames = TERRAIN_BIOME_ATLASES[biome]?.frames;
  // No dedicated texture for this season -> use the spring one.
  const frameKey = frames?.[`${baseKey}-${season}`] ? `${baseKey}-${season}` : `${baseKey}-${DEFAULT_TERRAIN_SEASON}`;
  return biomeAtlases[biome]?.frameTexture(frameKey) ?? terrainFrameTexture(baseKey);
}
