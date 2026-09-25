import { hexNeighbors, type Axial } from './hex';
import type { GameMap, MapTile } from './map-gen';
import type { Unit } from './units';

/** Settlement tiles at hex distance 1 of `pos` owned by a tribe other than
 *  `owner` (free or the owner's own villages never count). */
export function adjacentEnemyVillages(map: GameMap, pos: Axial, owner: number): MapTile[] {
  const out: MapTile[] = [];
  for (const n of hexNeighbors(pos)) {
    const tile = map.tiles.find((t) => t.q === n.q && t.r === n.r);
    if (!tile?.settlement) continue;
    const villageOwner = tile.settlement.owner;
    if (villageOwner !== null && villageOwner !== owner) out.push(tile);
  }
  return out;
}

/** True while the unit counts as stealthed for its current move: it is
 *  already hidden, or it is a fresh stalker whose first move will
 *  auto-stealth it before the walk starts. A ship never counts. */
export function isMoveStealthed(unit: Unit): boolean {
  if (unit.shipLevel !== undefined) return false;
  if (unit.isStealthed === true) return true;
  return unit.type === 'stalker' && unit.firstMoveStealthDone !== true;
}

/** A stealthed stalker may never step onto an enemy village's own cell. */
export function stealthBarredVillageCell(unit: Unit, tile: MapTile): boolean {
  if (!isMoveStealthed(unit)) return false;
  const s = tile.settlement;
  return s !== null && s.owner !== null && s.owner !== unit.owner;
}