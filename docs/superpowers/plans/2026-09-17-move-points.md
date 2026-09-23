# Move Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework unit movement from a flat per-turn tile range into a move-points budget: tiles cost move points to leave, roads and water-routes halve the cost for their owner, a unit can always move 1 tile, and move markers appear only on tiles reachable within the budget.

**Architecture:** A single cost function (`src/game/movementCost.ts`) computes a tile's leave-cost for an owner. `src/game/selection.ts` runs one cost-bucketed Dijkstra for reachability/`pathBetween`, keeping the existing step-BFS route when it fits the points budget. Unit movement values are scaled ×10 and read through a new `movePoints(unit)` accessor.

**Tech Stack:** TypeScript, Vitest (`npm test`), `npm run typecheck`. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-17-move-points-design.md`.
- Move property values are points, always ×10 of the old tile range (warrior/archer/swordsman/shield/catapult 10, rider 40, knight 30, pirate 50; ships 20/30/40).
- Tile leave-costs: land/settlement 10, water 10, forest 14, mountain 20.
- Half cost (`Math.floor(base/2)`) only for the owner: own road tile, own port water-route tile, own village connected to own road. Foreign roads give nothing.
- Cost is paid when LEAVING a tile (never when entering); the destination tile itself is free.
- Always-move-one: any enterable direct neighbour of the unit's tile is reachable regardless of points.
- Enterability rules are unchanged: explored, unoccupied, mountains need Climbing, land-on-water needs a bridge or own port + Navigation, ships are water-only with coast tiles as terminal landing spots, movement ends at the first tile adjacent to an enemy.
- Move markers (`reachableKeys`) come directly from `reachableTargets`, so no marker logic changes; the controller passes the unit's move points.
- AI distance heuristics divide points by 10 to keep turn/hex estimates unchanged (flat-terrain approximation).
- No leftover-points UI, no per-tile cost display, no attack-range changes.

---

## File Structure

- `src/game/movementCost.ts` — **new**. Tile leave-cost + water-route keys. Pure game logic.
- `src/game/units.ts` — movement field renamed `movePoints`, values ×10, `UNIT_MOVEMENT` → `UNIT_MOVE_POINTS`, new `movePoints(unit)` accessor; `moveRange` becomes an alias then is removed.
- `src/game/ship.ts` — `SHIP_MOVEMENT` → `SHIP_MOVE_POINTS` (20/30/40), `shipMovement` → `shipMovePoints`.
- `src/game/selection.ts` — `reachableTargets` (Dijkstra) + `pathBetween` (step-BFS then cost-feasible weighted fallback).
- `src/game/simulator.ts` — pass `movePoints(unit)` to reachability/search; pirate step-slicing ÷ 10.
- `src/game/aiSituation.ts`, `src/game/aiPatterns.ts` — point-to-hex÷10 heuristic fixes.
- `src/game/unitActions.ts`, `src/controller/gameController.ts` — use `movePoints(unit)`.
- `src/game/unitDescriptions.ts` — `.movePoints` field, label wording.
- `src/i18n/locales/en.ts`, `ru.ts` — move-points strings.
- `GAME.md` — unit table + Move action + ship/pirate/water-route docs.
- Tests: `tests/movementCost.test.ts` (new), `tests/selection.test.ts`, `tests/units.test.ts`, `tests/unitDescriptions.test.ts`, `tests/unitHelpDialog.test.ts`.

---

### Task 1: Tile move-cost module

**Files:**
- Create: `src/game/movementCost.ts`
- Test: `tests/movementCost.test.ts`

**Interfaces:**
- Produces:
  - `export const TILE_MOVE_COST: { land: 10; water: 10; forest: 14; mountain: 20 }`
  - `export function waterRouteKeys(map: GameMap): Set<string>`
  - `export function tileMoveCost(map: GameMap, tile: MapTile, owner: number, waterKeys?: Set<string>): number`

- [ ] **Step 1: Write the failing test**

`tests/movementCost.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { TILE_MOVE_COST, tileMoveCost, waterRouteKeys } from '../src/game/movementCost';

function mk(q: number, r: number, terrain: TileType, opts: Partial<MapTile> = {}): MapTile {
  return {
    q, r, terrain, settlement: null, building: null, unit: null,
    ownedBy: null, claimedByVillage: null, exploredBy: [],
    ...opts,
  };
}

function map(tiles: MapTile[]): GameMap {
  return { radius: 8, tiles, spawns: [] };
}

describe('TILE_MOVE_COST', () => {
  it('defines base costs', () => {
    expect(TILE_MOVE_COST).toEqual({ land: 10, water: 10, forest: 14, mountain: 20 });
  });
});

