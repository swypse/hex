import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { berserkerRage } from '../../units/abilities';
import { attackableTargets } from '../../units/combat';
import type { Unit } from '../../units/units';
import { flagsFor } from '../config/flags';

/** A raging berserker (<=35% hp) takes no counter-damage when it attacks, so
 *  when it can strike now it presses on instead of retreating. */
export function berserkerShouldPress(map: GameMap, player: Player, unit: Unit): boolean {
  if (!flagsFor(player).berserkerHold) return false;
  if (berserkerRage(unit) <= 0) return false;
  return attackableTargets(map, unit, player.index).some((a) => a.unit !== null);
}
