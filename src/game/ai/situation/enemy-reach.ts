import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import { attackDamage } from '../../units/combat';
import { isShip, shipAttackDistance, shipMovePoints } from '../../units/ship';
import { type Unit, movePoints, UNIT_ATTACK_DISTANCE } from '../../units/units';
import { AI_TUNING, LETHAL_FORCE_RATIO } from '../config/tuning';
import { visibleEnemies } from './visible-enemies';

/** Movement and attack reach of a unit in hexes, honoring ship stat tables.
 *  Ships keep their land-unit `.type`, so the raw MOVE_POINTS/ATTACK_DISTANCE
 *  tables drastically underestimate a levelled enemy ship's strike zone.
 *  Move points are converted to flat-land hexes via the standard 10-point
 *  tile cost. */
export function enemyReach(unit: Unit): { move: number; attack: number } {
  if (isShip(unit)) return { move: shipMovePoints(unit) / 10, attack: shipAttackDistance(unit) };
  return { move: movePoints(unit) / 10, attack: UNIT_ATTACK_DISTANCE[unit.type] };
}

export function enemyReachSum(unit: Unit): number {
  const r = enemyReach(unit);
  return r.move + r.attack;
}

export function enemyCanReach(map: GameMap, tile: MapTile, playerIndex: number, turns: number = AI_TUNING.garrisonHorizonTurns): boolean {
  return visibleEnemies(map, playerIndex).some((e) => hexDistance(tile, e.tile) <= enemyReach(e.unit).move * turns);
}

/** Like `enemyCanReach` but ignoring pirates (owner -1): pirates never
 *  capture or occupy villages, so garrison/spawn decisions ignore them. */
export function landEnemyCanReach(map: GameMap, tile: MapTile, playerIndex: number, turns: number = AI_TUNING.garrisonHorizonTurns): boolean {
  return visibleEnemies(map, playerIndex).some((e) => e.unit.owner >= 0 && hexDistance(tile, e.tile) <= enemyReach(e.unit).move * turns);
}

export function enemyCanAttackNext(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  return visibleEnemies(map, playerIndex).some((e) => hexDistance(tile, e.tile) <= enemyReachSum(e.unit));
}

/** Combined attack force of every enemy that could move and attack `tile` this
 *  turn — a graded measure of how exposed a tile is, for weighing risky
 *  positions instead of the flat `enemyCanAttackNext` yes/no flag. Doesn't
 *  model defense, order of attacks, or counters: it is a cheap proxy, not a
 *  combat simulation, but a tile several weak enemies can gang up on is
 *  correctly rated worse than one only a single enemy can reach. */
export function incomingForceAt(map: GameMap, tile: MapTile, playerIndex: number): number {
  let total = 0;
  for (const e of visibleEnemies(map, playerIndex)) {
    if (hexDistance(tile, e.tile) <= enemyReachSum(e.unit)) total += attackDamage(e.unit);
  }
  return total;
}

/** A tile where the combined enemy force alone is likely to kill the unit,
 *  even ignoring its own defense — worth avoiding outright rather than just
 *  weighing down, unless it is the only option. */
export function isLikelyLethal(map: GameMap, tile: MapTile, playerIndex: number, unit: Unit): boolean {
  if (!AI_TUNING.gradedThreat) return false;
  return incomingForceAt(map, tile, playerIndex) >= unit.hp * LETHAL_FORCE_RATIO;
}
