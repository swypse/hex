import { Axial, axialKey, hexDistance, hexNeighbors } from './hex';
import { GameMap, MapTile } from './map-gen';
import { isMountainType, TileType, isWaterType } from './tile-types';
import { isExploredFor } from './explore';
import { movePoints as unitMovePoints, Unit } from './units';
import { tileMoveCost, waterRouteKeys } from './movement-cost';
import { isMoveStealthed } from './stalker';

type SelectionKind = 'unit' | 'village' | 'terrain';

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

/** A tile with no visible unit for `playerIndex`: a real empty tile, or an
 *  enemy stealthed stalker (invisible to everyone but its owner). Stealthed
 *  units never block pathing for anyone else. */
function isEffectivelyEmpty(tile: MapTile, playerIndex: number): boolean {
  if (!tile.unit) return true;
  if (tile.unit.owner !== playerIndex && tile.unit.isStealthed === true) return true;
  return false;
}

/** A tile the moving unit may step onto: explored, unoccupied, and allowed by
 *  the terrain/move-type rules. Ships see land tiles as terminal (coast). A
 *  stealthed stalker may not step onto an enemy village's own cell. */
function isEnterable(
  map: GameMap,
  tile: MapTile,
  canSail: boolean,
  canClimb: boolean,
  canDock: boolean,
  playerIndex: number,
  stealthed = false,
): boolean {
  if (!isExploredFor(tile, playerIndex)) return false;
  if (!isEffectivelyEmpty(tile, playerIndex)) return false;
  if (stealthed && tile.settlement && tile.settlement.owner !== null && tile.settlement.owner !== playerIndex) {
    return false;
  }
  if (isWaterType(tile.terrain)) {
    if (canSail) return true;
    if (tile.bridge) return true;
    return isOwnDock(tile, canDock, playerIndex);
  }
  if (!canClimb && isMountainType(tile.terrain)) return false;
  return true;
}

/** A water tile holding the unit owner's port. A land unit entering it docks
 *  (turns into a ship, ending its turn), so it may be a destination but never
 *  a bridge to the shore beyond. */
function isOwnDock(tile: MapTile, canDock: boolean, playerIndex: number): boolean {
  return canDock && tile.building?.kind === 'port' && tile.ownedBy === playerIndex;
}

function isAdjacentToEnemy(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  return hexNeighbors(tile).some((n) => {
    const t = tileAt(map, n.q, n.r);
    return t !== undefined && t.unit != null && t.unit.isStealthed !== true && t.unit.owner !== playerIndex;
  });
}

function tkey(a: Axial): string {
  return `${a.q},${a.r}`;
}

/** Move-points cost of walking `path` (tiles after `from`, destination last):
 *  every left tile costs its leave-cost, the destination is free. */
function pathCost(map: GameMap, from: Axial, path: Axial[], owner: number, waterKeys: Set<string>): number {
  const origin = tileAt(map, from.q, from.r);
  let total = origin ? tileMoveCost(map, origin, owner, waterKeys) : 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const tile = tileAt(map, path[i]!.q, path[i]!.r);
    if (!tile) return Number.POSITIVE_INFINITY;
    total += tileMoveCost(map, tile, owner, waterKeys);
  }
  return total;
}

export function reachableTargets(
  map: GameMap,
  unit: Unit,
  movePoints?: number,
  canClimb = false,
  canDock = false,
  playerIndex = 0,
): MapTile[] {
  const points = movePoints ?? unitMovePoints(unit);
  const from = { q: unit.q, r: unit.r };
  const canSail = unit.shipLevel !== undefined;
  const stealthed = isMoveStealthed(unit);
  const waterKeys = waterRouteKeys(map);
  const start = tileAt(map, from.q, from.r);
  if (!start) return [];
  // Cost-bucketed Dijkstra: leaving a tile pays its move cost, so the edge
  // weight depends only on the tile departed.
  const buckets: MapTile[][] = Array.from({ length: points + 1 }, () => []);
  const dist = new Map<string, number>();
  const reached = new Set<string>();
  const result: MapTile[] = [];
  dist.set(tkey(from), 0);
  buckets[0]!.push(start);
  for (let cost = 0; cost <= points; cost++) {
    const bucket = buckets[cost]!;
    while (bucket.length > 0) {
      const cur = bucket.pop()!;
      const ck = tkey(cur);
      if (reached.has(ck)) continue;
      reached.add(ck);
      if (ck !== tkey(from)) result.push(cur);
      // Movement ends at the first cell adjacent to an enemy.
      if (isAdjacentToEnemy(map, cur, playerIndex)) continue;
      // A ship may never pass through land; landing tiles are terminal.
      if (canSail && !isWaterType(cur.terrain)) continue;
      // A land unit docking at its own port becomes a ship and its move ends.
      if (!canSail && isOwnDock(cur, canDock, playerIndex)) continue;
      for (const n of hexNeighbors(cur)) {
        const tile = tileAt(map, n.q, n.r);
        if (!tile) continue;
        const nk = tkey(n);
        if (reached.has(nk)) continue;
        if (!isEnterable(map, tile, canSail, canClimb, canDock, playerIndex, stealthed)) continue;
        const next = cost + tileMoveCost(map, cur, unit.owner, waterKeys);
        if (next > points) continue;
        if (dist.get(nk) !== undefined && dist.get(nk)! <= next) continue;
        dist.set(nk, next);
        buckets[next]!.push(tile);
      }
    }
  }
  // Always-move-one: every enterable direct neighbour is reachable even when
  // the unit has no move points left to pay for it.
  for (const n of hexNeighbors(from)) {
    const t = tileAt(map, n.q, n.r);
    if (!t) continue;
    const nk = tkey(t);
    if (reached.has(nk)) continue;
    if (isEnterable(map, t, canSail, canClimb, canDock, playerIndex, stealthed)) {
      reached.add(nk);
      result.push(t);
    }
  }
  return result;
}

