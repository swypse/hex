import { Sprite, Texture } from 'pixi.js';
import { ICONS32_ATLAS_FILE, ICONS32_ATLAS_CELL, ICONS32_ATLAS_FRAMES } from '../atlas-data/icons32-atlas-data.gen';
import { createIconAtlas } from './icon-atlas';

const atlas = createIconAtlas({ file: ICONS32_ATLAS_FILE, cell: ICONS32_ATLAS_CELL, frames: ICONS32_ATLAS_FRAMES, tag: 'icons32' });

/** Loads the single packed 32px icons atlas once and shares the same load
 *  promise with every caller. */
export function ensureIcons32Atlas(): Promise<void> {
  return atlas.ensure();
}

/** Directly returns the atlas texture for a frame key (no sprite). Use after
 *  `ensureIcons32Atlas`; null when the atlas is unavailable. */
export function icons32FrameTexture(key: string): Texture | null {
  return atlas.frameTexture(key);
}

/** A 32px icon sprite sliced from the packed atlas. Frame keys are the icon
 *  base names in `src/assets/32/` (e.g. 'water-protection-32'). */
export function makeIcon32(key: string, size: number): Sprite {
  return atlas.makeSprite(key, size);
}
