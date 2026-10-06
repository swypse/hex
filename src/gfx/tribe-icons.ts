import { Sprite } from 'pixi.js';
import { TRIBE_ICONS_ATLAS_FILE, TRIBE_ICONS_ATLAS_CELL, TRIBE_ICONS_ATLAS_FRAMES } from '../atlas-data/tribe-icons-atlas-data.gen';
import { createIconAtlas } from './icon-atlas';

const atlas = createIconAtlas({ file: TRIBE_ICONS_ATLAS_FILE, cell: TRIBE_ICONS_ATLAS_CELL, frames: TRIBE_ICONS_ATLAS_FRAMES, tag: 'tribeIcons' });

/** Loads the single packed tribe-icons atlas image once and shares the same
 *  load promise with every caller. */
export function ensureTribeIconsAtlas(): Promise<void> {
  return atlas.ensure();
}

/** A tribe icon sprite sliced from the packed atlas. Frame keys are the icon
 *  base names in `src/assets/tribe-icons/` (e.g. 'cats-icon'). */
export function makeTribeIcon(key: string, size: number): Sprite {
  return atlas.makeSprite(key, size);
}
