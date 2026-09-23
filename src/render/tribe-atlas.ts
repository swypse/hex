import { Rectangle, Texture } from 'pixi.js';
import { TRIBE_ATLAS_FILES, TRIBE_ATLAS_FRAMES } from '../game/tribe-atlas-data.gen';
import { ensureCanvasResource } from './image-texture';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** Only tribe atlases that were actually requested are loaded (one HTTP image
 *  per tribe), so tribes that are not in the current game never fetch. */
const atlases = new Map<string, { texture: Texture | null; promise: Promise<void> }>();
const frameCache = new Map<string, Texture>();

function cacheKey(code: string, frameKey: string): string {
  return `${code}/${frameKey}`;
}

/** Loads one tribe's packed atlas image once and shares the same load promise
 *  with every caller. Unknown codes resolve without loading anything. */
export function ensureTribeAtlas(code: string): Promise<void> {
  const existing = atlases.get(code);
  if (existing) return existing.promise;
  const entry = { texture: null as Texture | null, promise: undefined as unknown as Promise<void> };
  entry.promise = new Promise<void>((resolve) => {
    const atlasFile = TRIBE_ATLAS_FILES[code];
    if (!atlasFile) {
      resolve();
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        entry.texture = Texture.from(img);
        ensureCanvasResource(entry.texture);
      } catch {
        console.error('[tribeAtlas] Texture.from failed for', TEXTURE_BASE + atlasFile);
      }
      resolve();
    };
    img.onerror = () => {
      console.error('[tribeAtlas] onerror for', TEXTURE_BASE + atlasFile);
      resolve();
    };
    img.src = TEXTURE_BASE + atlasFile;
  });
  atlases.set(code, entry);
  return entry.promise;
}

/** Returns a tribe texture for an atlas frame key, sliced out of that tribe's
 *  packed atlas. Null when the atlas is unavailable or the frame is missing. */
export function tribeTileTexture(code: string, frameKey: string): Texture | null {
  const atlas = atlases.get(code);
  const frame = TRIBE_ATLAS_FRAMES[code]?.[frameKey];
  if (!atlas || !atlas.texture || !frame) return null;
  const key = cacheKey(code, frameKey);
  const cached = frameCache.get(key);
  if (cached) return cached;
  const tex = new Texture({
    source: atlas.texture.source,
    frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
    label: `${code}/${frameKey}`,
  });
  frameCache.set(key, tex);
  return tex;
}