describe('tileMoveCost', () => {
  it('charges the base terrain cost to leave a tile', () => {
    const m = (t: MapTile) => map([t]);
    expect(tileMoveCost(m(mk(0, 0, TileType.GrasslandLand)), mk(0, 0, TileType.GrasslandLand), 0)).toBe(10);
    expect(tileMoveCost(m(mk(0, 0, TileType.Water)), mk(0, 0, TileType.Water), 0)).toBe(10);
    expect(tileMoveCost(m(mk(0, 0, TileType.GrasslandForest)), mk(0, 0, TileType.GrasslandForest), 0)).toBe(14);
    expect(tileMoveCost(m(mk(0, 0, TileType.GrasslandMountain)), mk(0, 0, TileType.GrasslandMountain), 0)).toBe(20);
  });

  it('halves the cost on the units own road only', () => {
    const road = mk(0, 0, TileType.GrasslandLand, { roadOwner: 0 });
    const foreign = mk(0, 0, TileType.GrasslandLand, { roadOwner: 1 });
    expect(tileMoveCost(map([road]), road, 0)).toBe(5);
    expect(tileMoveCost(map([road]), road, 1)).toBe(10);
    expect(tileMoveCost(map([foreign]), foreign, 0)).toBe(10);
  });

  it('halves forest and mountain roads with floor', () => {
    const f = mk(0, 0, TileType.GrasslandForest, { roadOwner: 0 });
    const mnt = mk(0, 0, TileType.GrasslandMountain, { roadOwner: 0 });
    expect(tileMoveCost(map([f]), f, 0)).toBe(7);
    expect(tileMoveCost(map([mnt]), mnt, 0)).toBe(10);
  });

  it('treats a bridge as an own road on water', () => {
    const b = mk(0, 0, TileType.Water, { bridge: { owner: 0, dir: 'we' }, roadOwner: 0 });
    expect(tileMoveCost(map([b]), b, 0)).toBe(5);
    expect(tileMoveCost(map([b]), b, 1)).toBe(10);
  });

  it('halves water-route tiles between own ports', () => {
    const portA = mk(0, 0, TileType.Water, { building: { kind: 'port', level: 1 }, ownedBy: 0 });
    const mid = mk(1, 0, TileType.Water, { ownedBy: 0 });
    const portB = mk(2, 0, TileType.Water, { building: { kind: 'port', level: 1 }, ownedBy: 0 });
    const m = map([portA, mid, portB]);
    const keys = waterRouteKeys(m);
    expect(keys).toContain('1,0');
    expect(tileMoveCost(m, mid, 0, keys)).toBe(5);
    expect(tileMoveCost(m, mid, 1, keys)).toBe(10);
    // Without the water-route key the full water cost applies.
    expect(tileMoveCost(m, mid, 0)).toBe(10);
  });

  it('halves an own village connected to an own road', () => {
    const village = mk(0, 0, TileType.GrasslandLand, {
      settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0,
    });
    const road = mk(1, 0, TileType.GrasslandLand, { roadOwner: 0, ownedBy: 0 });
    const disconnected = map([village]);
    const connected = map([village, road]);
    expect(tileMoveCost(connected, village, 0)).toBe(5);
    expect(tileMoveCost(disconnected, village, 0)).toBe(10);
    expect(tileMoveCost(connected, village, 1)).toBe(10);
  });

  it('does not halve an own village with only a foreign road next to it', () => {
    const village = mk(0, 0, TileType.GrasslandLand, {
      settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0,
    });
    const road = mk(1, 0, TileType.GrasslandLand, { roadOwner: 1, ownedBy: 1 });
    expect(tileMoveCost(map([village, road]), village, 0)).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/movementCost.test.ts`
Expected: FAIL — module `../src/game/movementCost` can't be resolved.

- [ ] **Step 3: Write minimal implementation**

`src/game/movementCost.ts`:

```ts
import { axialKey, hexNeighbors } from './hex';
import { GameMap, MapTile } from './mapGen';
import { isForestType, isMountainType, isWaterType } from './tileTypes';
import { waterRouteEdges } from './waterRoads';

/** Move-points cost to LEAVE a tile of each terrain kind. Land also covers
 *  village/settlement tiles; settlements never reduce the base cost. */
export const TILE_MOVE_COST = { land: 10, water: 10, forest: 14, mountain: 20 };

/** Keys of water tiles that form a port water route (components holding two
 *  or more of a player's own ports). Computed once per reachability query. */
export function waterRouteKeys(map: GameMap): Set<string> {
  return new Set(waterRouteEdges(map).keys());
}

function ownRoadNeighbor(map: GameMap, tile: MapTile, owner: number): boolean {
  return hexNeighbors(tile).some((n) => {
    const t = map.tiles.find((x) => x.q === n.q && x.r === n.r);
    return t !== undefined && t.roadOwner === owner;
  });
}

/** Move-points cost to leave `tile` for a unit of `owner`. Cost is halved
 *  (rounded down) only for the owner: on own roads, own port water-route
 *  tiles, and own villages connected to the owner's road network.
 *  `waterKeys` is the precomputed `waterRouteKeys(map)` when available. */
export function tileMoveCost(
  map: GameMap,
  tile: MapTile,
  owner: number,
  waterKeys?: Set<string>,
): number {
  const base = isWaterType(tile.terrain)
    ? TILE_MOVE_COST.water
    : isMountainType(tile.terrain)
      ? TILE_MOVE_COST.mountain
      : isForestType(tile.terrain)
        ? TILE_MOVE_COST.forest
        : TILE_MOVE_COST.land;
  const discount =
    tile.roadOwner === owner ||
    (isWaterType(tile.terrain) && tile.ownedBy === owner && waterKeys?.has(axialKey(tile))) ||
    (tile.settlement !== null && tile.settlement.owner === owner && ownRoadNeighbor(map, tile, owner));
  return discount ? Math.floor(base / 2) : base;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/movementCost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/movementCost.ts tests/movementCost.test.ts
git commit -m "feat: tile move-points costs with owner road discounts"
```

---

### Task 2: Cost-based reachability + weighted path search

**Files:**
- Modify: `src/game/selection.ts` (whole file worth of helpers)
- Test: `tests/selection.test.ts`

**Interfaces:**
- Consumes: `tileMoveCost`, `waterRouteKeys` (Task 1); `moveRange` (existing, still present until Task 4).
- Produces:
  - `reachableTargets(map, unit, movePoints?, canClimb?, canDock?, playerIndex?)` → `MapTile[]` (third arg is now POINTS).
  - `pathBetween(map, from, to, canClimb?, canSail?, canDock?, playerIndex?, movePoints?)` → `Axial[]` (new 8th optional arg, points budget).

The existing step-BFS `pathBetween` body becomes `pathBetweenSteps` (unchanged behavior); `pathBetween` reuses it when the route fits the points budget, else falls back to a cost-minimizing Dijkstra. `reachableTargets` is one cost-bucketed Dijkstra.

- [ ] **Step 1: Move the old BFS into `pathBetweenSteps` and add helpers; rewrite `reachableTargets` and `pathBetween`**

Replace the `reachableTargets`, `pathBetween`, and the `hasWaterNeighbor` helper in `src/game/selection.ts` with:

```ts
import { Axial, axialKey, hexDistance, hexNeighbors } from './hex';
import { GameMap, MapTile } from './mapGen';
import { isMountainType, isWaterType, TileType } from './tileTypes';
import { isShip } from './ship';
import { isExploredFor } from './explore';
import { moveRange, Unit } from './units';
import { tileMoveCost, waterRouteKeys } from './movementCost';

type SelectionKind = 'unit' | 'village' | 'terrain';

export interface Selection {
  kind: SelectionKind;
  q: number;
  r: number;
}

// ... keep tileIndex / tileIndexFor / tileAt / contentLayers / cycleSelection
// and moveUnit exactly as they are ...

/** A tile the moving unit may step onto: explored, unoccupied, and allowed by
 *  the terrain/move-type rules. Ships see land tiles as terminal (coast). */
function isEnterable(
  map: GameMap,
  tile: MapTile,
  canSail: boolean,
  canClimb: boolean,
  canDock: boolean,
  playerIndex: number,
): boolean {
  if (!isExploredFor(tile, playerIndex)) return false;
  if (tile.unit) return false;
  if (isWaterType(tile.terrain)) {
    if (canSail) return true;
    if (tile.bridge) return true;
    return tile.building !== null && tile.building.kind === 'port' && tile.ownedBy === playerIndex && canDock;
  }
  if (!canClimb && isMountainType(tile.terrain)) return false;
  return true;
}

function isAdjacentToEnemy(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  return hexNeighbors(tile).some((n) => {
    const t = tileAt(map, n.q, n.r);
    return t !== undefined && t.unit != null && t.unit.owner !== playerIndex;
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
  const points = movePoints ?? moveRange(unit);
  const from = { q: unit.q, r: unit.r };
  const canSail = unit.shipLevel !== undefined;
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
      for (const n of hexNeighbors(cur)) {
        const tile = tileAt(map, n.q, n.r);
        if (!tile) continue;
        const nk = tkey(n);
        if (reached.has(nk)) continue;
        if (!isEnterable(map, tile, canSail, canClimb, canDock, playerIndex)) continue;
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
    if (isEnterable(map, t, canSail, canClimb, canDock, playerIndex)) {
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
      for (const n of hexNeighbors(cur)) {
        const tile = tileAt(map, n.q, n.r);
        if (!tile) continue;
        const nk = tkey(n);
        if (done.has(nk)) continue;
        if (!isEnterable(map, tile, canSail, canClimb, canDock, playerIndex)) continue;
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
): Axial[] {
  if (from.q === to.q && from.r === to.r) return [];
  const waterKeys = waterRouteKeys(map);
  const quick = pathBetweenSteps(map, from, to, canClimb, canSail, canDock, playerIndex);
  if (quick.length === 0) return quick;
  if (movePoints === undefined || pathCost(map, from, quick, playerIndex, waterKeys) <= movePoints) {
    return quick;
  }
  // The shortest-step route overspends the budget: look for a cheaper route.
  return pathBetweenCost(map, from, to, movePoints, canClimb, canSail, canDock, playerIndex, waterKeys);
}
```

- [ ] **Step 2: Rewrite the points-domain tests**

Replace the `describe('reachableTargets')` and `describe('pathBetween')` blocks in `tests/selection.test.ts` (keep `tileAt`, `contentLayers`, `cycleSelection`, `moveUnit`, and `bridged water movement` describes as-is) with:

```ts
// NOTE: the file's existing `makeTile`/`makeMap` helpers (defined before the
// `tileAt` describe) stay where they are and are reused below. Only add these
// new helpers:
function mkUnit(owner: number, type: string, q: number, r: number, shipLevel?: 1 | 2 | 3): Unit {
  return {
    id: 'u',
    owner,
    type,
    q,
    r,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 5,
    attack: 2,
    attackDistance: 1,
    spawnVillage: null,
    shipLevel,
  } as Unit;
}

const L = (q: number, r: number, opts: Partial<MapTile> = {}): MapTile =>
  ({ q, r, terrain: TileType.GrasslandLand, settlement: null, building: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0], ...opts });
const F = (q: number, r: number): MapTile => ({ ...L(q, r), terrain: TileType.GrasslandForest });
const M = (q: number, r: number): MapTile => ({ ...L(q, r), terrain: TileType.GrasslandMountain });
const W = (q: number, r: number): MapTile => ({ ...L(q, r), terrain: TileType.Water });

function lineMap(start: MapTile, ...tiles: MapTile[]): GameMap {
  return { radius: 8, tiles: [start, ...tiles], spawns: [] };
}

describe('reachableTargets', () => {
  it('excludes water, occupied tiles, and self; includes empty land and empty villages', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    const targets = reachableTargets(map, unit);
    const keys = targets.map((t) => `${t.q},${t.r}`);
    expect(keys).toContain('0,1');
    expect(keys).toContain('1,-1');
    expect(keys).not.toContain('1,0');
    expect(keys).not.toContain('-1,0');
    expect(keys).not.toContain('0,0');
  });

  it('excludes unexplored tiles', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    map.tiles.forEach((t) => { if (t.q !== 0 || t.r !== 0) t.exploredBy = []; });
    expect(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`)).not.toContain('0,1');
  });

  it('reaches tiles whose total leaving cost fits the move points', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start = L(0, 0, { unit });
    const map = lineMap(start, L(1, 0), L(2, 0), L(3, 0));
    const keys = (pts: number) => reachableTargets(map, unit, pts).map((t) => `${t.q},${t.r}`);
    expect(keys(20)).toContain('2,0'); // leave land(10) + land(10)
    expect(keys(20)).not.toContain('3,0');
    expect(keys(30)).toContain('3,0');
  });

  it('a forest tile costs 14 to leave', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start = L(0, 0, { unit });
    const map = lineMap(start, F(1, 0), L(2, 0), L(3, 0));
    const keys = (pts: number) => reachableTargets(map, unit, pts).map((t) => `${t.q},${t.r}`);
    // 10 (leave land) + 14 (leave forest) = 24 needed for (2,0).
    expect(keys(20)).not.toContain('2,0');
    expect(keys(24)).toContain('2,0');
    // And (3,0) needs another 10: 34.
    expect(keys(30)).not.toContain('3,0');
    expect(keys(34)).toContain('3,0');
  });

  it('a mountain tile costs 20 to leave', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start = L(0, 0, { unit });
    const map = lineMap(start, M(1, 0), L(2, 0));
    const keys = (pts: number) => reachableTargets(map, unit, pts, true).map((t) => `${t.q},${t.r}`);
    expect(keys(30)).toContain('2,0'); // 10 + 20
    expect(keys(29)).not.toContain('2,0');
  });

  it('halves the cost on the unit own road, not on a foreign road', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const ownRoad = L(0, 0, { unit, roadOwner: 0 });
    const enemyRoad = L(0, 0, { unit, roadOwner: 1 });
    // Own road: leaving it costs 5, so (2,0) needs 15.
    const ownMap = lineMap(ownRoad, L(1, 0), L(2, 0));
    const enMap = lineMap(enemyRoad, L(1, 0), L(2, 0));
    expect(reachableTargets(ownMap, unit, 15).map((t) => `${t.q},${t.r}`)).toContain('2,0');
    expect(reachableTargets(enMap, unit, 15).map((t) => `${t.q},${t.r}`)).not.toContain('2,0');
  });

  it('always allows an adjacent tile even without enough move points', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start = L(0, 0, { unit });
    const map = lineMap(start, F(1, 0), L(2, 0));
    const keys = (pts: number) => reachableTargets(map, unit, pts).map((t) => `${t.q},${t.r}`);
    expect(keys(1)).toContain('1,0'); // direct neighbour: always reachable
    expect(keys(1)).not.toContain('2,0');
  });

  it('mountains block movement unless climbing is opened', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start = L(0, 0, { unit });
    const map = lineMap(start, M(1, 0), L(2, 0));
    expect(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`)).not.toContain('1,0');
    expect(reachableTargets(map, unit, undefined, true).map((t) => `${t.q},${t.r}`)).toContain('1,0');
  });

  it('ships move on water and land only on coast tiles', () => {
    const unit = mkUnit(0, 'warrior', 0, 0, 1);
    const start = W(0, 0);
    start.unit = unit;
    const map: GameMap = { radius: 8, tiles: [start, L(1, 0), L(2, 0)], spawns: [] };
    const keys = reachableTargets(map, unit, 20).map((t) => `${t.q},${t.r}`);
    expect(keys).toContain('1,0'); // coast landing
    expect(keys).not.toContain('2,0'); // inland: ships never pass through land
  });

  it('halves water-route travel for the owner', () => {
    const unit = mkUnit(0, 'warrior', 0, 0, 1);
    const portA = W(0, 0);
    portA.unit = unit;
    portA.building = { kind: 'port', level: 1 };
    portA.ownedBy = 0;
    const mid = W(1, 0);
    mid.ownedBy = 0;
    const portB = W(2, 0);
    portB.building = { kind: 'port', level: 1 };
    portB.ownedBy = 0;
    const routeMap: GameMap = { radius: 8, tiles: [portA, mid, portB], spawns: [] };
    // Route present: leaving the port (5) + leaving the water-road (5) = 10.
    expect(reachableTargets(routeMap, unit, 10).map((t) => `${t.q},${t.r}`)).toContain('2,0');
    // No route (a single port): both hops cost 10 each, so 20 is needed for
    // the far water tile.
    const noRouteMid = W(1, 0);
    noRouteMid.ownedBy = 0;
    const far = W(2, 0);
    far.ownedBy = 0;
    const lone: GameMap = { radius: 8, tiles: [portA, noRouteMid, far], spawns: [] };
    expect(reachableTargets(lone, unit, 10).map((t) => `${t.q},${t.r}`)).not.toContain('2,0');
  });

  it('a non-ship can step onto its own port water tile only with navigation', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const map = makeMap();
    const port = makeTile(1, 0, TileType.Water);
    port.building = { kind: 'port', level: 1 };
    port.ownedBy = 0;
    map.tiles = [map.tiles[0]!, port];
    expect(reachableTargets(map, unit).some((t) => t.q === 1 && t.r === 0)).toBe(false);
    expect(reachableTargets(map, unit, undefined, false, true).some((t) => t.q === 1 && t.r === 0)).toBe(true);
  });

  it('stops movement at the first cell adjacent to an enemy', () => {
    const unit = mkUnit(0, 'rider', 0, 0);
    const enemy = mkUnit(1, 'warrior', 2, 1);
    const map: GameMap = { radius: 8, tiles: [L(0, 0, { unit }), L(1, 0), L(2, 0), L(3, 0), L(2, 1, { unit: enemy })], spawns: [] };
    const keys = reachableTargets(map, unit, 40).map((t) => `${t.q},${t.r}`);
    expect(keys).toContain('2,0');
    expect(keys).not.toContain('3,0');
  });
});

describe('pathBetween', () => {
  it('walks around water cell by cell', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(L(0, 0), W(1, 0), L(2, 0), L(0, 1), L(1, 1));
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([
      { q: 0, r: 1 },
      { q: 1, r: 1 },
      { q: 2, r: 0 },
    ]);
  });

  it('returns an empty array when the target is unreachable', () => {
    const map = makeMap();
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 })).toEqual([]);
  });

  it('cannot pass through unexplored tiles', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(L(0, 0), L(1, 0), L(2, 0));
    map.tiles[1]!.exploredBy = [];
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([]);
  });

  it('returns an empty array when start equals target', () => {
    const map = makeMap();
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 0, r: 0 })).toEqual([]);
  });

  it('mountains block movement unless climbing is opened', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(L(0, 0), M(1, 0), L(2, 0));
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([]);
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 }, true)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it('ships can move on water', () => {
    const map: GameMap = { radius: 4, tiles: [W(0, 0), W(1, 0)], spawns: [] };
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 }, false, true)).toEqual([{ q: 1, r: 0 }]);
  });

  it('a ship lands only on coast tiles', () => {
    const map: GameMap = { radius: 8, tiles: [W(0, 0), L(1, 0), L(2, 0)], spawns: [] };
    // Landing on the coast within points.
    const landing = pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 }, false, true, false, 0, 20);
    expect(landing).toEqual([{ q: 1, r: 0 }]);
    // No route to inland tiles.
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 }, false, true)).toEqual([]);
  });

  it('returns an empty array when the shortest path overspends the move points', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const map: GameMap = { radius: 8, tiles: [L(0, 0, { unit }), M(1, 0), M(2, 0), L(3, 0)], spawns: [] };
    // Walking onto (3,0) over both mountains costs 10 + 20 + 20 = 50.
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 3, r: 0 }, true, false, false, 0, 40)).toEqual([]);
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 3, r: 0 }, true, false, false, 0, 50)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
    ]);
  });

  it('picks a cost-feasible detour when the shortest path overspends', () => {
    const unit = mkUnit(0, 'rider', 0, 0);
    const start = L(0, 0, { unit });
    const map: GameMap = {
      radius: 8,
      tiles: [
        start,
        M(1, 0), M(2, 0), M(3, 0),
        L(4, 0),
        L(0, 1), L(1, 1), L(2, 1), L(3, 1), L(4, 1),
      ],
      spawns: [],
    };
    // Direct route costs 10 + 20 + 20 + 20 = 70; the flat detour below costs
    // 6 land steps = 60. With 65 points only the detour fits.
    const path = pathBetween(map, { q: 0, r: 0 }, { q: 4, r: 0 }, true, false, false, 0, 65);
    expect(path).toEqual([
      { q: 0, r: 1 },
      { q: 1, r: 1 },
      { q: 2, r: 1 },
      { q: 3, r: 1 },
      { q: 4, r: 1 },
      { q: 4, r: 0 },
    ]);
    expect(reachableTargets(map, unit, 65, true).map((t) => `${t.q},${t.r}`)).toContain('4,0');
    // With 70 points the direct mountain route fits and wins on steps.
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 4, r: 0 }, true, false, false, 0, 70)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
      { q: 4, r: 0 },
    ]);
  });

  it('stops movement at the first cell adjacent to an enemy', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const enemy = mkUnit(1, 'warrior', 2, 1);
    map.tiles.push(L(0, 0), L(1, 0), L(2, 0), L(3, 0), L(2, 1, { unit: enemy }));
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 3, r: 0 }, false, false, false, 0)).toEqual([]);
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 }, false, false, false, 0)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it('a unit adjacent to an enemy can still move at least one cell', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const enemy = mkUnit(1, 'warrior', 1, 0);
    map.tiles.push(L(0, 0), L(1, 0, { unit: enemy }), L(0, 1));
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 0, r: 1 }, false, false, false, 0)).toEqual([{ q: 0, r: 1 }]);
  });
});
```

Note: any leftover test in the file that passes a raw tile range (e.g. `reachableTargets(map, ship, 3)`) must be updated to a points value (e.g. `20`/`30`). If no test uses `hexDistance` anymore, drop it from the import at the top of the file (`import { hexDistance } from '../src/game/hex';`). The `mkTile`/`makeMap`/`bridgeGap` helpers stay as-is; the `bridged water movement` describe block keeps its current assertions.

- [ ] **Step 3: Run the selection tests, full suite**

Run: `npm test -- tests/selection.test.ts`
Expected: PASS.
Then run: `npm test`
Expected: PASS. (Callers of `reachableTargets`/`pathBetween` still compile against the `moveRange`/old defaults; unit values are unchanged so far, and pass explicit points in the tests above.)

- [ ] **Step 4: Commit**

```bash
git add src/game/selection.ts tests/selection.test.ts
git commit -m "feat: cost-based reachability and weighted move paths"
```

---

### Task 3: Scale movement values to move points (×10) + AI/heuristic fixes

**Files:**
- Modify: `src/game/units.ts`, `src/game/ship.ts`, `src/game/unitDescriptions.ts`, `src/game/simulator.ts`, `src/game/aiSituation.ts`, `src/game/aiPatterns.ts`
- Test: `tests/units.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `UNIT_TYPES[type].movePoints` (field renamed; values ×10).
  - `UNIT_MOVE_POINTS: Record<UnitType, number>` (renamed from `UNIT_MOVEMENT`).
  - `SHIP_MOVE_POINTS: Record<1|2|3, number>` = `{1:20, 2:30, 3:40}`; `shipMovePoints(unit)`.
  - `export function movePoints(unit: Unit): number` — canonical accessor.
  - `moveRange(unit, tile?, map?)` — temporary alias returning `movePoints(unit)` (deleted in Task 4).

