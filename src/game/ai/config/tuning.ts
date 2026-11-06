

/** A visible stalker within this many hexes of an enemy re-hides instead of
 *  staying exposed (stealth costs a whole turn, so far-from-danger stalkers
 *  keep scouting instead of hiding pointlessly). */
export const STALKER_STEALTH_RADIUS = 6;

/** Minimum attack force of an enemy worth walking the stunner up to. */
export const STUN_MIN_DAMAGE = 15;

/** Turns of enemy movement the garrison logic looks ahead. Taking a village
 *  needs an arrival turn plus a hold turn, so a defender who leaves when the
 *  enemy is two moves away can no longer get back in time. */
export const AI_TUNING = { garrisonHorizonTurns: 2, gradedThreat: true };

export const LETHAL_FORCE_RATIO = 0.9;

/** Scoring weight so a single average attacker (~20-25 force) costs about as
 *  much as the old flat -200 threat penalty; a second attacker stacks on top
 *  instead of being invisible to the score. */
export const INCOMING_FORCE_WEIGHT = 8;

/** Penalty for a likely-lethal tile, so it only wins when every reachable
 *  option is rated just as bad. */
export const LETHAL_PENALTY = 100000;

/** Score bonus for the enemy village the AI hit recently, so attacks and hunts
 *  keep converging on it instead of wandering to other targets. */
export const HIT_VILLAGE_BONUS = 80;

/** Turns after which a hit village is forgotten. */
export const HIT_VILLAGE_MEMORY = 3;
