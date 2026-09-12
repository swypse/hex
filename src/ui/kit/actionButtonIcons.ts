import { Rectangle, Sprite, Texture } from 'pixi.js';
import { ACTION_BUTTON_ATLAS_FILE, ACTION_BUTTON_ATLAS_CELL, ACTION_BUTTON_ATLAS_FRAMES } from '../../game/actionButtonAtlasData.gen';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** Logical button key -> atlas frame key. Atlas frames live in ACTION_BUTTON_ATLAS_FRAMES. */
export const ACTION_BUTTON_ICON_FILES: Record<string, string> = {
  upgrade: 'action-upgrade',
  'upgrade-ship': 'action-ship-upgrade',
  wall: 'action-build-wall',
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
  stats: 'action-stats',
  skills: 'action-skills',
  achievements: 'action-cup',
  'end-turn': 'action-end-turn',
};

let atlasTexture: Texture | null = null;
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

export function makeActionButtonIcon(key: string, size: number, onReady?: () => void): Sprite {
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
  img.src = TEXTURE_BASE + ACTION_BUTTON_ATLAS_FILE;
  return sprite;
}