- [ ] **Step 1: Update `ship.ts`**

```ts
export const SHIP_MOVE_POINTS: Record<1 | 2 | 3, number> = { 1: 20, 2: 30, 3: 40 };
// ...
export function shipMovePoints(unit: Unit): number {
  return SHIP_MOVE_POINTS[unit.shipLevel!];
}
```
Remove the old `SHIP_MOVEMENT`/`shipMovement` (do not keep aliases).

- [ ] **Step 2: Update `units.ts`**

Rename the interface field and scale the tables:

```ts
interface UnitTypeInfo {
  movePoints: number;
  attack: number;
  attackDistance: number;
  maxHp: number;
  defense: number;
  price: number;
  priceWood: number;
  priceOre: number;
  shape: 'circle' | 'square' | 'triangle' | 'swordsman';
}

export const UNIT_TYPES: Record<UnitType, UnitTypeInfo> = {
  warrior: { movePoints: 10, attack: 20, attackDistance: 1, maxHp: 50, defense: 10, price: 4, priceWood: 0, priceOre: 0, shape: 'circle' },
  rider: { movePoints: 40, attack: 20, attackDistance: 1, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0, shape: 'square' },
  archer: { movePoints: 10, attack: 20, attackDistance: 2, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0, shape: 'triangle' },
  swordsman: { movePoints: 10, attack: 40, attackDistance: 1, maxHp: 80, defense: 20, price: 10, priceWood: 0, priceOre: 2, shape: 'swordsman' },
  shield: { movePoints: 10, attack: 7, attackDistance: 1, maxHp: 80, defense: 20, price: 8, priceWood: 0, priceOre: 2, shape: 'square' },
  catapult: { movePoints: 10, attack: 50, attackDistance: 4, maxHp: 30, defense: 0, price: 15, priceWood: 10, priceOre: 3, shape: 'square' },
  knight: { movePoints: 30, attack: 40, attackDistance: 1, maxHp: 60, defense: 7, price: 14, priceWood: 0, priceOre: 5, shape: 'swordsman' },
  pirate: { movePoints: 50, attack: 15, attackDistance: 3, maxHp: PIRATE_HP, defense: 5, price: 0, priceWood: 0, priceOre: 0, shape: 'square' },
};

export const UNIT_MOVE_POINTS: Record<UnitType, number> = {
  warrior: UNIT_TYPES.warrior.movePoints,
  rider: UNIT_TYPES.rider.movePoints,
  archer: UNIT_TYPES.archer.movePoints,
  swordsman: UNIT_TYPES.swordsman.movePoints,
  shield: UNIT_TYPES.shield.movePoints,
  catapult: UNIT_TYPES.catapult.movePoints,
  knight: UNIT_TYPES.knight.movePoints,
  pirate: UNIT_TYPES.pirate.movePoints,
};
```

