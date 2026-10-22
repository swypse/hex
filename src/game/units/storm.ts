import { type GameMap, type MapTile } from '../map/map-gen';
import { hexDistance } from '../map/hex';
import { isWaterType } from '../map/tile-types';
import { type Player } from '../players';
import { type Unit } from './units';
import { randomInt } from '../../util/random';
import { UnitType } from '@enums';

/** Turns after a cast before the owner can storm again (shared by the whole tribe). */
export const STORM_COOLDOWN_TURNS = 3;

/** Whether the player's storm has recharged on `turn`. */
export function stormReady(player: Pick<Player, 'stormReadyTurn'>, turn: number): boolean {
  return (player.stormReadyTurn ?? 0) <= turn;
}

/** Turns left until the player can storm again (0 when ready). */
export function stormTurnsLeft(player: Pick<Player, 'stormReadyTurn'>, turn: number): number {
  return Math.max(0, (player.stormReadyTurn ?? 0) - turn);
}

/** Hex radius around the stormcaller that a storm covers. */
export const STORM_RADIUS = 5;

/** Water tiles within `STORM_RADIUS` of the stormcaller, whoever owns them. */
export function stormWaterTiles(map: GameMap, unit: Unit): MapTile[] {
  const tile = map.tiles.find((t) => t.unit === unit);
  if (!tile) return [];
  return map.tiles.filter((t) => isWaterType(t.terrain) && hexDistance(tile, t) <= STORM_RADIUS);
}

/** Whether the stormcaller can storm: any tile will do, as long as some water is in range. */
export function stormEligible(map: GameMap, unit: Unit): boolean {
  return unit.type === UnitType.STORMCALLER && stormWaterTiles(map, unit).length >= 1;
}

/** Ships (enemy or pirate) standing on the storm's water tiles. */
export function stormTargetShips(map: GameMap, unit: Unit): MapTile[] {
  return stormWaterTiles(map, unit).filter(
    (t) => t.unit !== null && (t.unit.shipLevel !== undefined || t.unit.type === UnitType.PIRATE) && t.unit.owner !== unit.owner,
  );
}

/** Damage range the storm rolls for each affected ship. No miss, no counter. */
export const STORM_DAMAGE_MIN = 30;
export const STORM_DAMAGE_MAX = 60;

/** Damage the storm deals to one ship: random in `STORM_DAMAGE_MIN`-`STORM_DAMAGE_MAX`. */
export function stormDamage(rng: () => number = Math.random): number {
  return randomInt(STORM_DAMAGE_MIN, STORM_DAMAGE_MAX, rng);
}
