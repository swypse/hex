// Packs the village-barbarians PNGs (src/assets/village-barbarians/*.png) into a
// single compressed atlas PNG plus a generated manifest. Thin wrapper around
// the shared tribe packer (tools/packVillageTribes.mjs). The source files are
// never modified. Run with: npm run pack:village-barbarians
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

export const SOURCE_DIR_URL = tribeSourceUrl('barbarians');
export const ATLAS_URL = tribeAtlasUrl('barbarians');
export const MANIFEST_URL = tribeManifestUrl('barbarians');

export const VILLAGE_BARBARIANS_COLS = tribeCols('barbarians');
export const VILLAGE_BARBARIANS_ATLAS_FILE = tribeAtlasFileName('barbarians');

/** Permanent, sorted order of the source PNG base names (e.g. 'barbarians-r-m2'). */
export const VILLAGE_BARBARIANS_ORDER = tribeOrder('barbarians');

export function generateVillageBarbariansAtlas(sourceDir = SOURCE_DIR_URL, cols = VILLAGE_BARBARIANS_COLS) {
  return generateVillageTribeAtlas('barbarians', sourceDir, cols);
}

export async function writeVillageBarbariansAtlas() {
  return writeVillageTribeAtlas('barbarians');
}

if (import.meta.main) {
  await runPack('barbarians');
}