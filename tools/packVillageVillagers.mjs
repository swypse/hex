// Packs the village-villager PNGs (src/assets/village-villagers/*.png) into a
// single compressed atlas PNG plus a generated manifest. Thin wrapper around
// the shared tribe packer (tools/packVillageTribes.mjs). The source files are
// never modified. Run with: npm run pack:village-villagers
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

export const SOURCE_DIR_URL = tribeSourceUrl('villagers');
export const ATLAS_URL = tribeAtlasUrl('villagers');
export const MANIFEST_URL = tribeManifestUrl('villagers');

export const VILLAGE_VILLAGERS_COLS = tribeCols('villagers');
export const VILLAGE_VILLAGERS_ATLAS_FILE = tribeAtlasFileName('villagers');

/** Permanent, sorted order of the source PNG base names (e.g. 'villagers-r-m2'). */
export const VILLAGE_VILLAGERS_ORDER = tribeOrder('villagers');

export function generateVillageVillagersAtlas(sourceDir = SOURCE_DIR_URL, cols = VILLAGE_VILLAGERS_COLS) {
  return generateVillageTribeAtlas('villagers', sourceDir, cols);
}

export async function writeVillageVillagersAtlas() {
  return writeVillageTribeAtlas('villagers');
}

if (import.meta.main) {
  await runPack('villagers');
}