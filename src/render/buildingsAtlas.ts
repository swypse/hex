import { Rectangle, Texture } from 'pixi.js';
import { BUILDINGS_ATLAS_FILE, BUILDINGS_ATLAS_FRAMES } from '../game/buildingsAtlasData.gen';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** Atlas frame keys of every building tile that textureFactory consumes, one
 *  per PNG in `src/assets/buildings/` (see `npm run pack:buildings`). */
export const BUILDING_TILE_FILES: string[] = [
  'sawmill',
  'mine',
  'bridge-nw',
  'bridge-ne',
  'bridge-we',
  'port-nw',
  'port-ne',
  'port-sw',
  'port-se',
  'port-e',
  'port-w',
  'water-temple-1',
  'water-temple-2',
  'water-temple-3',
  'water-temple-4',
  'forest-temple-1',
  'forest-temple-2',
  'forest-temple-3',
  'forest-temple-4',
  'village-empty',
  'wall',
];

let atlasTexture: Texture | null = null;
let atlasPromise: Promise<void> | null = null;
const frameCache = new Map<string, Texture>();

/** Loads the single packed buildings atlas image once and shares the same load
 *  promise with every caller. A failed load resolves without a texture, so
 *  callers degrade to procedurally drawn fallbacks instead of retrying. */
export function ensureBuildingsAtlas(): Promise<void> {
  if (atlasPromise) return atlasPromise;
  atlasPromise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        atlasTexture = Texture.from(img);
      } catch {
        console.error('[buildingsAtlas] Texture.from failed for', TEXTURE_BASE + BUILDINGS_ATLAS_FILE);
      }
      resolve();
    };
    img.onerror = () => {
      console.error('[buildingsAtlas] onerror for', TEXTURE_BASE + BUILDINGS_ATLAS_FILE);
      resolve();
    };
    img.src = TEXTURE_BASE + BUILDINGS_ATLAS_FILE;
  });
  return atlasPromise;
}

/** Returns the building PNG texture for an atlas frame key, sliced out of the
 *  packed atlas (one HTTP image total). Null when the atlas is unavailable. */
export function buildingTileTexture(frameKey: string): Texture | null {
  const frame = BUILDINGS_ATLAS_FRAMES[frameKey];
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