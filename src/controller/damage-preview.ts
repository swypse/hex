import { type GameMap, type MapTile } from '../game/map/map-gen';
import { type Selection } from '../game/units/selection';
import { isExploredFor } from '../game/map/explore';
import { SelectionKind } from '@enums';

/** Whether a long-press on `tile` should start a damage preview, and returns
 *  the enemy tile to preview when it should (null otherwise). A preview needs
 *  the local player to hold a unit selection and press an explored enemy unit
 *  — the enemy never has to be within attack range. */
export function damagePreviewVictim(
  map: GameMap,
  selection: Selection | null,
  localPlayerIndex: number,
  tile: MapTile | null,
): MapTile | null {
  if (!selection || selection.kind !== SelectionKind.UNIT) return null;
  if (!tile || !tile.unit) return null;
  if (tile.unit.owner === localPlayerIndex) return null;
  if (!isExploredFor(tile, localPlayerIndex)) return null;
  const attacker = map.tiles.find((t) => t.q === selection.q && t.r === selection.r)?.unit;
  if (!attacker || attacker.owner !== localPlayerIndex) return null;
  return tile;
}