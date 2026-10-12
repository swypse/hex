import { isExploredFor } from '../map/explore';
import { hexDistance } from '../map/hex';
import { type GameMap, type MapTile } from '../map/map-gen';
import { type Player } from '../players';
import { pickRandom } from '../../util/random';

/** Money the stormcaller's Call lightning action costs. */
export const LIGHTNING_COST = 15;
/** Turns after a cast before the owner can call lightning again. */
export const LIGHTNING_COOLDOWN_TURNS = 3;

/** Whether the player's lightning has recharged on `turn`. */
export function lightningReady(player: Pick<Player, 'lightningReadyTurn'>, turn: number): boolean {
  return (player.lightningReadyTurn ?? 0) <= turn;
}

/** Turns left until the player can call lightning again (0 when ready). */
export function lightningTurnsLeft(player: Pick<Player, 'lightningReadyTurn'>, turn: number): number {
  return Math.max(0, (player.lightningReadyTurn ?? 0) - turn);
}

/** Furthest a village can be (in hexes) from the stormcaller calling lightning onto it. */
export const LIGHTNING_RANGE = 7;

/** The villages `from` (the stormcaller's cell) can call lightning onto: explored
 *  by `playerIndex` and within `LIGHTNING_RANGE` hexes. */
export function lightningVillages(map: GameMap, playerIndex: number, from: { q: number; r: number }): MapTile[] {
  return map.tiles.filter((t) => t.settlement && isExploredFor(t, playerIndex) && hexDistance(t, from) <= LIGHTNING_RANGE);
}

/** A random cell of the village's territory (the village cell included). */
export function lightningStrikeCell(map: GameMap, village: MapTile, rng: () => number): MapTile {
  const cells = map.tiles.filter((t) => t.claimedByVillage && t.claimedByVillage.q === village.q && t.claimedByVillage.r === village.r);
  return pickRandom(cells.length > 0 ? cells : [village], rng)!;
}
