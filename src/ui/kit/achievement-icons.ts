import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { AchievementId } from '../../game/achievements';
import { ACHIEVEMENT_ATLAS_FILE, ACHIEVEMENT_ATLAS_CELL, ACHIEVEMENT_ATLAS_FRAMES } from '../../game/achievement-atlas-data.gen';
import { makeCircleChip } from './tribe-chip';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** Achievement id -> atlas frame key. Atlas frames live in ACHIEVEMENT_ATLAS_FRAMES. */
export const ACHIEVEMENT_ICON_FILES: Partial<Record<AchievementId, string>> = {
  greatConnector: 'achievement-great-connector',
  perfectChain: 'achievement-perfect-chain',
  piratePurger: 'achievement-pirate-purger',
  pirateLuckyDay: 'achievement-pirates-lucky-day',
  nothingLeftToLearn: 'achievement-nothing-to-learn',
  tenFoesNoSurvivors: 'achievement-10-kills',
  tripleSinkJob: 'achievement-3-ships-killed',
  bonusHunter: 'achievement-bonus-hunter',
  masterCartographer: 'achievement-explorer',
};

let atlasTexture: Texture | null = null;
const frameCache = new Map<string, Texture>();

/** All atlas keys, so other renderers can tell achievement keys apart from
 *  plain texture file names (e.g. tribe icons). */
export const ACHIEVEMENT_ATLAS_KEYS = new Set<string>(Object.values(ACHIEVEMENT_ICON_FILES));

function sliceFrame(key: string, atlas: Texture): Texture | null {
  const frame = ACHIEVEMENT_ATLAS_FRAMES[key];
  if (!frame) return null;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const tex = new Texture({
    source: atlas.source,
    frame: new Rectangle(frame.x, frame.y, ACHIEVEMENT_ATLAS_CELL, ACHIEVEMENT_ATLAS_CELL),
    label: key,
  });
  frameCache.set(key, tex);
  return tex;
}

export function makeAchievementIcon(key: string, size: number, onReady?: () => void): Sprite {
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
  img.src = TEXTURE_BASE + ACHIEVEMENT_ATLAS_FILE;
  return sprite;
}

/** A round chip with the given achievement atlas icon clipped inside it. */
export function makeAchievementChip(key: string, size: number, opts: { bgColor?: number; border?: { width: number; color: number } } = {}): Container {
  return makeCircleChip(makeAchievementIcon(key, size), size, opts);
}