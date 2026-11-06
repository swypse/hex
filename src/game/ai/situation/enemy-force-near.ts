import { hexDistance } from '../../map/hex';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { attackDamage } from '../../units/combat';
import { visibleEnemies } from './visible-enemies';

/** Attack force of the visible enemy units (not pirates) within `radius` hexes of `target`. */
export function enemyForceNear(map: GameMap, player: Player, target: { q: number; r: number }, radius: number): number {
  let total = 0;
  for (const e of visibleEnemies(map, player.index)) {
    if (e.unit.owner >= 0 && hexDistance(e.tile, target) <= radius) total += attackDamage(e.unit);
  }
  return total;
}
