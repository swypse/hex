// Packs the village-warrior PNGs (src/assets/village-warriors/*.png) into a
// single compressed atlas PNG plus a generated manifest. Thin wrapper around
// the shared tribe packer (tools/packVillageTribes.mjs). The source files are
// never modified. Run with: npm run pack:village-warriors
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

export const SOURCE_DIR_URL = tribeSourceUrl('warriors');
export const ATLAS_URL = tribeAtlasUrl('warriors');
export const MANIFEST_URL = tribeManifestUrl('warriors');

export const VILLAGE_WARRIORS_COLS = tribeCols('warriors');
export const VILLAGE_WARRIORS_ATLAS_FILE = tribeAtlasFileName('warriors');

/** Permanent, sorted order of the source PNG base names (e.g. 'warriors-r-m2'). */
export const VILLAGE_WARRIORS_ORDER = tribeOrder('warriors');

export function generateVillageWarriorsAtlas(sourceDir = SOURCE_DIR_URL, cols = VILLAGE_WARRIORS_COLS) {
  return generateVillageTribeAtlas('warriors', sourceDir, cols);
}

export async function writeVillageWarriorsAtlas() {
  return writeVillageTribeAtlas('warriors');
}

if (import.meta.main) {
  await runPack('warriors');
}