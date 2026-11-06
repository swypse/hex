import { SkillId } from '@enums';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { reachableTargets } from '../../units/selection';
import type { Unit } from '../../units/units';

/** Cells `unit` can move to this turn, given the climbing and navigation skills of its player. */
export function reachableCells(map: GameMap, player: Player, unit: Unit): MapTile[] {
  return reachableTargets(map, unit, undefined, hasSkill(player, SkillId.CLIMBING), hasSkill(player, SkillId.NAVIGATION), player.index);
}
