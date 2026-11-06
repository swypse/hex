import { ANTI_CATAPULT_PATTERNS } from './anti-catapult';
import { DEFENSE_PATTERNS } from './defense/defense-patterns';
import { GROWTH_PATTERNS } from './growth/growth-patterns';
import { NAVAL_PATTERNS } from './naval/naval-patterns';
import { OFFENSE_PATTERNS } from './offense/offense-patterns';
import type { AiPattern } from './pattern-types';
import { RAID_PATTERNS } from './raid/raid-patterns';
import { SIEGE_PATTERN } from './siege';
import { UNIT_PATTERNS } from './unit-role/unit-role-patterns';

/** Every tactic the AI can plan, in evaluation order (offense, defense, unit roles, building raids, naval, growth). */
export const AI_PATTERNS: AiPattern[] = [
  ...OFFENSE_PATTERNS,
  ...DEFENSE_PATTERNS,
  ...UNIT_PATTERNS,
  ...RAID_PATTERNS,
  ...ANTI_CATAPULT_PATTERNS,
  ...NAVAL_PATTERNS,
  ...GROWTH_PATTERNS,
].flatMap((p, i, all) => (i > 0 && all[i - 1]!.priority >= SIEGE_PATTERN.priority && p.priority < SIEGE_PATTERN.priority ? [SIEGE_PATTERN, p] : [p]));