Replace the `moveRange` function body (keep the signature so callers still compile; it becomes a pure alias dropped next task):

```ts
/** Move points a unit may spend this turn (road bonuses are handled per tile
 *  by the movement-cost model). */
export function movePoints(unit: Unit): number {
  return unit.shipLevel !== undefined ? shipMovePoints(unit) : UNIT_MOVE_POINTS[unit.type];
}

/** @deprecated use `movePoints(unit)` */
export function moveRange(unit: Unit): number {
  return movePoints(unit);
}
```

- [ ] **Step 3: Update the direct consumers so the module still compiles**

`src/game/unitDescriptions.ts`:
- Line 2: `import { SHIP_ATTACK, SHIP_ATTACK_DISTANCE, SHIP_MOVE_POINTS, SHIP_UPGRADE_COST, shipMovePoints } from './ship';`
- Line 50: `const movement = unit.shipLevel !== undefined ? shipMovePoints(unit) : UNIT_TYPES[unit.type].movePoints;`
- Line 70: `m1: SHIP_MOVE_POINTS[1], m2: SHIP_MOVE_POINTS[2], m3: SHIP_MOVE_POINTS[3],`

`src/game/simulator.ts`:
- Line 19: import `UNIT_MOVEMENT` → `UNIT_MOVE_POINTS`.
- Line 982: `for (let k = 0; k < Math.floor(UNIT_MOVE_POINTS.pirate / 10); k++) {`
- Line 1071: `const steps = path.slice(0, Math.floor(UNIT_MOVE_POINTS.pirate / 10));`

