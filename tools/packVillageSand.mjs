// Packs the village-sand PNGs (src/assets/village-sand/*.png) into a
// single compressed atlas PNG plus a generated manifest. Thin wrapper around
// the shared tribe packer (tools/packVillageTribes.mjs). The source files are
// never modified. Run with: npm run pack:village-sand
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

export const SOURCE_DIR_URL = tribeSourceUrl('sand');
export const ATLAS_URL = tribeAtlasUrl('sand');
export const MANIFEST_URL = tribeManifestUrl('sand');

export const VILLAGE_SAND_COLS = tribeCols('sand');
export const VILLAGE_SAND_ATLAS_FILE = tribeAtlasFileName('sand');

/** Permanent, sorted order of the source PNG base names (e.g. 'sand-r-m2'). */
export const VILLAGE_SAND_ORDER = tribeOrder('sand');

export function generateVillageSandAtlas(sourceDir = SOURCE_DIR_URL, cols = VILLAGE_SAND_COLS) {
  return generateVillageTribeAtlas('sand', sourceDir, cols);
}

export async function writeVillageSandAtlas() {
  return writeVillageTribeAtlas('sand');
}

if (import.meta.main) {
  await runPack('sand');
}