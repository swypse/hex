import type { Player } from './players';

/** Independently switchable AI behaviours. The benchmark turns them on/off on
 *  alternating seats to measure each one against the previous behaviour. */
export interface AiFlags {
  /** Swordsman/riding/knights are researched early instead of last. */
  militarySkills: boolean;
  /** A raging berserker that can strike keeps fighting instead of retreating. */
  berserkerHold: boolean;
  /** The stunner walks into stun range and walks into stun range. */
  stunnerHunt: boolean;
  /** Berserkers and stunners are fielded in proportion to the army, not once. */
  multiSpecial: boolean;
  /** Idle units gather into a squad and advance on an enemy village together. */
  operations: boolean;
}

/** Shipped defaults. `multiSpecial` and `operations` stay off: 160-game benchmarks showed no gain
 *  (multiSpecial 44% wins with equal score; operations 44% wins and fewer enemy villages captured). */
export const DEFAULT_AI_FLAGS: AiFlags = { militarySkills: true, berserkerHold: true, stunnerHunt: true, multiSpecial: false, operations: false };
export const ALL_AI_FLAGS_ON: AiFlags = { militarySkills: true, berserkerHold: true, stunnerHunt: true, multiSpecial: true, operations: true };
export const ALL_AI_FLAGS_OFF: AiFlags = { militarySkills: false, berserkerHold: false, stunnerHunt: false, multiSpecial: false, operations: false };

export function flagsFor(player: Pick<Player, 'aiFlags'>): AiFlags {
  return player.aiFlags ? { ...DEFAULT_AI_FLAGS, ...player.aiFlags } : DEFAULT_AI_FLAGS;
}
