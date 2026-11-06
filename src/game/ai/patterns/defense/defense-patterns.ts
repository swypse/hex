import type { AiPattern } from '../pattern-types';
import { BUILD_TOWER_PATTERN } from './build-tower';
import { COUNTER_THREAT_PATTERN } from './counter-threat';
import { DEFEND_EMPTY_VILLAGE_PATTERN } from './defend-empty-village';
import { DEFEND_HURT_UNIT_PATTERN } from './defend-hurt-unit';
import { GARRISON_EMPTY_VILLAGE_PATTERN } from './garrison-empty-village';
import { SECURE_FREE_VILLAGE_PATTERN } from './secure-free-village';
import { UPGRADE_FOR_SWORDSMAN_PATTERN } from './upgrade-for-swordsman';

export const DEFENSE_PATTERNS: AiPattern[] = [
  UPGRADE_FOR_SWORDSMAN_PATTERN,
  SECURE_FREE_VILLAGE_PATTERN,
  DEFEND_EMPTY_VILLAGE_PATTERN,
  COUNTER_THREAT_PATTERN,
  BUILD_TOWER_PATTERN,
  GARRISON_EMPTY_VILLAGE_PATTERN,
  DEFEND_HURT_UNIT_PATTERN,
];
