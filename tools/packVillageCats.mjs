// Packs the village-cat PNGs (src/assets/village-cats/*.png) into a single
// compressed atlas PNG plus a generated manifest. Thin wrapper around the
// shared tribe packer (tools/packVillageTribes.mjs). The source files are
// never modified. Run with: npm run pack:village-cats
import {
  tribeSourceUrl,
  tribeAtlasUrl,
  tribeManifestUrl,
  tribeOrder,
  tribeCols,
  tribeAtlasFileName,
  generateVillageTribeAtlas,
  writeVillageTribeAtlas,
  runPack,
} from './packVillageTribes.mjs';

export const SOURCE_DIR_URL = tribeSourceUrl('cats');
export const ATLAS_URL = tribeAtlasUrl('cats');
export const MANIFEST_URL = tribeManifestUrl('cats');

export const VILLAGE_CATS_COLS = tribeCols('cats');
export const VILLAGE_CATS_ATLAS_FILE = tribeAtlasFileName('cats');

/** Permanent, sorted order of the source PNG base names (e.g. 'cats-r-m2'). */
export const VILLAGE_CATS_ORDER = tribeOrder('cats');

export function generateVillageCatsAtlas(sourceDir = SOURCE_DIR_URL, cols = VILLAGE_CATS_COLS) {
  return generateVillageTribeAtlas('cats', sourceDir, cols);
}

export async function writeVillageCatsAtlas() {
  return writeVillageTribeAtlas('cats');
}

if (import.meta.main) {
  await runPack('cats');
}