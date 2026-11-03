// Packs the village-forest PNGs (src/assets/village-forest/*.png) into a
// single compressed atlas PNG plus a generated manifest. Thin wrapper around
// the shared tribe packer (tools/packVillageTribes.mjs). The source files are
// never modified. Run with: npm run pack:village-forest
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

export const SOURCE_DIR_URL = tribeSourceUrl('forest');
export const ATLAS_URL = tribeAtlasUrl('forest');
export const MANIFEST_URL = tribeManifestUrl('forest');

export const VILLAGE_FOREST_COLS = tribeCols('forest');
export const VILLAGE_FOREST_ATLAS_FILE = tribeAtlasFileName('forest');

/** Permanent, sorted order of the source PNG base names (e.g. 'forest-r-m2'). */
export const VILLAGE_FOREST_ORDER = tribeOrder('forest');

export function generateVillageForestAtlas(sourceDir = SOURCE_DIR_URL, cols = VILLAGE_FOREST_COLS) {
  return generateVillageTribeAtlas('forest', sourceDir, cols);
}

export async function writeVillageForestAtlas() {
  return writeVillageTribeAtlas('forest');
}

if (import.meta.main) {
  await runPack('forest');
}