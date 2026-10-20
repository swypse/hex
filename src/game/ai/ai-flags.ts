import type { Player } from '../players';

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
  /** Idle units walk toward the nearest unexplored frontier or non-owned village over several turns
   *  instead of hovering near their own villages. */
  march: boolean;
  /** Offensive spawns pick a knight/rider/swordsman/warrior when ranged units outnumber such finishers 2:1,
   *  so a ranged garrison kill is followed by a unit that can step onto the emptied village. */
  finishers: boolean;
  /** Idle units go for enemy buildings in reach, most valuable first (granary, university, farm,
   *  mine, sawmill): catapults siege them, other units burn farms and granaries. */
  raidBuildings: boolean;
  /** Planned steps get a one-step safety review (empty-village and lethal-tile moves are rejected) on difficulties that use it. */
  lookahead: boolean;
  /** Units near an enemy village gather, then strike it together instead of one by one. Off by
   *  default: two 80-game benches (7-hex/2-unit and 5-hex/3-unit variants) both came out worse
   *  (wins 43%/48% vs 57%/53%, fewer enemy villages captured, more own villages lost). */
  siege: boolean;
  /** Group attacks are planned: ordered by role, only as many units as the kill needs, one unit held to take
   *  the village, and the recently hit village is favoured by attacks and hunts. */
  attackPlan: boolean;
  /** The AI posts orders for materials it lacks, answers other players' orders with spare stock and picks proposals. */
  trade: boolean;
}

/** Shipped defaults. `multiSpecial` stays off: a 160-game benchmark showed no gain (44% wins,
 *  equal score). `composition` stays off: see its doc comment. `operations` is on, placed after
 *  the solo-hunt/naval patterns so it only ever claims units those left idle — an earlier
 *  placement ahead of them regressed the AI (44% wins, fewer enemy villages captured) by pulling
 *  units off easy solo kills to wait for the group. */
const DEFAULT_AI_FLAGS: AiFlags = { militarySkills: true, berserkerHold: true, stunnerHunt: true, multiSpecial: false, operations: true, composition: false, stoneFocus: true, march: true, finishers: true, raidBuildings: true, lookahead: true, siege: false, attackPlan: true, trade: true };
export const ALL_AI_FLAGS_ON: AiFlags = { militarySkills: true, berserkerHold: true, stunnerHunt: true, multiSpecial: true, operations: true, composition: true, stoneFocus: true, march: true, finishers: true, raidBuildings: true, lookahead: true, siege: false, attackPlan: true, trade: true };
export const ALL_AI_FLAGS_OFF: AiFlags = { militarySkills: false, berserkerHold: false, stunnerHunt: false, multiSpecial: false, operations: false, composition: false, stoneFocus: false, march: false, finishers: false, raidBuildings: false, lookahead: false, siege: false, attackPlan: false, trade: false };

export function flagsFor(player: Pick<Player, 'aiFlags'>): AiFlags {
  return player.aiFlags ? { ...DEFAULT_AI_FLAGS, ...player.aiFlags } : DEFAULT_AI_FLAGS;
}
