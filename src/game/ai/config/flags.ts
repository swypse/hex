import type { Player } from '../../players';

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
  /** Village upgrades (level 3+) wait while the village still has two or more free unit slots, so money goes
   *  into units first instead of tall villages holding one unit. */
  armyFirst: boolean;
  /** The opening builds the first farm right after the sawmill, before the mine (two skills away), so food is up before winter. Off by default: sawmill and mine first, then farms. */
  earlyFarm: boolean;
  /** Focus fire judges the gang-up by the real combat formula (defense, terrain) instead of nominal attack, and among lethal gangs prefers
   *  valuable targets that cost the fewest counters. */
  killChains: boolean;
  /** While an own village stands empty within an enemy's reach and the money cannot buy a warrior, nothing else is bought
   *  (upgrades, buildings, roads, skills, spawns elsewhere), so the village can raise a defender next turn. */
  garrisonReserve: boolean; // Off by default until benchmarked (FLAGS=garrisonReserve RAIDER=1).
  /** The AI joins its separate village networks with roads or ports (whichever is cheaper) and extends a road toward the nearest known
   *  enemy village, once food and upgrades are served. */
  networkLinks: boolean; // 160 games vs the raider: wins/seat 0.41 vs 0.26, villages +0.34 (1.6 sigma), score +47.
  /** The AI posts orders for materials it lacks, answers other players' orders with spare stock and picks proposals. */
  trade: boolean;
  /** Villages pressed by 3+ enemy units get a tower (and the Shields → Defense → Tower skills) between them and the enemy. */
  towers: boolean;
  /** While the army is below `ARMY_FLOOR_UNITS` land units, spawns are not held back by the stone focus (a missing mine), so the AI always fields a minimum force. */
  armyFloor: boolean;
  /** The capital's opening build order gates only buildings on the capital's own land; other villages (captured ones) build their mine and sawmill at once. */
  localOpening: boolean;
  /** An army goal with a target moves choose -> muster -> assault (it used to stay in `choose`, so its muster directive never applied). */
  musterPhase: boolean;
  /** Farms are built while the food balance is below `FOOD_HEADROOM` (room for about two more units), not only once it is nearly negative: units eat food, so the army is capped by farms. */
  /** A farm may be built during the capital's opening as soon as food is under any pressure (not only urgent), instead of waiting for the opening's granary stage. */
  earlyFoodFarm: boolean; // 120 games: attacks per game +18% in 12/12 seat cells, starvation hits -9%.
  /** Wounded idle units (below half hp) that no enemy can hit rest in place and heal instead of scouting or marching. */
  /** While the capital's opening waits for a skill (e.g. Smithery for the mine), other skill plans (naval chain, generic order) do not spend the money. */
  openingSkillFirst: boolean;
  /** Healthy idle units walk to enemy villages that stand empty and capture them (after the solo hunts, before building raids). */
  emptyRaid: boolean;
  /** A squad operation starts with 1 unit against an undefended target and 2 against a defended one (3 before): armies are small, so a squad of 3 almost never formed. */
  smallSquads: boolean;
  /** Offensive spawns pick the type with the best net edge against the visible enemy village garrisons (defense bonus included), per unit of cost. */
  assaultType: boolean;
  recoverWounded: boolean; // Off by default: 120 games, captures and starvation hits unchanged, attacks slightly down.
  foodHeadroom: boolean; // Off by default: 120 games, aggressive wins 29/60 vs 36/60 without it, fewer captures.
}

/** Shipped defaults. `multiSpecial` stays off: a 160-game benchmark showed no gain (44% wins,
 *  equal score). `composition` stays off: see its doc comment. `operations` is on, placed after
 *  the solo-hunt/naval patterns so it only ever claims units those left idle — an earlier
 *  placement ahead of them regressed the AI (44% wins, fewer enemy villages captured) by pulling
 *  units off easy solo kills to wait for the group. */
const DEFAULT_AI_FLAGS: AiFlags = { militarySkills: true, berserkerHold: true, stunnerHunt: true, multiSpecial: false, operations: true, composition: false, stoneFocus: true, march: true, finishers: true, raidBuildings: true, lookahead: true, siege: false, attackPlan: true, trade: true, towers: true, armyFirst: true, earlyFarm: false, killChains: true, garrisonReserve: false, networkLinks: true, armyFloor: true, localOpening: true, musterPhase: true, foodHeadroom: false, earlyFoodFarm: true, recoverWounded: false, openingSkillFirst: false, emptyRaid: false, smallSquads: false, assaultType: false };

export const ALL_AI_FLAGS_ON: AiFlags = { militarySkills: true, berserkerHold: true, stunnerHunt: true, multiSpecial: true, operations: true, composition: true, stoneFocus: true, march: true, finishers: true, raidBuildings: true, lookahead: true, siege: false, attackPlan: true, trade: true, towers: true, armyFirst: true, earlyFarm: true, killChains: true, garrisonReserve: true, networkLinks: true, armyFloor: true, localOpening: true, musterPhase: true, foodHeadroom: true, earlyFoodFarm: true, recoverWounded: true, openingSkillFirst: true, emptyRaid: true, smallSquads: true, assaultType: true };

export const ALL_AI_FLAGS_OFF: AiFlags = { militarySkills: false, berserkerHold: false, stunnerHunt: false, multiSpecial: false, operations: false, composition: false, stoneFocus: false, march: false, finishers: false, raidBuildings: false, lookahead: false, siege: false, attackPlan: false, trade: false, towers: false, armyFirst: false, earlyFarm: false, killChains: false, garrisonReserve: false, networkLinks: false, armyFloor: false, localOpening: false, musterPhase: false, foodHeadroom: false, earlyFoodFarm: false, recoverWounded: false, openingSkillFirst: false, emptyRaid: false, smallSquads: false, assaultType: false };

export function flagsFor(player: Pick<Player, 'aiFlags'>): AiFlags {
  return player.aiFlags ? { ...DEFAULT_AI_FLAGS, ...player.aiFlags } : DEFAULT_AI_FLAGS;
}
