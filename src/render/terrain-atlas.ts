import { Rectangle, Texture } from 'pixi.js';
import { TileType } from '../game/tile-types';
import { TERRAIN_ATLAS_FILE, TERRAIN_ATLAS_FRAMES } from '../game/terrain-atlas-data.gen';
import { TERRAIN_BIOME_ATLASES } from '../game/terrain-biomes-data.gen';
import { ensureCanvasResource } from './image-texture';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

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

let atlasTexture: Texture | null = null;
let atlasPromise: Promise<void> | null = null;
const frameCache = new Map<string, Texture>();
const biomeTextures = new Map<string, Texture>();
const biomeFrameCache = new Map<string, Texture>();

function loadAtlasImage(file: string): Promise<Texture | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const tex = Texture.from(img);
        ensureCanvasResource(tex);
        resolve(tex);
      } catch {
        console.error('[terrainAtlas] Texture.from failed for', TEXTURE_BASE + file);
        resolve(null);
      }
    };
    img.onerror = () => {
      console.error('[terrainAtlas] onerror for', TEXTURE_BASE + file);
      resolve(null);
    };
    img.src = TEXTURE_BASE + file;
  });
}

async function loadBiomeAtlases(): Promise<void> {
  await Promise.all(
    Object.entries(TERRAIN_BIOME_ATLASES).map(async ([biome, atlas]) => {
      const tex = await loadAtlasImage(atlas.file);
      if (tex) biomeTextures.set(biome, tex);
    }),
  );
}

/** Loads the single packed terrain atlas image once and shares the same load
 *  promise with every caller. A failed load resolves without a texture, so
 *  callers degrade to solid fills instead of retrying forever. */
export function ensureTerrainAtlas(): Promise<void> {
  if (atlasPromise) return atlasPromise;
  const biomes = loadBiomeAtlases();
  atlasPromise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        atlasTexture = Texture.from(img);
        ensureCanvasResource(atlasTexture);
      } catch {
        console.error('[terrainAtlas] Texture.from failed for', TEXTURE_BASE + TERRAIN_ATLAS_FILE);
      }
      resolve();
    };
    img.onerror = () => {
      console.error('[terrainAtlas] onerror for', TEXTURE_BASE + TERRAIN_ATLAS_FILE);
      resolve();
    };
    img.src = TEXTURE_BASE + TERRAIN_ATLAS_FILE;
  }).then(() => biomes);
  return atlasPromise;
}

/** Returns the terrain PNG texture for an atlas frame key, sliced out of the
 *  packed atlas (one HTTP image total). Null when the atlas is unavailable. */
export function terrainFrameTexture(frameKey: string): Texture | null {
  const frame = TERRAIN_ATLAS_FRAMES[frameKey];
  if (!frame || !atlasTexture) return null;
  const cached = frameCache.get(frameKey);
  if (cached) return cached;
  const tex = new Texture({
    source: atlasTexture.source,
    frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
    label: frameKey,
  });
  frameCache.set(frameKey, tex);
  return tex;
}

/** Returns the seasonal biome texture for a tile base name (e.g.
 *  'grassland-land' + 'spring'), sliced from that biome's own atlas. Falls back
 *  to the generic terrain atlas frame when no biome variant exists. */
export function terrainTileTexture(baseKey: string, season: string = DEFAULT_TERRAIN_SEASON): Texture | null {
  const biome = baseKey.split('-')[0] ?? '';
  const frames = TERRAIN_BIOME_ATLASES[biome]?.frames;
  // No dedicated texture for this season -> use the spring one.
  const frameKey = frames?.[`${baseKey}-${season}`] ? `${baseKey}-${season}` : `${baseKey}-${DEFAULT_TERRAIN_SEASON}`;
  const frame = frames?.[frameKey];
  const source = biomeTextures.get(biome)?.source;
  if (!frame || !source) return terrainFrameTexture(baseKey);
  const cached = biomeFrameCache.get(frameKey);
  if (cached) return cached;
  const tex = new Texture({
    source,
    frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
    label: frameKey,
  });
  biomeFrameCache.set(frameKey, tex);
  return tex;
}
