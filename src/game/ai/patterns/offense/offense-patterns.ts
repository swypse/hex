import { ENTER_VILLAGE_PATTERN } from '../enter-village';
import type { AiPattern } from '../pattern-types';
import { ATTACK_ENEMY_IN_VILLAGE_PATTERN } from './attack-enemy-in-village';
import { ATTACK_ENEMY_ON_BUILDING_PATTERN } from './attack-enemy-on-building';
import { CAPTURE_FREE_VILLAGE_PATTERN } from './capture-free-village';
import { CAPTURE_PUSH_PATTERN } from './capture-push';
import { CAPTURE_READY_VILLAGE_PATTERN } from './capture-ready-village';
import { COLLECT_BONUS_PATTERN } from './collect-bonus';
import { EXTINGUISH_FIRE_PATTERN } from './extinguish-fire';
import { FOCUS_FIRE_PATTERN } from './focus-fire';
import { REINFORCE_ENDANGERED_VILLAGE_PATTERN } from './reinforce-endangered-village';
import { RIDER_POST_ATTACK_RETREAT_PATTERN } from './rider-post-attack-retreat';
import { STALKER_RESTEALTH_PATTERN } from './stalker-restealth';
import { STALKER_SCOUT_PATTERN } from './stalker-scout';
import { STUNNER_APPROACH_STUN_PATTERN } from './stunner-approach-stun';
import { STUNNER_PREFER_STUN_PATTERN } from './stunner-prefer-stun';
import { UPGRADE_SHIP_PATTERN } from './upgrade-ship';

export const OFFENSE_PATTERNS: AiPattern[] = [
  CAPTURE_READY_VILLAGE_PATTERN,
  EXTINGUISH_FIRE_PATTERN,
  RIDER_POST_ATTACK_RETREAT_PATTERN,
  UPGRADE_SHIP_PATTERN,
  STUNNER_PREFER_STUN_PATTERN,
  STUNNER_APPROACH_STUN_PATTERN,
  ATTACK_ENEMY_IN_VILLAGE_PATTERN,
  ATTACK_ENEMY_ON_BUILDING_PATTERN,
  ENTER_VILLAGE_PATTERN,
  FOCUS_FIRE_PATTERN,
  STALKER_RESTEALTH_PATTERN,
  STALKER_SCOUT_PATTERN,
  CAPTURE_FREE_VILLAGE_PATTERN,
  COLLECT_BONUS_PATTERN,
  REINFORCE_ENDANGERED_VILLAGE_PATTERN,
  CAPTURE_PUSH_PATTERN,
];
