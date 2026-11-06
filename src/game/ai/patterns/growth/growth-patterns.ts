import type { AiPattern } from '../pattern-types';
import { ECONOMY_OPENING_PATTERN } from './economy-opening';
import { EXPLORE_FRONTIER_PATTERN } from './explore-frontier';
import { REPAIR_BUILDING_PATTERN } from './repair-building';
import { SPAWN_SPECIAL_UNIT_PATTERN } from './spawn-special-unit';
import { SPECIAL_UNIT_ABILITIES_PATTERN } from './special-unit-abilities';

export const GROWTH_PATTERNS: AiPattern[] = [
  REPAIR_BUILDING_PATTERN,
  EXPLORE_FRONTIER_PATTERN,
  SPAWN_SPECIAL_UNIT_PATTERN,
  ECONOMY_OPENING_PATTERN,
  SPECIAL_UNIT_ABILITIES_PATTERN,
];
