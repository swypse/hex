import { Rectangle, Sprite, Texture } from 'pixi.js';
import { ICONS32_ATLAS_FILE, ICONS32_ATLAS_CELL, ICONS32_ATLAS_FRAMES } from '../../game/icons32-atlas-data.gen';
import { ensureCanvasResource } from '../../render/image-texture';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

let atlasTexture: Texture | null = null;
let atlasPromise: Promise<void> | null = null;
const frameCache = new Map<string, Texture>();

function sliceFrame(key: string, atlas: Texture): Texture | null {
  const frame = ICONS32_ATLAS_FRAMES[key];
  if (!frame) return null;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const tex = new Texture({
    source: atlas.source,
    frame: new Rectangle(frame.x, frame.y, ICONS32_ATLAS_CELL, ICONS32_ATLAS_CELL),
    label: key,
  });
  frameCache.set(key, tex);
  return tex;
}

/** Loads the single packed 32px icons atlas once and shares the same load
 *  promise with every caller. */
export function ensureIcons32Atlas(): Promise<void> {
  if (atlasPromise) return atlasPromise;
  atlasPromise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        atlasTexture = Texture.from(img);
        ensureCanvasResource(atlasTexture);
      } catch {
        console.error('[icons32] Texture.from failed for', TEXTURE_BASE + ICONS32_ATLAS_FILE);
      }
      resolve();
    };
    img.onerror = () => {
      console.error('[icons32] onerror for', TEXTURE_BASE + ICONS32_ATLAS_FILE);
      resolve();
    };
    img.src = TEXTURE_BASE + ICONS32_ATLAS_FILE;
  });
  return atlasPromise;
}

/** Directly returns the atlas texture for a frame key (no sprite). Use after
 *  `ensureIcons32Atlas`; null when the atlas is unavailable. */
export function icons32FrameTexture(key: string): Texture | null {
  if (!atlasTexture) return null;
  return sliceFrame(key, atlasTexture);
}

/** A 32px icon sprite sliced from the packed atlas. Frame keys are the icon
 *  base names in `src/assets/32/` (e.g. 'water-protection-32'). */
export function makeIcon32(key: string, size: number): Sprite {
  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size;
  if (atlasTexture) {
    const tex = sliceFrame(key, atlasTexture);
    if (tex) sprite.texture = tex;
    return sprite;
  }
  void ensureIcons32Atlas().then(() => {
    if (sprite.destroyed) return;
    const tex = sliceFrame(key, atlasTexture!);
    if (tex) {
      sprite.texture = tex;
      sprite.width = size;
      sprite.height = size;
    }
  });
  return sprite;
}