import type { AiPattern } from '../pattern-types';
import { NAVAL_BOARD_SHIP_PATTERN } from './naval-board-ship';
import { NAVAL_BUILD_PORT_PATTERN } from './naval-build-port';
import { NAVAL_HUNT_PATTERN } from './naval-hunt';
import { NAVAL_OPEN_SKILLS_PATTERN } from './naval-open-skills';
import { NAVAL_POSITION_CATAPULT_PATTERN } from './naval-position-catapult';

export const NAVAL_PATTERNS: AiPattern[] = [
  NAVAL_OPEN_SKILLS_PATTERN,
  NAVAL_BUILD_PORT_PATTERN,
  NAVAL_BOARD_SHIP_PATTERN,
  NAVAL_HUNT_PATTERN,
  NAVAL_POSITION_CATAPULT_PATTERN,
];
