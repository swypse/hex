import { Rectangle, Sprite, Texture } from 'pixi.js';
import type { SkillId } from '../../game/skills';
import { SKILL_ATLAS_FILE, SKILL_ATLAS_CELL, SKILL_ATLAS_FRAMES } from '../../game/skillAtlasData.gen';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** Skill id -> atlas frame key. Atlas frames live in SKILL_ATLAS_FRAMES. */
export const SKILL_ICON_FILES: Partial<Record<SkillId, string>> = {
  climbing: 'skill-climbing',
  smithery: 'skill-smithery',
  swordsman: 'skill-swordsman',
  geology: 'skill-geology',
  water: 'skill-water',
  waterTemples: 'skill-water-temples',
  navigation: 'skill-navigation',
  forestry: 'skill-forestry',
  forestTemple: 'skill-forest-temples',
  science: 'skill-science',
  roads: 'skill-roads',
  shields: 'skill-shields',
  defense: 'skill-defense',
  catapult: 'skill-catapult',
  riding: 'skill-riding',
  bridges: 'skill-bridges',
  knights: 'skill-knights',
};

let atlasTexture: Texture | null = null;
const frameCache = new Map<string, Texture>();

function sliceFrame(key: string, atlas: Texture): Texture | null {
  const frame = SKILL_ATLAS_FRAMES[key];
  if (!frame) return null;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const tex = new Texture({
    source: atlas.source,
    frame: new Rectangle(frame.x, frame.y, SKILL_ATLAS_CELL, SKILL_ATLAS_CELL),
    label: key,
  });
  frameCache.set(key, tex);
  return tex;
}

export function makeSkillIcon(key: string, size: number, onReady?: () => void): Sprite {
  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size;
  if (atlasTexture) {
    const tex = sliceFrame(key, atlasTexture);
    if (tex) sprite.texture = tex;
    onReady?.();
    return sprite;
  }
  const img = new Image();
  img.onload = () => {
    atlasTexture = Texture.from(img);
    const tex = sliceFrame(key, atlasTexture);
    if (sprite.destroyed) return;
    if (tex) {
      sprite.texture = tex;
      sprite.width = size;
      sprite.height = size;
    }
    onReady?.();
  };
  img.src = TEXTURE_BASE + SKILL_ATLAS_FILE;
  return sprite;
}