import { axialKey, hexDistance } from './hex';
import { GameMap, MapTile } from './mapGen';
import { shipAttackDistance } from './ship';
import { Unit } from './units';

export function isExploredFor(tile: MapTile, playerIndex: number): boolean {
  return tile.exploredBy !== undefined && tile.exploredBy.includes(playerIndex);
}

function markExplored(tile: MapTile, playerIndex: number): void {
  (tile.exploredBy ??= []).push(playerIndex);
}

export function exploreAround(
  map: GameMap,
  center: MapTile,
  radius: number,
  playerIndex: number,
): MapTile[] {
  const newly: MapTile[] = [];
  for (const t of map.tiles) {
    if (isExploredFor(t, playerIndex)) continue;
    if (hexDistance(t, center) > radius) continue;
    markExplored(t, playerIndex);
    newly.push(t);
  }
  return newly;
}

export function exploreUnitPath(
  map: GameMap,
  path: { q: number; r: number }[],
  unit: Unit,
  playerIndex: number,
): MapTile[] {
  const radius = unit.shipLevel !== undefined
    ? shipAttackDistance(unit)
    : unit.type === 'catapult'
      ? 1
      : unit.attackDistance;
  const newly: MapTile[] = [];
  const seen = new Set<MapTile>();
  for (const step of path) {
    const center = map.tiles.find((t) => t.q === step.q && t.r === step.r);
    if (!center) continue;
    for (const t of exploreAround(map, center, radius, playerIndex)) {
      if (!seen.has(t)) {
        seen.add(t);
        newly.push(t);
      }
    }
  }
  return newly;
}

export function initialExplorationFor(map: GameMap, playerIndex: number): MapTile[] {
  const newly: MapTile[] = [];
  for (const t of map.tiles) {
    if (isExploredFor(t, playerIndex)) continue;
    if (t.ownedBy !== playerIndex) continue;
    markExplored(t, playerIndex);
    newly.push(t);
  }
  return newly;
}

export function exploreVillageTiles(
  map: GameMap,
  villageTile: MapTile,
  playerIndex: number,
): MapTile[] {
  const villageKey = axialKey(villageTile);
  const newly: MapTile[] = [];
  for (const t of map.tiles) {
    if (!t.claimedByVillage) continue;
    if (axialKey(t.claimedByVillage) !== villageKey) continue;
    if (isExploredFor(t, playerIndex)) continue;
    markExplored(t, playerIndex);
    newly.push(t);
  }
  return newly;
}
