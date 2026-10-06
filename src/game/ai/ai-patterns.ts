import type { AiPattern } from './ai-pattern-helpers';
import { DEFENSE_PATTERNS } from './patterns/defense';
import { GROWTH_PATTERNS } from './patterns/growth';
import { NAVAL_PATTERNS } from './patterns/naval';
import { OFFENSE_PATTERNS } from './patterns/offense';
import { UNIT_PATTERNS } from './patterns/units';

export * from './ai-pattern-helpers';

/** Every tactic the AI can plan, in evaluation order (offense, defense, unit roles, naval, growth). */
export const AI_PATTERNS: AiPattern[] = [...OFFENSE_PATTERNS, ...DEFENSE_PATTERNS, ...UNIT_PATTERNS, ...NAVAL_PATTERNS, ...GROWTH_PATTERNS];