`src/game/aiSituation.ts`:
- Line 7: `import { isShip, shipAttackDistance, shipMovePoints } from './ship';`
- Line 8: import `UNIT_MOVEMENT` → `UNIT_MOVE_POINTS`.
- Lines 110-116:
```ts
function movementOf(unit: Unit): number {
  return unit.shipLevel !== undefined ? shipMovePoints(unit) : UNIT_MOVE_POINTS[unit.type];
}

export function turnsToOccupy(from: MapTile, to: MapTile, mover: Unit): number {
  // Flat-terrain estimate: a land tile costs 10 move points, so points/10
  // tiles per turn.
  return Math.max(1, Math.ceil((hexDistance(from, to) * 10) / movementOf(mover)));
}
```

`src/game/aiPatterns.ts`:
- Line 7: import `UNIT_MOVEMENT` → `UNIT_MOVE_POINTS`.
- Line 17: `import { isShip, shipAttackDistance, shipMovePoints, canUpgradeShip } from './ship';`
- Lines 42-45:
```ts
function enemyReach(unit: Unit): { move: number; attack: number } {
  if (isShip(unit)) return { move: shipMovePoints(unit) / 10, attack: shipAttackDistance(unit) };
  return { move: UNIT_MOVE_POINTS[unit.type] / 10, attack: UNIT_ATTACK_DISTANCE[unit.type] };
}
```
- Line 448: `if (hexDistance(t, v) > (d.enemyTurns * UNIT_MOVE_POINTS[unit.type]) / 10) continue;`

