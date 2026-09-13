import { Rectangle, Sprite, Texture } from 'pixi.js';
import { TRIBE_ICONS_ATLAS_FILE, TRIBE_ICONS_ATLAS_CELL, TRIBE_ICONS_ATLAS_FRAMES } from '../../game/tribeIconsAtlasData.gen';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

let atlasTexture: Texture | null = null;
let atlasPromise: Promise<void> | null = null;
const frameCache = new Map<string, Texture>();

function sliceFrame(key: string, atlas: Texture): Texture | null {
  const frame = TRIBE_ICONS_ATLAS_FRAMES[key];
  if (!frame) return null;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const tex = new Texture({
    source: atlas.source,
    frame: new Rectangle(frame.x, frame.y, TRIBE_ICONS_ATLAS_CELL, TRIBE_ICONS_ATLAS_CELL),
    label: key,
  });
  frameCache.set(key, tex);
  return tex;
}

/** Loads the single packed tribe-icons atlas image once and shares the same
 *  load promise with every caller. */
export function ensureTribeIconsAtlas(): Promise<void> {
  if (atlasPromise) return atlasPromise;
  atlasPromise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        atlasTexture = Texture.from(img);
      } catch {
        console.error('[tribeIcons] Texture.from failed for', TEXTURE_BASE + TRIBE_ICONS_ATLAS_FILE);
      }
      resolve();
    };
    img.onerror = () => {
      console.error('[tribeIcons] onerror for', TEXTURE_BASE + TRIBE_ICONS_ATLAS_FILE);
      resolve();
    };
    img.src = TEXTURE_BASE + TRIBE_ICONS_ATLAS_FILE;
  });
  return atlasPromise;
}

/** A tribe icon sprite sliced from the packed atlas. Frame keys are the icon
 *  base names in `src/assets/tribe-icons/` (e.g. 'cats-icon'). */
export function makeTribeIcon(key: string, size: number): Sprite {
  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size;
  if (atlasTexture) {
    const tex = sliceFrame(key, atlasTexture);
    if (tex) sprite.texture = tex;
    return sprite;
  }
  void ensureTribeIconsAtlas().then(() => {
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