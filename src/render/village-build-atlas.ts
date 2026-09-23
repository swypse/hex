import { Rectangle, Texture } from 'pixi.js';
import { VILLAGE_AQUA_ATLAS_FILE, VILLAGE_AQUA_ATLAS_FRAMES } from '../game/village-aqua-atlas-data.gen';
import { VILLAGE_BARBARIANS_ATLAS_FILE, VILLAGE_BARBARIANS_ATLAS_FRAMES } from '../game/village-barbarians-atlas-data.gen';
import { VILLAGE_CATS_ATLAS_FILE, VILLAGE_CATS_ATLAS_FRAMES } from '../game/village-cats-atlas-data.gen';
import { VILLAGE_FOREST_ATLAS_FILE, VILLAGE_FOREST_ATLAS_FRAMES } from '../game/village-forest-atlas-data.gen';
import { VILLAGE_SAND_ATLAS_FILE, VILLAGE_SAND_ATLAS_FRAMES } from '../game/village-sand-atlas-data.gen';
import { VILLAGE_VILLAGERS_ATLAS_FILE, VILLAGE_VILLAGERS_ATLAS_FRAMES } from '../game/village-villagers-atlas-data.gen';
import { VILLAGE_WARRIORS_ATLAS_FILE, VILLAGE_WARRIORS_ATLAS_FRAMES } from '../game/village-warriors-atlas-data.gen';
import { ensureCanvasResource } from './image-texture';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** One packed village-composite atlas (file + its generated frames manifest). */
interface VillageBuildAtlas {
  file: string;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
  texture: Texture | null;
  promise: Promise<void> | null;
  cache: Map<string, Texture>;
}

const ATLASES: Record<string, VillageBuildAtlas> = {
  aqua: { file: VILLAGE_AQUA_ATLAS_FILE, frames: VILLAGE_AQUA_ATLAS_FRAMES, texture: null, promise: null, cache: new Map() },
  barbarians: { file: VILLAGE_BARBARIANS_ATLAS_FILE, frames: VILLAGE_BARBARIANS_ATLAS_FRAMES, texture: null, promise: null, cache: new Map() },
  cats: { file: VILLAGE_CATS_ATLAS_FILE, frames: VILLAGE_CATS_ATLAS_FRAMES, texture: null, promise: null, cache: new Map() },
  forest: { file: VILLAGE_FOREST_ATLAS_FILE, frames: VILLAGE_FOREST_ATLAS_FRAMES, texture: null, promise: null, cache: new Map() },
  sand: { file: VILLAGE_SAND_ATLAS_FILE, frames: VILLAGE_SAND_ATLAS_FRAMES, texture: null, promise: null, cache: new Map() },
  villagers: { file: VILLAGE_VILLAGERS_ATLAS_FILE, frames: VILLAGE_VILLAGERS_ATLAS_FRAMES, texture: null, promise: null, cache: new Map() },
  warriors: { file: VILLAGE_WARRIORS_ATLAS_FILE, frames: VILLAGE_WARRIORS_ATLAS_FRAMES, texture: null, promise: null, cache: new Map() },
};

function ensureBuildAtlas(prefix: string): Promise<void> {
  const atlas = ATLASES[prefix];
  if (!atlas) return Promise.resolve();
  if (atlas.promise) return atlas.promise;
  atlas.promise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        atlas.texture = Texture.from(img);
        ensureCanvasResource(atlas.texture);
      } catch {
        console.error(`[villageBuildAtlas] Texture.from failed for ${prefix}`, TEXTURE_BASE + atlas.file);
      }
      resolve();
    };
    img.onerror = () => {
      console.error(`[villageBuildAtlas] onerror for ${prefix}`, TEXTURE_BASE + atlas.file);
      resolve();
    };
    img.src = TEXTURE_BASE + atlas.file;
  });
  return atlas.promise;
}

function buildFrameTexture(prefix: string, frameKey: string): Texture | null {
  const atlas = ATLASES[prefix];
  const frame = atlas?.frames[frameKey];
  if (!atlas || !frame || !atlas.texture) return null;
  const cached = atlas.cache.get(frameKey);
  if (cached) return cached;
  const tex = new Texture({
    source: atlas.texture.source,
    frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
    label: `${prefix}/${frameKey}`,
  });
  atlas.cache.set(frameKey, tex);
  return tex;
}

/** Loads the packed village-cats atlas image once (shared promise). */
export function ensureVillageCatsAtlas(): Promise<void> {
  return ensureBuildAtlas('cats');
}

/** Loads the packed village-barbarians atlas image once (shared promise). */
export function ensureVillageBarbariansAtlas(): Promise<void> {
  return ensureBuildAtlas('barbarians');
}

/** Loads the packed village-aqua atlas image once (shared promise). */
export function ensureVillageAquaAtlas(): Promise<void> {
  return ensureBuildAtlas('aqua');
}

/** Loads the packed village-forest atlas image once (shared promise). */
export function ensureVillageForestAtlas(): Promise<void> {
  return ensureBuildAtlas('forest');
}

/** Loads the packed village-sand atlas image once (shared promise). */
export function ensureVillageSandAtlas(): Promise<void> {
  return ensureBuildAtlas('sand');
}

/** Loads the packed village-villagers atlas image once (shared promise). */
export function ensureVillageVillagersAtlas(): Promise<void> {
  return ensureBuildAtlas('villagers');
}

/** Loads the packed village-warriors atlas image once (shared promise). */
export function ensureVillageWarriorsAtlas(): Promise<void> {
  return ensureBuildAtlas('warriors');
}

/** Returns the village-cat PNG texture for an atlas frame key. */
export function villageCatsFrameTexture(frameKey: string): Texture | null {
  return buildFrameTexture('cats', frameKey);
}

/** Returns the village-barbarian PNG texture for an atlas frame key. */
export function villageBarbarianFrameTexture(frameKey: string): Texture | null {
  return buildFrameTexture('barbarians', frameKey);
}

/** Returns the village-aqua PNG texture for an atlas frame key. */
export function villageAquaFrameTexture(frameKey: string): Texture | null {
  return buildFrameTexture('aqua', frameKey);
}

/** Returns the village-forest PNG texture for an atlas frame key. */
export function villageForestFrameTexture(frameKey: string): Texture | null {
  return buildFrameTexture('forest', frameKey);
}

/** Returns the village-sand PNG texture for an atlas frame key. */
export function villageSandFrameTexture(frameKey: string): Texture | null {
  return buildFrameTexture('sand', frameKey);
}

/** Returns the village-villager PNG texture for an atlas frame key. */
export function villageVillagerFrameTexture(frameKey: string): Texture | null {
  return buildFrameTexture('villagers', frameKey);
}

/** Returns the village-warrior PNG texture for an atlas frame key. */
export function villageWarriorFrameTexture(frameKey: string): Texture | null {
  return buildFrameTexture('warriors', frameKey);
}