- [ ] **Step 4: Update `tests/units.test.ts`**

- Replace `UNIT_MOVEMENT` imports with `UNIT_MOVE_POINTS`; add `movePoints` to the import list.
- Object-equality asserts: `movement: 1` → `movePoints: 10` (warrior/archer/swordsman), `movement: 4` → `movePoints: 40` (rider), `movement: 3` → `movePoints: 30` (knight), `movement: 5` → `movePoints: 50` (pirate), shield `movement: 1` → `movePoints: 10`, catapult `movement: 1` → `movePoints: 10`.
- `UNIT_MOVEMENT.catapult` → `UNIT_MOVE_POINTS.catapult).toBe(10)`; `UNIT_MOVEMENT.knight)`.toBe(30)`.
- `moveRange`-based asserts become `movePoints`:
  - `expect(moveRange(mkUnit({ type: 'rider', hasAttacked: true }))).toBe(4)` → `expect(movePoints(mkUnit({ type: 'rider', hasAttacked: true }))).toBe(40)`
  - `expect(moveRange(mkUnit())).toBe(1)` → `expect(movePoints(mkUnit())).toBe(10)`
  - `expect(moveRange(mkUnit({ type: 'rider' }))).toBe(4)` → `expect(movePoints(mkUnit({ type: 'rider' }))).toBe(40)`
- Add ship-level checks: `expect(movePoints(mkUnit({ shipLevel: 1 }))).toBe(20)`, `movePoints(mkUnit({ shipLevel: 2 }))` → 30, `movePoints(mkUnit({ shipLevel: 3 }))` → 40; `movePoints(mkUnit({ type: 'knight' }))` → 30; `movePoints(mkUnit({ type: 'pirate' }))` → 50.
- Delete the whole `describe('moveRange road bonus', ...)` block (road-tile logic now lives in `movementCost`).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. (Known invariants that keep tests green: warrior still reaches its direct neighbours, rider 40 points still moves 4 land tiles, `turnsToOccupy(rider, dist 4)` = 1 and `turnsToOccupy(warrior, dist 4)` = 4 remain true, `enemyReach`/`enemyCanReach`/`enemyCanAttackNext` had no magnitude-dependent distances at the tested offsets.)

If any assertion still uses a raw tile range against the new points scale (e.g. `reachableTargets(map, ..., 3)` meaning "3 hexes"), convert the number to the points equivalent (`30`).

- [ ] **Step 6: Commit**

```bash
git add src/game/units.ts src/game/ship.ts src/game/unitDescriptions.ts src/game/simulator.ts src/game/aiSituation.ts src/game/aiPatterns.ts tests/units.test.ts
git commit -m "feat: move points scale (x10) and AI reach estimates"
```

---

### Task 4: Route all move calls through `movePoints`, drop `moveRange`

**Files:**
- Modify: `src/game/units.ts`, `src/game/selection.ts`, `src/game/unitActions.ts`, `src/controller/gameController.ts`, `src/game/simulator.ts`

**Interfaces:**
- Consumes: `movePoints(unit)` (Task 3).
- Final state: `moveRange` no longer exists anywhere.

- [ ] **Step 1: Replace `moveRange` usages**

`src/game/selection.ts`:
- Line 7 import: `import { movePoints as unitMovePoints, Unit } from './units';`
  (the parameter below is also named `movePoints`, so import under an alias)
- In `reachableTargets`: `const points = movePoints ?? unitMovePoints(unit);`

`src/game/unitActions.ts`:
- Line 6: remove `moveRange` from the import; add `movePoints`.
- Line 12: `canMove(unit) && reachableTargets(map, unit, movePoints(unit), canClimb, canDock, player.index).length > 0`

`src/controller/gameController.ts`:
- Line 15: replace `moveRange` with `movePoints` in the import.
- Lines 1237-1239: `const canClimb = hasSkill(store.players[unit.owner]!, 'climbing');` stays; call becomes:
```ts
this.reachableKeys = new Set(reachableTargets(this.sim.map, unit, movePoints(unit), canClimb, canDock, store.localPlayerIndex).map((t) => axialKey(t)));
```

`src/game/simulator.ts`:
- Line 19: import `moveRange` → `movePoints`.
- Line 304: `const reachable = reachableTargets(this.map, unit, movePoints(unit), canClimb, canDock, unit.owner);`
- Line 307: `const path = pathBetween(this.map, from, { q, r }, canClimb, unit.shipLevel !== undefined, canDock, unit.owner, movePoints(unit));`
- Line 588: same replacement as 304.
- Line 591: `const path = pathBetween(this.map, from, { q, r }, canClimb, true, canDock, unit.owner, movePoints(unit));`

`src/game/units.ts`:
- Delete the `moveRange` function (and its `@deprecated` comment).

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS. (This is the task that re-verifies move validation: `doMove`/`doShipLanding` now pass the unit's points to both `reachableTargets` and `pathBetween`; `optimisticUpdate` picks a direct neighbour which is always reachable.)

Also run: `npm run typecheck`
Expected: PASS with no `moveRange` references.

- [ ] **Step 3: Commit**

```bash
git add src/game/units.ts src/game/selection.ts src/game/unitActions.ts src/controller/gameController.ts src/game/simulator.ts
git commit -m "refactor: move validation uses movePoints only"
```

---

### Task 5: UI strings, GAME.md, and help text tests

**Files:**
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/ru.ts`, `GAME.md`
- Test: `tests/unitDescriptions.test.ts`, `tests/unitHelpDialog.test.ts`

