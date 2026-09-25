import { hexNeighbors } from './hex';
import { GameMap, MapTile } from './map-gen';
import { isWaterType } from './tile-types';
import { Resources } from './resources';

export interface TrapState {
  owner: number;
  placedTurn: number;
}

export const TRAP_COST: Resources = { wood: 0, stone: 0, money: 5, ore: 3 };
export const TRAP_TURNS = 10;
export const TRAP_ATTACK = 30;

/** Cells the trapper on `trapperTile` may trap: its own tile plus adjacent
 *  tiles, as long as each is non-water, unoccupied, has no village/building
 *  and no existing trap. Ownership no longer matters. */
export function canPlaceTrapOn(tile: MapTile, trapperTile: MapTile): boolean {
  if (isWaterType(tile.terrain)) return false;
  const isOwnTile = tile.q === trapperTile.q && tile.r === trapperTile.r;
  if (!isOwnTile && !hexNeighbors(trapperTile).some((n) => n.q === tile.q && n.r === tile.r)) return false;
  if (tile.unit && !isOwnTile) return false;
  if (tile.settlement || tile.building) return false;
  if (tile.trap) return false;
  return true;
}

export function trapCells(map: GameMap, trapperTile: MapTile): MapTile[] {
  const out: MapTile[] = [];
  const tryTile = (t: MapTile | undefined): void => {
    if (t && canPlaceTrapOn(t, trapperTile)) out.push(t);
  };
  tryTile(trapperTile);
  for (const n of hexNeighbors(trapperTile)) {
    tryTile(map.tiles.find((x) => x.q === n.q && x.r === n.r));
  }
  return out;
}

/** Damage a trap deals: a full-hp hit at 30 attack against defense 0 →
 *  round((30/30) * 30 * 1.5) = 45. No miss roll, no counter-attack. */
export function trapDamage(): number {
  return Math.round(TRAP_ATTACK * 1.5);
}

/** Whether the trap placed on `placedTurn` is still alive this round. */
export function trapAlive(placedTurn: number, turn: number): boolean {
  return turn - placedTurn < TRAP_TURNS;
}
