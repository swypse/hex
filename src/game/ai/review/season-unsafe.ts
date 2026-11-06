import { Season } from '@enums';
import { willFreeze } from '../../map/ice';
import type { GameMap, MapTile } from '../../map/map-gen';
import { TileType } from '../../map/tile-types';
import { SEASON_LENGTH, seasonForTurn, seasonTurn } from '../../season';
import type { Unit } from '../../units/units';

/** Whether `turn` is the last turn of `season` (the season flips right after it). */
export function lastTurnOf(turn: number, season: Season): boolean {
  return turn > 0 && seasonForTurn(turn) === season && seasonTurn(turn) === SEASON_LENGTH;
}

/** A tile that turns deadly for `unit` when the current turn ends:
 *  - last winter turn: ice melts and kills whoever stands on it;
 *  - last autumn turn: coast water freezes and turns ships into land units. */
export function seasonUnsafe(map: GameMap, turn: number, tile: MapTile, unit: Unit): boolean {
  if (lastTurnOf(turn, Season.WINTER)) return tile.terrain === TileType.Ice;
  if (lastTurnOf(turn, Season.AUTUMN) && unit.shipLevel !== undefined) {
    return tile.terrain === TileType.Water && willFreeze(map, tile);
  }
  return false;
}
