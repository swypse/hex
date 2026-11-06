import type { AiPattern } from '../pattern-types';
import { ARCHER_KITE_PATTERN } from './archer-kite';
import { BANNER_POSITION_PATTERN } from './banner-position';
import { BUILDER_WORK_PATTERN } from './builder-work';
import { HUNT_IDLE_ENEMY_PATTERN } from './hunt-idle-enemy';
import { RETREAT_HEAL_PATTERN } from './retreat-heal';
import { TRAPPER_LAY_PATTERN } from './trapper-lay';

export const UNIT_PATTERNS: AiPattern[] = [
  BANNER_POSITION_PATTERN,
  BUILDER_WORK_PATTERN,
  TRAPPER_LAY_PATTERN,
  RETREAT_HEAL_PATTERN,
  ARCHER_KITE_PATTERN,
  HUNT_IDLE_ENEMY_PATTERN,
];
