import type { GameMap, MapTile } from '../../map/map-gen';
import type { Unit } from '../../units/units';
import { incomingDamage } from './spawn-would-be-killed';

/** Hp `unit` would have left standing on `village` after the enemy's next
 *  turn (<= 0: it dies). A real unit counts at its current hp, so a 1-hp unit
 *  never "holds" a village an enemy can reach. */
export function holdMargin(map: GameMap, village: MapTile, playerIndex: number, unit: Unit): number {
  return unit.hp - incomingDamage(map, village, playerIndex, unit);
}

/** Whether `unit` would survive the enemy's next turn on its own `village`. */
export function unitHoldsVillage(map: GameMap, village: MapTile, playerIndex: number, unit: Unit): boolean {
  return holdMargin(map, village, playerIndex, unit) > 0;
}
