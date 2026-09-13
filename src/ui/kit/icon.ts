import { Sprite, Texture } from 'pixi.js';
import { TRIBE_ICONS_ATLAS_FRAMES } from '../../game/tribeIconsAtlasData.gen';
import { makeTribeIcon } from './tribeIcons';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;
const cache = new Map<string, Texture>();

export function makeIcon(name: string, size: number, onReady?: () => void): Sprite {
  // Tribe icons live in the single packed tribe-icons atlas.
  const base = name.endsWith('.png') ? name.slice(0, -4) : name;
  if (TRIBE_ICONS_ATLAS_FRAMES[base]) {
    const sprite = makeTribeIcon(base, size);
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