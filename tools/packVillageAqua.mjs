// Packs the village-aqua PNGs (src/assets/village-aqua/*.png) into a
// single compressed atlas PNG plus a generated manifest. Thin wrapper around
// the shared tribe packer (tools/packVillageTribes.mjs). The source files are
// never modified. Run with: npm run pack:village-aqua
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

export const SOURCE_DIR_URL = tribeSourceUrl('aqua');
export const ATLAS_URL = tribeAtlasUrl('aqua');
export const MANIFEST_URL = tribeManifestUrl('aqua');

export const VILLAGE_AQUA_COLS = tribeCols('aqua');
export const VILLAGE_AQUA_ATLAS_FILE = tribeAtlasFileName('aqua');

/** Permanent, sorted order of the source PNG base names (e.g. 'aqua-r-m2'). */
export const VILLAGE_AQUA_ORDER = tribeOrder('aqua');

export function generateVillageAquaAtlas(sourceDir = SOURCE_DIR_URL, cols = VILLAGE_AQUA_COLS) {
  return generateVillageTribeAtlas('aqua', sourceDir, cols);
}

export async function writeVillageAquaAtlas() {
  return writeVillageTribeAtlas('aqua');
}

if (import.meta.main) {
  await runPack('aqua');
}