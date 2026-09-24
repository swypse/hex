import { hexNeighbors } from './hex';
import { GameMap, MapTile } from './map-gen';
import { Player } from './players';
import { isWaterType } from './tile-types';
import { Resources } from './resources';

export interface TrapState {
  owner: number;
  placedTurn: number;
}

export const TRAP_COST: Resources = { wood: 0, stone: 0, money: 5, ore: 3 };
export const TRAP_TURNS = 5;
export const TRAP_ATTACK = 60;

/** Cells the trapper on `trapperTile` may trap: its own tile plus adjacent
 *  tiles that are owned, non-water, unoccupied and not already trapped. */
export function canPlaceTrapOn(map: GameMap, tile: MapTile, trapperTile: MapTile, player: Player): boolean {
  if (isWaterType(tile.terrain)) return false;
  if (tile.q === trapperTile.q && tile.r === trapperTile.r) {
    // same tile: OK
  } else if (!hexNeighbors(trapperTile).some((n) => n.q === tile.q && n.r === tile.r)) {
    return false;
  }
  if (tile.unit) return false;
  if (tile.settlement || tile.building) return false;
  if (tile.bridge !== undefined && tile.bridge !== null) return false;
  if (tile.trap) return false;
  if (tile.ownedBy !== player.index) return false;
  return true;
}

export function trapCells(map: GameMap, trapperTile: MapTile, player: Player): MapTile[] {
  const out: MapTile[] = [];
  const tryTile = (t: MapTile | undefined): void => {
    if (t && canPlaceTrapOn(map, t, trapperTile, player)) out.push(t);
  };
  tryTile(trapperTile);
  for (const n of hexNeighbors(trapperTile)) {
    tryTile(map.tiles.find((x) => x.q === n.q && x.r === n.r));
  }
  return out;
}

/** Damage a trap deals: a full-hp hit at 60 attack against defense 0 →
 *  round((60/60) * 60 * 1.5) = 90. No miss roll, no counter-attack. */
export function trapDamage(): number {
  return Math.round(TRAP_ATTACK * 1.5);
}

/** Whether the trap placed on `placedTurn` is still alive this round. */
export function trapAlive(placedTurn: number, turn: number): boolean {
  return turn - placedTurn < TRAP_TURNS;
}