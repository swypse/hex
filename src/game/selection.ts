import { Axial, axialKey, hexDistance, hexNeighbors } from './hex';
import { GameMap, MapTile } from './mapGen';
import { TileType } from './tileTypes';
import { isMountainType } from './tileTypes';
import { isShip } from './ship';
import { isExploredFor } from './explore';
import { Unit, moveRange } from './units';

export type SelectionKind = 'unit' | 'village' | 'terrain';

export interface Selection {
  kind: SelectionKind;
  q: number;
  r: number;
}

const tileIndex = new WeakMap<GameMap, Map<string, MapTile>>();

function tileIndexFor(map: GameMap): Map<string, MapTile> {
  let index = tileIndex.get(map);
  if (!index) {
    index = new Map(map.tiles.map((t) => [axialKey(t), t]));
    tileIndex.set(map, index);
  }
  return index;
}

export function tileAt(map: GameMap, q: number, r: number): MapTile | undefined {
  return tileIndexFor(map).get(axialKey({ q, r }));
}

export function contentLayers(tile: MapTile): SelectionKind[] {
  const layers: SelectionKind[] = [];
  if (tile.unit) layers.push('unit');
  if (tile.settlement) layers.push('village');
  layers.push('terrain');
  return layers;
}

export function cycleSelection(current: Selection | null, tile: MapTile): Selection {
  const layers = contentLayers(tile);
  if (current && current.q === tile.q && current.r === tile.r) {
    const idx = layers.indexOf(current.kind);
    return { kind: layers[(idx + 1) % layers.length]!, q: tile.q, r: tile.r };
  }
  return { kind: layers[0]!, q: tile.q, r: tile.r };
}

function hasWaterNeighbor(map: GameMap, tile: MapTile): boolean {
  return hexNeighbors(tile).some((n) => {
    const t = tileAt(map, n.q, n.r);
    return t !== undefined && t.terrain === TileType.Water;
  });
}

export function reachableTargets(
  map: GameMap,
  unit: Unit,
  range?: number,
  canClimb = false,
  canDock = false,
  playerIndex = 0,
): MapTile[] {
  const effectiveRange = range ?? moveRange(unit, tileAt(map, unit.q, unit.r), map);
  const from = { q: unit.q, r: unit.r };
  const candidates = map.tiles.filter((t) => {
    if (hexDistance(from, t) > effectiveRange) return false;
    if (!isExploredFor(t, playerIndex)) return false;
    if (t.terrain === TileType.Water) {
      const bridged = t.bridge !== undefined && t.bridge !== null;
      if (!isShip(unit) && !bridged && !(t.building && t.building.kind === 'port' && t.ownedBy === playerIndex && canDock)) return false;
    } else if (isShip(unit) && !hasWaterNeighbor(map, t)) {
      return false;
    }
    if (!canClimb && isMountainType(t.terrain)) return false;
    if (t.unit) return false;
    return true;
  });
  return candidates.filter((t) => {
    const path = pathBetween(map, from, t, canClimb, isShip(unit), canDock, playerIndex);
    return path.length > 0 && path.length <= effectiveRange;
  });
}

export function pathBetween(
  map: GameMap,
  from: Axial,
  to: Axial,
  canClimb = false,
  canSail = false,
  canDock = false,
  playerIndex = 0,
): Axial[] {
  if (from.q === to.q && from.r === to.r) return [];
  const key = (a: Axial): string => `${a.q},${a.r}`;
  const queue: Axial[] = [{ ...from }];
  const cameFrom = new Map<string, string>();
  cameFrom.set(key(from), '');
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of hexNeighbors(cur)) {
      const nk = key(n);
      if (cameFrom.has(nk)) continue;
      const tile = tileAt(map, n.q, n.r);
      if (!tile) continue;
      if (!isExploredFor(tile, playerIndex)) continue;
      if (tile.terrain === TileType.Water && !canSail) {
        const bridged = tile.bridge !== undefined && tile.bridge !== null;
        const dockHere = tile.building !== null && tile.building.kind === 'port' && tile.ownedBy === playerIndex && canDock;
        if (!bridged && !dockHere) continue;
      } else if (canSail && tile.terrain !== TileType.Water && !(n.q === to.q && n.r === to.r)) {
        continue;
      }
      if (!canClimb && isMountainType(tile.terrain)) continue;
      if (tile.unit) continue;
      cameFrom.set(nk, key(cur));
      if (n.q === to.q && n.r === to.r) {
        const path: Axial[] = [];
        let c: Axial = n;
        while (c.q !== from.q || c.r !== from.r) {
          path.unshift({ ...c });
          const prev = cameFrom.get(key(c))!;
          const [pq, pr] = prev.split(',').map(Number);
          c = { q: pq!, r: pr! };
        }
        return path;
      }
      if (isAdjacentToEnemy(map, tile, playerIndex)) continue;
      queue.push({ ...n });
    }
  }
  return [];
}

function isAdjacentToEnemy(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  return hexNeighbors(tile).some((n) => {
    const t = tileAt(map, n.q, n.r);
    return t !== undefined && t.unit != null && t.unit.owner !== playerIndex;
  });
}

export function moveUnit(map: GameMap, unit: Unit, target: MapTile): void {
  const source = tileAt(map, unit.q, unit.r)!;
  source.unit = null;
  target.unit = unit;
  unit.q = target.q;
  unit.r = target.r;
  unit.hasMoved = true;
}
