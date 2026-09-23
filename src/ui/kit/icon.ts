import { Sprite, Texture } from 'pixi.js';
import { TRIBE_ICONS_ATLAS_FRAMES } from '../../game/tribe-icons-atlas-data.gen';
import { ICONS32_ATLAS_FRAMES } from '../../game/icons32-atlas-data.gen';
import { ensureCanvasResource } from '../../render/image-texture';
import { makeTribeIcon } from './tribe-icons';
import { makeIcon32 } from './icons32';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;
const cache = new Map<string, Texture>();

export function makeIcon(name: string, size: number, onReady?: () => void): Sprite {
  const base = name.endsWith('.png') ? name.slice(0, -4) : name;
  // Tribe icons live in the single packed tribe-icons atlas.
  if (TRIBE_ICONS_ATLAS_FRAMES[base]) {
    const sprite = makeTribeIcon(base, size);
    if (onReady) onReady();
    return sprite;
  }
  // 32px icons (buff badges, village-connected, ...) live in the 32px atlas;
  // the asset files carry a '-32' suffix.
  if (ICONS32_ATLAS_FRAMES[base] || ICONS32_ATLAS_FRAMES[`${base}-32`]) {
    const sprite = makeIcon32(ICONS32_ATLAS_FRAMES[base] ? base : `${base}-32`, size);
    if (onReady) onReady();
    return sprite;
  }
  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size;
  const cached = cache.get(name);
  if (cached) {
    sprite.texture = cached;
    return sprite;
  }
  const img = new Image();
  img.onload = () => {
    const tex = Texture.from(img);
    ensureCanvasResource(tex);
    cache.set(name, tex);
    if (sprite.destroyed) return;
    sprite.texture = tex;
    sprite.width = size;
    sprite.height = size;
    onReady?.();
  };
  img.src = TEXTURE_BASE + name;
  return sprite;
}