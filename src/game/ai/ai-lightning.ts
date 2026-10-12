import { type GameMap, type MapTile } from '../map/map-gen';
import { isForestType } from '../map/tile-types';
import { isFlammable } from '../weather/fire';
import { lightningVillages } from '../units/lightning';

/** How much a lightning on `village` is worth to `playerIndex`: enemy units and
 *  flammable buildings in its territory count for, forests slightly, own units
 *  and own buildings against (the bolt lands on a random cell of the territory). */
function lightningValue(map: GameMap, village: MapTile, playerIndex: number): number {
  let value = 0;
  for (const t of map.tiles) {
    const c = t.claimedByVillage;
    if (!c || c.q !== village.q || c.r !== village.r) continue;
    if (t.unit) value += t.unit.owner === playerIndex ? -4 : 3;
    if (t.building && isFlammable(t)) value += t.ownedBy === playerIndex ? -2 : 2;
    else if (isForestType(t.terrain) && !t.fire) value += t.ownedBy === playerIndex ? -0.5 : 0.5;
  }
  return value;
}

/** The enemy village in reach of the stormcaller at `from` a lightning is best
 *  called onto (null when none is explored, in range and worth it). */
export function bestLightningVillage(map: GameMap, playerIndex: number, from: { q: number; r: number }): MapTile | null {
  let best: MapTile | null = null;
  let bestValue = 0;
  for (const t of lightningVillages(map, playerIndex, from)) {
    const owner = t.settlement?.owner;
    if (owner === null || owner === undefined || owner === playerIndex) continue;
    const value = lightningValue(map, t, playerIndex);
    if (value > bestValue) {
      best = t;
      bestValue = value;
    }
  }
  return best;
}
