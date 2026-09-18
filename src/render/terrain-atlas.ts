import { Rectangle, Texture } from 'pixi.js';
import { TileType } from '../game/tile-types';
import { TERRAIN_ATLAS_FILE, TERRAIN_ATLAS_FRAMES } from '../game/terrain-atlas-data.gen';

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
};

/** Atlas frame key of the fog overlay tile. */
export const TERRAIN_FOG_FILE = 'fog';

let atlasTexture: Texture | null = null;
let atlasPromise: Promise<void> | null = null;
const frameCache = new Map<string, Texture>();

/** Loads the single packed terrain atlas image once and shares the same load
 *  promise with every caller. A failed load resolves without a texture, so
 *  callers degrade to solid fills instead of retrying forever. */
export function ensureTerrainAtlas(): Promise<void> {
  if (atlasPromise) return atlasPromise;
  atlasPromise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        atlasTexture = Texture.from(img);
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
  });
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