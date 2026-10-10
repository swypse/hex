import { Sprite, type Texture } from 'pixi.js';
import { ACTION_BUTTON_ATLAS_FILE, ACTION_BUTTON_ATLAS_CELL, ACTION_BUTTON_ATLAS_FRAMES } from '../atlas-data/action-button-atlas-data.gen';
import { createIconAtlas } from './icon-atlas';

/** Logical button key -> atlas frame key. Atlas frames live in ACTION_BUTTON_ATLAS_FRAMES. */
export const ACTION_BUTTON_ICON_FILES: Record<string, string> = {
  upgrade: 'action-upgrade',
  'upgrade-ship': 'action-ship-upgrade',
  wall: 'action-build-wall',
  build: 'action-build',
  'thorn-trap': 'action-build-trap',
  extinguish: 'action-fire-extinguish',
  stealth: 'action-stealth',
  stormcaller: 'action-stormcaller',
  sawmill: 'action-build-sawmill',
  mine: 'action-build-mine',
  farm: 'action-build-farm',
  granary: 'action-build-granary',
  university: 'action-build-university',
  'burn-farm': 'action-burn-farm',
  'burn-granary': 'action-burn-granary',
  'burn-road': 'action-burn-road',
  port: 'action-build-port',
  road: 'action-build-road',
  bridge: 'action-build-bridge',
  heal: 'action-heal',
  disband: 'action-disband',
  capture: 'action-capture',
  spawn: 'action-spawn',
  temple: 'action-water-temple',
  forestTemple: 'action-forest-temple',
  bonus: 'action-get-bonus',
  bottle: 'action-get-bottle',
  deal: 'action-deal-with-pirates',
  stats: 'action-stats',
  skills: 'action-skills',
  achievements: 'action-cup',
  'end-turn': 'action-end-turn',
};

const atlas = createIconAtlas({ file: ACTION_BUTTON_ATLAS_FILE, cell: ACTION_BUTTON_ATLAS_CELL, frames: ACTION_BUTTON_ATLAS_FRAMES, tag: 'actionButtonIcons' });

/** Loads the single packed action-buttons atlas image once and shares the same
 *  load promise with every caller (sprites and direct frame slicing alike). */
export function ensureActionButtonAtlas(): Promise<void> {
  return atlas.ensure();
}

/** Directly returns the atlas texture for a frame key (no sprite). Use after
 *  `ensureActionButtonAtlas`; null when the atlas is unavailable. */
export function actionButtonFrameTexture(key: string): Texture | null {
  return atlas.frameTexture(key);
}

export function makeActionButtonIcon(key: string, size: number, onReady?: () => void): Sprite {
  return atlas.makeSprite(ACTION_BUTTON_ICON_FILES[key] ?? key, size, onReady);
}
