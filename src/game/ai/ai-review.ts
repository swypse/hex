import { type GameMap, type MapTile } from '../map/map-gen';
import { type Player } from '../players';
import { tileAt } from '../map/tile-index';
import { type AiAction, type AiPlannerState } from './ai-types';
import { isLikelyLethal, key, landEnemyCanReach } from './ai-pattern-helpers';
import { AiActionType } from '@enums';

/** One-step lookahead on a planned step, before it is executed: would the board
 *  after it be worse in a way the pattern that proposed it did not weigh?
 *  Returns true to reject the step so the planner tries the next pattern.
 *
 *  Rejected:
 *  - a move that leaves an own village empty while an enemy can reach it next
 *    turn, unless the same step raises a new defender there;
 *  - a move (without an attack) from a safe tile onto a tile where the enemy
 *    force alone would likely kill the unit, unless the destination is an own
 *    village (defending it) or the step captures. */
export function stepVetoed(map: GameMap, player: Player, step: AiAction[], state: AiPlannerState): boolean {
  const move = step.find((a): a is Extract<AiAction, { type: AiActionType.MOVE }> => a.type === AiActionType.MOVE);
  if (!move) return false;
  const from = findUnitTile(map, player.index, move.unitId);
  const dest = tileAt(map, move.q, move.r);
  if (!from?.unit || !dest) return false;
  const unit = from.unit;

  if (from.settlement?.owner === player.index && !state.occupied.has(key(from.q, from.r))) {
    const replaced = step.some((a) => a.type === AiActionType.SPAWN && a.q === from.q && a.r === from.r);
    if (!replaced && landEnemyCanReach(map, from, player.index, 1)) return true;
  }

  const attacks = step.some((a) => a.type === AiActionType.ATTACK);
  const capture = dest.settlement !== null && dest.settlement.owner !== player.index;
  const ownVillage = dest.settlement?.owner === player.index;
  if (!attacks && !capture && !ownVillage && !isLikelyLethal(map, from, player.index, unit) && isLikelyLethal(map, dest, player.index, unit)) return true;
  return false;
}

function findUnitTile(map: GameMap, playerIndex: number, unitId: string): MapTile | undefined {
  return map.tiles.find((t) => t.unit?.id === unitId && t.unit.owner === playerIndex);
}