- [ ] **Step 1: Update English strings (`src/i18n/locales/en.ts`)**

- `'help.stat.movement': '{n} move points'`
- `'help.warrior.melee': 'Basic melee unit: 10 move points, 20 attack, 50 HP.'`
- `'help.rider.base': 'Fast mounted unit: 40 move points, 20 attack, 40 HP.'`
- `'help.archer.base': 'Ranged unit: 10 move points, 20 attack at range 2, 30 HP.'`
- `'help.swordsman.base': 'Heavy melee unit: 10 move points, 40 attack, 80 HP.'`
- `'help.shield.base': 'Defender: 10 move points, 10 attack, 80 HP.'`
- `'help.catapult.base': 'Siege unit: 10 move points, attack range 4, 30 HP.'`
- `'help.knight.base': 'Elite cavalry: 30 move points, 50 attack, 50 HP.'`
- `'help.pirate.base': 'Neutral sea raider: 50 move points on water, 30 attack, 150 HP.'`
- `'help.ship.stats': 'Ship move points are {m1}/{m2}/{m3}, attack {a1}/{a2}/{a3} at range {d1}/{d2}/{d3} for levels 1/2/3.'`

- [ ] **Step 2: Update Russian strings (`src/i18n/locales/ru.ts`)**

- `'help.stat.movement': 'Очки хода: {n}'`
- `'help.warrior.melee': 'Базовый ближний боец: 10 очков хода, атака 20, 50 HP.'`
- `'help.rider.base': 'Быстрый всадник: 40 очков хода, атака 20, 40 HP.'`
- `'help.archer.base': 'Стрелок: 10 очков хода, атака 20 на дистанции 2, 30 HP.'`
- `'help.swordsman.base': 'Тяжёлый мечник: 10 очков хода, атака 40, 80 HP.'`
- `'help.shield.base': 'Защитник: 10 очков хода, атака 10, 80 HP.'`
- `'help.catapult.base': 'Осадное орудие: 10 очков хода, дальность атаки 4, 30 HP.'`
- `'help.knight.base': 'Элитная конница: 30 очков хода, атака 50, 50 HP.'`
- `'help.pirate.base': 'Нейтральный морской разбойник: 50 очков хода по воде, атака 30, 150 HP.'`
- `'help.ship.stats': 'Очки хода корабля {m1}/{m2}/{m3}, атака {a1}/{a2}/{a3} на дистанции {d1}/{d2}/{d3} для уровней 1/2/3.'`

