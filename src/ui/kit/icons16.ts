import { Rectangle, Sprite, Texture } from 'pixi.js';
import { ICONS16_ATLAS_FILE, ICONS16_ATLAS_CELL, ICONS16_ATLAS_FRAMES } from '../../game/icons16AtlasData.gen';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** Logical 16px icon key -> atlas frame key. Atlas frames live in ICONS16_ATLAS_FRAMES. */
export const ICONS16_FILES: Record<string, string> = {
  hp: 'hp-16',
  attack: 'attack-16',
  def: 'def-16',
  upkeep: 'gold-16',
  move: 'move-16',
  village: 'village-16',
  help: 'help-16',
};

/** '16/hp-16.png' -> 'hp-16' (unitDescriptions keeps using path-style strings). */
export function icons16FrameForIconPath(path: string): string {
  return path.replace(/^16\//, '').replace(/\.png$/, '');
}

let atlasTexture: Texture | null = null;
const frameCache = new Map<string, Texture>();

function sliceFrame(key: string, atlas: Texture): Texture | null {
  const frame = ICONS16_ATLAS_FRAMES[key];
  if (!frame) return null;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const tex = new Texture({
    source: atlas.source,
    frame: new Rectangle(frame.x, frame.y, ICONS16_ATLAS_CELL, ICONS16_ATLAS_CELL),
    label: key,
  });
  frameCache.set(key, tex);
  return tex;
}

export function makeIcon16(key: string, size: number, onReady?: () => void): Sprite {
  const frameKey = ICONS16_FILES[key] ?? key;
  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size;
  if (atlasTexture) {
    const tex = sliceFrame(frameKey, atlasTexture);
    if (tex) sprite.texture = tex;
    onReady?.();
    return sprite;
  }
  const img = new Image();
  img.onload = () => {
    atlasTexture = Texture.from(img);
    const tex = sliceFrame(frameKey, atlasTexture);
    if (sprite.destroyed) return;
    if (tex) {
      sprite.texture = tex;
      sprite.width = size;
      sprite.height = size;
    }
    onReady?.();
  };
  img.src = TEXTURE_BASE + ICONS16_ATLAS_FILE;
  return sprite;
}