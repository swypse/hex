import type { Texture } from 'pixi.js';
import { TRIBE_ATLAS_FILES, TRIBE_ATLAS_FRAMES } from '../atlas-data/tribe-atlas-data.gen';
import { type Atlas, createAtlas } from '../gfx/atlas';

/** Only tribe atlases that were actually requested are loaded (one HTTP image
 *  per tribe), so tribes that are not in the current game never fetch. */
const atlases = new Map<string, Atlas>();

/** Loads one tribe's packed atlas image once and shares the same load promise
 *  with every caller. Unknown codes resolve without loading anything. */
export function ensureTribeAtlas(code: string): Promise<void> {
  const file = TRIBE_ATLAS_FILES[code];
  if (!file) return Promise.resolve();
  let atlas = atlases.get(code);
  if (!atlas) {
    atlas = createAtlas({ file, frames: TRIBE_ATLAS_FRAMES[code] ?? {}, tag: 'tribeAtlas' });
    atlases.set(code, atlas);
  }
  return atlas.ensure();
}

/** Returns a tribe texture for an atlas frame key, sliced out of that tribe's
 *  packed atlas. Null when the atlas is unavailable or the frame is missing. */
export function tribeTileTexture(code: string, frameKey: string): Texture | null {
  return atlases.get(code)?.frameTexture(frameKey) ?? null;
}
