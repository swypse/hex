import { isExploredFor } from '../../map/explore';
import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';

export function nearestEnemyDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === owner || !isExploredFor(t, owner)) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

export function nearestOwnUnitDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner !== owner) continue;
    if (t.q === tile.q && t.r === tile.r) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

export function nearestVillageDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === owner || !isExploredFor(t, owner)) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

export function nearestFreeVillageDistanceFrom(map: GameMap, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== null) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}
