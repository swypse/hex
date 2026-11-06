import type { AiPattern } from '../pattern-types';
import { RAID_ENEMY_BUILDINGS_PATTERN } from './raid-enemy-buildings';
import { RAID_MARCH_PATTERN } from './raid-march';

export const RAID_PATTERNS: AiPattern[] = [
  RAID_ENEMY_BUILDINGS_PATTERN,
  RAID_MARCH_PATTERN,
];
