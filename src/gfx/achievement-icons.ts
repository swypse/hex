import type { Sprite } from 'pixi.js';
import { ACHIEVEMENT_ATLAS_FILE, ACHIEVEMENT_ATLAS_CELL, ACHIEVEMENT_ATLAS_FRAMES } from '../atlas-data/achievement-atlas-data.gen';
import { AchievementId } from '@enums';
import { createIconAtlas } from './icon-atlas';

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

const atlas = createIconAtlas({ file: ACHIEVEMENT_ATLAS_FILE, cell: ACHIEVEMENT_ATLAS_CELL, frames: ACHIEVEMENT_ATLAS_FRAMES, tag: 'achievementIcons' });

/** All atlas keys, so other renderers can tell achievement keys apart from
 *  plain texture file names (e.g. tribe icons). */
export const ACHIEVEMENT_ATLAS_KEYS = new Set<string>(Object.values(ACHIEVEMENT_ICON_FILES));

export function makeAchievementIcon(key: string, size: number, onReady?: () => void): Sprite {
  return atlas.makeSprite(key, size, onReady);
}