/** Historical shortest-step path (unit-step BFS), reused whenever it fits the
 *  move-points budget so routes and animations keep their old look. */
function pathBetweenSteps(
  map: GameMap,
  from: Axial,
  to: Axial,
  canClimb = false,
  canSail = false,
  canDock = false,
  playerIndex = 0,
  stealthed = false,
): Axial[] {
  if (from.q === to.q && from.r === to.r) return [];
  const key = (a: Axial): string => `${a.q},${a.r}`;
  const queue: Axial[] = [{ ...from }];
  const cameFrom = new Map<string, string>();
  cameFrom.set(key(from), '');
  while (queue.length > 0) {
    const cur = queue.shift()!;
    // A land unit may end its move on its own port, but never cross it.
    if (!canSail && isOwnDock(tileAt(map, cur.q, cur.r)!, canDock, playerIndex)) continue;
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
      if (!isEffectivelyEmpty(tile, playerIndex)) continue;
      if (stealthed && tile.settlement && tile.settlement.owner !== null && tile.settlement.owner !== playerIndex) continue;
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

/** Weighted fallback: the cheapest route within `cap` points (used when the
 *  shortest-step route overspends the unit's move points). */
function pathBetweenCost(
  map: GameMap,
  from: Axial,
  to: Axial,
  cap: number,
  canClimb: boolean,
  canSail: boolean,
  canDock: boolean,
  playerIndex: number,
  waterKeys: Set<string>,
  stealthed = false,
): Axial[] {
  const start = tileAt(map, from.q, from.r);
  if (!start) return [];
  const buckets: MapTile[][] = Array.from({ length: cap + 1 }, () => []);
  const done = new Set<string>();
  const best = new Map<string, number>();
  const cameFrom = new Map<string, Axial>();
  best.set(tkey(from), 0);
  buckets[0]!.push(start);
  for (let cost = 0; cost <= cap; cost++) {
    const bucket = buckets[cost]!;
    while (bucket.length > 0) {
      const cur = bucket.pop()!;
      const ck = tkey(cur);
      if (done.has(ck)) continue;
      done.add(ck);
      if (ck === tkey(to)) {
        const path: Axial[] = [];
        let c: Axial = { q: to.q, r: to.r };
        while (c.q !== from.q || c.r !== from.r) {
          path.unshift({ q: c.q, r: c.r });
          const prev = cameFrom.get(tkey(c));
          if (!prev) return [];
          c = prev;
        }
        return path;
      }
      if (isAdjacentToEnemy(map, cur, playerIndex)) continue;
      if (canSail && !isWaterType(cur.terrain)) continue;
      // A land unit docking at its own port becomes a ship and its move ends.
      if (!canSail && isOwnDock(cur, canDock, playerIndex)) continue;
      for (const n of hexNeighbors(cur)) {
        const tile = tileAt(map, n.q, n.r);
        if (!tile) continue;
        const nk = tkey(n);
        if (done.has(nk)) continue;
        if (!isEnterable(map, tile, canSail, canClimb, canDock, playerIndex, stealthed)) continue;
        const next = cost + tileMoveCost(map, cur, playerIndex, waterKeys);
        if (next > cap) continue;
        if (best.get(nk) !== undefined && best.get(nk)! <= next) continue;
        best.set(nk, next);
        cameFrom.set(nk, { q: cur.q, r: cur.r });
        buckets[next]!.push(tile);
      }
    }
  }
  return [];
}

export function pathBetween(
  map: GameMap,
  from: Axial,
  to: Axial,
  canClimb = false,
  canSail = false,
  canDock = false,
  playerIndex = 0,
  movePoints: number | undefined = undefined,
  stealthed = false,
): Axial[] {
  if (from.q === to.q && from.r === to.r) return [];
  const waterKeys = waterRouteKeys(map);
  const quick = pathBetweenSteps(map, from, to, canClimb, canSail, canDock, playerIndex, stealthed);
  if (quick.length === 0) return quick;
  // Always-move-one: a direct neighbour is reachable even when the first step
  // costs more than the unit's move points (e.g. leaving a 14-20 cost tile
  // with only 10 points), so the walk must exist for it too.
  if (hexDistance(from, to) <= 1) return quick;
  if (movePoints === undefined || pathCost(map, from, quick, playerIndex, waterKeys) <= movePoints) {
    return quick;
  }
  // The shortest-step route overspends the budget: look for a cheaper route.
  return pathBetweenCost(map, from, to, movePoints, canClimb, canSail, canDock, playerIndex, waterKeys, stealthed);
}

export function moveUnit(map: GameMap, unit: Unit, target: MapTile): void {
  const source = tileAt(map, unit.q, unit.r)!;
  source.unit = null;
  target.unit = unit;
  unit.q = target.q;
  unit.r = target.r;
  unit.hasMoved = true;
}