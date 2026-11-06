import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import type { Unit } from '../../units/units';
import type { AiPlannerState } from '../types/planner-state';

/** The player's units that have neither moved nor acted in the plan so far, with their tiles. */
export function idleUnits(map: GameMap, player: Player, state: AiPlannerState): { tile: MapTile; unit: Unit }[] {
  const out: { tile: MapTile; unit: Unit }[] = [];
  for (const tile of map.tiles) {
    const unit = tile.unit;
    if (!unit || unit.owner !== player.index) continue;
    if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
    out.push({ tile, unit });
  }
  return out;
}
