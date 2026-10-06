import type { Texture } from 'pixi.js';
import { VILLAGE_AQUA_ATLAS_FILE, VILLAGE_AQUA_ATLAS_FRAMES } from '../atlas-data/village-aqua-atlas-data.gen';
import { VILLAGE_BARBARIANS_ATLAS_FILE, VILLAGE_BARBARIANS_ATLAS_FRAMES } from '../atlas-data/village-barbarians-atlas-data.gen';
import { VILLAGE_CATS_ATLAS_FILE, VILLAGE_CATS_ATLAS_FRAMES } from '../atlas-data/village-cats-atlas-data.gen';
import { VILLAGE_FOREST_ATLAS_FILE, VILLAGE_FOREST_ATLAS_FRAMES } from '../atlas-data/village-forest-atlas-data.gen';
import { VILLAGE_SAND_ATLAS_FILE, VILLAGE_SAND_ATLAS_FRAMES } from '../atlas-data/village-sand-atlas-data.gen';
import { VILLAGE_VILLAGERS_ATLAS_FILE, VILLAGE_VILLAGERS_ATLAS_FRAMES } from '../atlas-data/village-villagers-atlas-data.gen';
import { VILLAGE_WARRIORS_ATLAS_FILE, VILLAGE_WARRIORS_ATLAS_FRAMES } from '../atlas-data/village-warriors-atlas-data.gen';
import { type Atlas, createAtlas } from '../gfx/atlas';

const ATLASES: Record<string, Atlas> = {
  aqua: createAtlas({ file: VILLAGE_AQUA_ATLAS_FILE, frames: VILLAGE_AQUA_ATLAS_FRAMES, tag: 'villageBuildAtlas/aqua' }),
  barbarians: createAtlas({ file: VILLAGE_BARBARIANS_ATLAS_FILE, frames: VILLAGE_BARBARIANS_ATLAS_FRAMES, tag: 'villageBuildAtlas/barbarians' }),
  cats: createAtlas({ file: VILLAGE_CATS_ATLAS_FILE, frames: VILLAGE_CATS_ATLAS_FRAMES, tag: 'villageBuildAtlas/cats' }),
  forest: createAtlas({ file: VILLAGE_FOREST_ATLAS_FILE, frames: VILLAGE_FOREST_ATLAS_FRAMES, tag: 'villageBuildAtlas/forest' }),
  sand: createAtlas({ file: VILLAGE_SAND_ATLAS_FILE, frames: VILLAGE_SAND_ATLAS_FRAMES, tag: 'villageBuildAtlas/sand' }),
  villagers: createAtlas({ file: VILLAGE_VILLAGERS_ATLAS_FILE, frames: VILLAGE_VILLAGERS_ATLAS_FRAMES, tag: 'villageBuildAtlas/villagers' }),
  warriors: createAtlas({ file: VILLAGE_WARRIORS_ATLAS_FILE, frames: VILLAGE_WARRIORS_ATLAS_FRAMES, tag: 'villageBuildAtlas/warriors' }),
};

function ensureBuildAtlas(prefix: string): Promise<void> {
  return ATLASES[prefix]?.ensure() ?? Promise.resolve();
}

function buildFrameTexture(prefix: string, frameKey: string): Texture | null {
  return ATLASES[prefix]?.frameTexture(frameKey) ?? null;
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