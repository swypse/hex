/** The assault is called off when the defenders' power exceeds the squad's by this factor. */
export const ASSAULT_ABORT_RATIO = 1.5;

/** A called-off or new assault starts only when the defenders' power is at most this share of the squad's. */
export const ASSAULT_START_RATIO = 1;

/** The squad has a clear advantage (no reinforcements wanted) at this multiple of the defenders' power. */
export const ASSAULT_ADVANTAGE_RATIO = 2;

/** Own villages within this many hexes of the target raise reinforcements. */
export const REINFORCE_MAX_DIST = 8;

/** At most this many own villages (nearest to the target) raise reinforcements. */
export const REINFORCE_VILLAGES = 2;

/** Defenders outweigh the squad so much that the assault should stop. */
export function assaultFailing(squadPower: number, defenderPower: number): boolean {
  return defenderPower > squadPower * ASSAULT_ABORT_RATIO;
}

/** The squad can take the village in theory: it outguns the defenders. */
export function assaultFeasible(squadPower: number, defenderPower: number): boolean {
  return defenderPower <= squadPower * ASSAULT_START_RATIO;
}

/** The squad lacks a clear advantage, so more units are worth raising. */
export function needsReinforcement(squadPower: number, defenderPower: number): boolean {
  return defenderPower > 0 && squadPower < defenderPower * ASSAULT_ADVANTAGE_RATIO;
}
