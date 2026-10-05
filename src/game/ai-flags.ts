import type { Player } from './players';

/** Independently switchable AI behaviours. The benchmark turns them on/off on
 *  alternating seats to measure each one against the previous behaviour. */
export interface AiFlags {
  /** Swordsman/riding/knights are researched early instead of last. */
  militarySkills: boolean;
  /** A raging berserker that can strike keeps fighting instead of retreating. */
  berserkerHold: boolean;
  /** The stunner walks into stun range (2 hexes) of a strong enemy when allies can follow up. */
  stunnerHunt: boolean;
  /** Berserkers and stunners are fielded in proportion to the army, not once. */
  multiSpecial: boolean;
  /** Idle units (nothing better to do this turn) gather into a squad and advance on an enemy village together. */
  operations: boolean;
  /** Offense/defense spawns are picked by open-terrain duel counter value against the visible
   *  enemy army (per unit of effective cost) instead of a fixed unit-type priority order. Off by
   *  default: two 160-game benchmarks (offense+defense, then defense-only) both came out worse
   *  (lower win share, score, villages held) despite raising kills in the first variant. Likely
   *  cause: the duel model is open-terrain only and ignores the village/wall defense bonus a
   *  `defense` spawn actually fights behind, so it counter-picks for the wrong fight; and
   *  concentrating spawns on the single best duelist sacrifices the army diversity/mobility that
   *  grabs territory. Would need a garrison-aware duel model to be worth another try. */
  composition: boolean;
  /** While a village that could have a mine has none, money is saved for it: no spawns, upgrades,
   *  roads or buildings (except a mine, one sawmill per village, or in danger / urgent hunger). */
  stoneFocus: boolean;
}

/** Shipped defaults. `multiSpecial` stays off: a 160-game benchmark showed no gain (44% wins,
 *  equal score). `composition` stays off: see its doc comment. `operations` is on, placed after
 *  the solo-hunt/naval patterns so it only ever claims units those left idle — an earlier
 *  placement ahead of them regressed the AI (44% wins, fewer enemy villages captured) by pulling
 *  units off easy solo kills to wait for the group. */
export const DEFAULT_AI_FLAGS: AiFlags = { militarySkills: true, berserkerHold: true, stunnerHunt: true, multiSpecial: false, operations: true, composition: false, stoneFocus: true };
export const ALL_AI_FLAGS_ON: AiFlags = { militarySkills: true, berserkerHold: true, stunnerHunt: true, multiSpecial: true, operations: true, composition: true, stoneFocus: true };
export const ALL_AI_FLAGS_OFF: AiFlags = { militarySkills: false, berserkerHold: false, stunnerHunt: false, multiSpecial: false, operations: false, composition: false, stoneFocus: false };

export function flagsFor(player: Pick<Player, 'aiFlags'>): AiFlags {
  return player.aiFlags ? { ...DEFAULT_AI_FLAGS, ...player.aiFlags } : DEFAULT_AI_FLAGS;
}
