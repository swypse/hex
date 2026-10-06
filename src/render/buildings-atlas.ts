import type { Texture } from 'pixi.js';
import { BUILDINGS_ATLAS_FILE, BUILDINGS_ATLAS_FRAMES } from '../atlas-data/buildings-atlas-data.gen';
import { createAtlas } from '../gfx/atlas';

/** Atlas frame keys of every building tile that textureFactory consumes, one
 *  per PNG in `src/assets/buildings/` (see `npm run pack:buildings`). */
export const BUILDING_TILE_FILES: string[] = [
  'sawmill',
  'mine',
  'farm',
  'granary',
  'granary-2',
  'granary-3',
  'granary-4',
  'granary-5',
  'granary-6',
  'trap',
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

const atlas = createAtlas({ file: BUILDINGS_ATLAS_FILE, frames: BUILDINGS_ATLAS_FRAMES, tag: 'buildingsAtlas' });

/** Loads the single packed buildings atlas image once and shares the same load
 *  promise with every caller. A failed load resolves without a texture, so
 *  callers degrade to procedurally drawn fallbacks instead of retrying. */
export function ensureBuildingsAtlas(): Promise<void> {
  return atlas.ensure();
}

/** Returns the building PNG texture for an atlas frame key, sliced out of the
 *  packed atlas (one HTTP image total). Null when the atlas is unavailable. */
export function buildingTileTexture(frameKey: string): Texture | null {
  return atlas.frameTexture(frameKey);
}
