import { Sprite } from 'pixi.js';
import { SKILL_ATLAS_FILE, SKILL_ATLAS_CELL, SKILL_ATLAS_FRAMES } from '../atlas-data/skill-atlas-data.gen';
import { SkillId } from '@enums';
import { createIconAtlas } from './icon-atlas';

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
  agriculture: 'skill-agriculture',
  granary: 'skill-granary',
};

const atlas = createIconAtlas({ file: SKILL_ATLAS_FILE, cell: SKILL_ATLAS_CELL, frames: SKILL_ATLAS_FRAMES, tag: 'skillIcons' });

export function makeSkillIcon(key: string, size: number, onReady?: () => void): Sprite {
  return atlas.makeSprite(key, size, onReady);
}
