import { Rectangle, Sprite, Texture } from 'pixi.js';
import { ACTION_BUTTON_ATLAS_FILE, ACTION_BUTTON_ATLAS_CELL, ACTION_BUTTON_ATLAS_FRAMES } from '../../game/action-button-atlas-data.gen';
import { ensureCanvasResource } from '../../render/image-texture';
import { markDirty } from '../../render/render-gate';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** Logical button key -> atlas frame key. Atlas frames live in ACTION_BUTTON_ATLAS_FRAMES. */
export const ACTION_BUTTON_ICON_FILES: Record<string, string> = {
  upgrade: 'action-upgrade',
  'upgrade-ship': 'action-ship-upgrade',
  wall: 'action-build-wall',
  build: 'action-build',
  sawmill: 'action-build-sawmill',
  mine: 'action-build-mine',
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

let atlasTexture: Texture | null = null;
let atlasPromise: Promise<void> | null = null;
const frameCache = new Map<string, Texture>();

function sliceFrame(key: string, atlas: Texture): Texture | null {
  const frame = ACTION_BUTTON_ATLAS_FRAMES[key];
  if (!frame) return null;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const tex = new Texture({
    source: atlas.source,
    frame: new Rectangle(frame.x, frame.y, ACTION_BUTTON_ATLAS_CELL, ACTION_BUTTON_ATLAS_CELL),
    label: key,
  });
  frameCache.set(key, tex);
  return tex;
}

/** Loads the single packed action-buttons atlas image once and shares the same
 *  load promise with every caller (sprites and direct frame slicing alike). */
export function ensureActionButtonAtlas(): Promise<void> {
  if (atlasPromise) return atlasPromise;
  atlasPromise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        atlasTexture = Texture.from(img);
        ensureCanvasResource(atlasTexture);
      } catch {
        console.error('[actionButtonIcons] Texture.from failed for', TEXTURE_BASE + ACTION_BUTTON_ATLAS_FILE);
      }
      resolve();
    };
    img.onerror = () => {
      console.error('[actionButtonIcons] onerror for', TEXTURE_BASE + ACTION_BUTTON_ATLAS_FILE);
      resolve();
    };
    img.src = TEXTURE_BASE + ACTION_BUTTON_ATLAS_FILE;
  });
  return atlasPromise;
}

/** Directly returns the atlas texture for a frame key (no sprite). Use after
 *  `ensureActionButtonAtlas`; null when the atlas is unavailable. */
export function actionButtonFrameTexture(key: string): Texture | null {
  if (!atlasTexture) return null;
  return sliceFrame(key, atlasTexture);
}

export function makeActionButtonIcon(key: string, size: number, onReady?: () => void): Sprite {
  const frameKey = ACTION_BUTTON_ICON_FILES[key] ?? key;
  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size;
  if (atlasTexture) {
    const tex = sliceFrame(frameKey, atlasTexture);
    // Re-apply the requested size after assigning the sliced texture: the size
    // set above was against the empty texture, which would otherwise leave an
    // absurd scale and render the icon far bigger than `size` pixels.
    if (tex) {
      sprite.texture = tex;
      sprite.width = size;
      sprite.height = size;
    }
    onReady?.();
    return sprite;
  }
  const img = new Image();
  img.onload = () => {
    atlasTexture = Texture.from(img);
    ensureCanvasResource(atlasTexture);
    const tex = sliceFrame(frameKey, atlasTexture);
    if (sprite.destroyed) return;
    if (tex) {
      sprite.texture = tex;
      sprite.width = size;
      sprite.height = size;
      markDirty();
    }
    onReady?.();
  };
  img.src = TEXTURE_BASE + ACTION_BUTTON_ATLAS_FILE;
  return sprite;
}
