import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import type { Unit } from '../../units/units';
import type { AiPlannerState } from '../types/planner-state';
import { rankMember } from './gang-member';

/** Expected damage must reach this multiple of the target's hp: misses happen. */
export const KILL_MARGIN = 1.15;

/** What a gang-up on `target` is expected to do, from the real combat formula
 *  (defense, terrain, wounded attackers): total damage dealt, counter damage
 *  the attackers take, and whether the damage clears the kill margin. */
export function gangForecast(
  map: GameMap,
  player: Player,
  target: MapTile,
  attackers: { unit: Unit; moveTo: MapTile | null }[],
  state: AiPlannerState,
): { damage: number; counter: number; lethal: boolean } {
  const members = attackers.map((a) => rankMember(map, player, target, a, state));
  const damage = members.reduce((s, m) => s + m.damage, 0);
  const counter = members.reduce((s, m) => s + m.counter, 0);
  return { damage, counter, lethal: damage >= target.unit!.hp * KILL_MARGIN };
}