- [ ] **Step 3: Update the help-stat tests**

`tests/unitDescriptions.test.ts`:
- `expect(move!.text).toBe('1 movement')` → `'10 move points'`
- row-array assert `{ icon: '16/move-16.png', text: '1 movement' }` → `'10 move points'`
- `expect(rows.find((r) => r.icon === '16/move-16.png')!.text).toBe('3 movement')` → `'30 move points'`

`tests/unitHelpDialog.test.ts`:
- `expect(texts).toContain('1 movement')` → `expect(texts).toContain('10 move points')`

- [ ] **Step 4: Update `GAME.md`**

1. Unit table header `Movement` → `Move points`; values to `10` (warrior), `40` (rider), `10` (archer), `10` (swordsman), `10` (shield), `10` (catapult), `30` (knight).
2. Replace the **Move** bullet with:

```
- **Move** — spend up to the unit's move points. Leaving a tile costs that
  tile's move points: land and water 10, forest 14, mountain 20 (entering a
  tile is free — the cost is paid when the unit leaves it). A unit may always
  make a 1-tile move even without move points left. Mountains block movement
  until *Climbing* is learned, and water blocks movement (except for ships
  with *Navigation*). A rider that already attacked this turn can still move
  up to its full move points. Leaving the unit's own road tile, a road on its
  own territory, its own village linked to its road network, or a water-route
  tile of its own ports halves the tile's cost (rounded down), so road
  networks are the fast lanes. Movement stops at the first cell adjacent to an
  enemy: that cell can be entered, but cells beyond it along the path are not
  available (a unit next to an enemy can always move at least 1 cell).
```

3. In the **Ships** bullet: "Ships move 2/3/4 (levels 1/2/3)" → "Ships have 20/30/40 move points (levels 1/2/3)".
4. In the **Pirates** bullet: "Pirates move 5 on sea only" → "Pirates have 50 move points, on sea only".
5. In **Auto port connections**: remove the sentence "Water-route tiles never grant movement bonuses." and append: "Water-route tiles halve the move-points cost for their owner."

- [ ] **Step 5: Run the full suite + typecheck + build**

Run: `npm test` then `npm run typecheck` then `npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/ru.ts GAME.md tests/unitDescriptions.test.ts tests/unitHelpDialog.test.ts
git commit -m "docs: move-points labels and GAME.md movement rules"
```