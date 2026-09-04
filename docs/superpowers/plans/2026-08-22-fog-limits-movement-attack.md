# Fog Limits on Movement and Attack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent units from moving into or through unexplored cells, and from attacking enemies on unexplored cells, for all players.

**Architecture:** Thread a `playerIndex` parameter through `reachableTargets`/`pathBetween` (selection) and `attackableTargets` (combat), filtering on `isExploredFor`. Update every caller to pass the acting player index.

**Tech Stack:** TypeScript, Vite, Vitest.

## Global Constraints

- No new dependencies.
- Default `playerIndex = 0` keeps callers that don't pass it compiling; **but** existing tests build tiles without `exploredBy`, so `isExploredFor(t, 0)` is false and those tests would break — the test helpers must set `exploredBy` for the acting player.
- Applies to all players symmetrically (per-player `exploredBy` fog model).
- Existing suite + typecheck pass after updates.

---

### Task 1: Fog limits in selection

**Files:**
- Modify: `src/game/selection.ts`
- Test: `tests/selection.test.ts`

**Interfaces:**
- Consumes: `isExploredFor` from `./explore`.
- Produces: `reachableTargets(map, unit, range?, canClimb?, canDock?, playerIndex = 0)` and `pathBetween(map, from, to, canClimb?, canSail?, canDock?, playerIndex = 0)` exclude unexplored tiles.

- [ ] **Step 1: Update the test helper and add failing tests**

In `tests/selection.test.ts`, update `makeTile` so tiles are explored by default for the actor (player 0):

```ts
function makeTile(
  q: number,
  r: number,
  terrain: TileType,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain, settlement, unit, ownedBy: null, claimedByVillage: null, building: null, exploredBy: [0] };
}
```

Add tests to `describe('reachableTargets')`:

```ts
  it('excludes unexplored tiles', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    map.tiles.forEach((t) => { if (t.q !== 0 || t.r !== 0) t.exploredBy = []; });
    const keys = reachableTargets(map, unit).map((t) => `${t.q},${t.r}`);
    expect(keys).not.toContain('0,1');
  });
```

Add tests to `describe('pathBetween')`:

```ts
  it('cannot pass through unexplored tiles', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.GrasslandLand));
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    map.tiles[1].exploredBy = [];
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([]);
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail and others still pass**

Run: `npx vitest run tests/selection.test.ts`
Expected: the two new tests fail (unexplored tiles still reachable); existing tests pass (helper now explores everything for player 0).

- [ ] **Step 3: Implement in `selection.ts`**

a. Add the import:

```ts
import { isExploredFor } from './explore';
```

b. Update `reachableTargets`:

```ts
export function reachableTargets(
  map: GameMap,
  unit: Unit,
  range = UNIT_MOVEMENT[unit.type],
  canClimb = false,
  canDock = false,
  playerIndex = 0,
): MapTile[] {
  const from = { q: unit.q, r: unit.r };
  const candidates = map.tiles.filter((t) => {
    if (hexDistance(from, t) > range) return false;
    if (!isExploredFor(t, playerIndex)) return false;
    if (t.terrain === TileType.Water) {
      if (!isShip(unit) && !(t.building && t.building.kind === 'port' && canDock)) return false;
    } else if (isShip(unit) && !hasWaterNeighbor(map, t)) {
      return false;
    }
    if (!canClimb && isMountainType(t.terrain)) return false;
    if (t.unit) return false;
    return true;
  });
  return candidates.filter((t) => {
    const path = pathBetween(map, from, t, canClimb, isShip(unit), canDock, playerIndex);
    return path.length > 0 && path.length <= range;
  });
}
```

c. Update `pathBetween`:

```ts
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
      if (tile.terrain === TileType.Water && !canSail && !(tile.building && tile.building.kind === 'port' && canDock)) continue;
      if (canSail && tile.terrain !== TileType.Water && !(n.q === to.q && n.r === to.r)) continue;
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
          c = { q: pq, r: pr };
        }
        return path;
      }
      queue.push({ ...n });
    }
  }
  return [];
}
```

- [ ] **Step 4: Run the selection tests**

Run: `npx vitest run tests/selection.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/selection.ts tests/selection.test.ts
git commit -m "feat: units cannot move into unexplored cells"
```

---

### Task 2: Fog limits in combat

**Files:**
- Modify: `src/game/combat.ts`
- Test: `tests/combat.test.ts`

**Interfaces:**
- Consumes: `isExploredFor` from `./explore`.
- Produces: `attackableTargets(map, unit, playerIndex = 0)` excludes unexplored target tiles.

- [ ] **Step 1: Update the test helper and add a failing test**

In `tests/combat.test.ts`, update `makeTile` to explore tiles for the actor (player 0):

```ts
function makeTile(
  q: number,
  r: number,
  terrain: TileType,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain, settlement: null, unit, ownedBy: null, claimedByVillage: null, building: null, exploredBy: [0] };
}
```

Add a test in `describe('attackableTargets')`:

```ts
  it('excludes enemies on unexplored tiles', () => {
    const map = makeMap();
    const attacker = map.tiles[0].unit!;
    const waterTile = map.tiles[2];
    waterTile.exploredBy = [];
    const keys = attackableTargets(map, attacker).map((t) => `${t.q},${t.r}`);
    expect(keys).not.toContain('0,-1');
    expect(keys).toContain('1,0');
  });
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `npx vitest run tests/combat.test.ts`
Expected: the new test fails (unexplored water enemy still attackable); others pass.

- [ ] **Step 3: Implement in `combat.ts`**

a. Add the import:

```ts
import { isExploredFor } from './explore';
```

b. Update `attackableTargets`:

```ts
export function attackableTargets(map: GameMap, unit: Unit, playerIndex = 0): MapTile[] {
  return map.tiles.filter((t) => {
    if (!t.unit) return false;
    if (t.unit.owner === unit.owner) return false;
    if (hexDistance({ q: unit.q, r: unit.r }, t) > shipAttackDistance(unit)) return false;
    if (!isExploredFor(t, playerIndex)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run the combat tests**

Run: `npx vitest run tests/combat.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.ts tests/combat.test.ts
git commit -m "feat: units cannot attack enemies in unexplored cells"
```

---

### Task 3: Thread playerIndex through callers

**Files:**
- Modify: `src/game/simulator.ts`
- Modify: `src/controller/gameController.ts`
- Modify: `src/game/ai.ts`
- Modify: `src/game/aiPatterns.ts`
- Modify: `src/game/unitActions.ts`

**Interfaces:**
- Consumes: the new `playerIndex` parameters from Tasks 1-2.
- Produces: all callers pass the acting player's index so fog limits apply everywhere.

- [ ] **Step 1: Update `simulator.ts`**

- `doMove` line 171: `reachableTargets(this.map, unit, moveRange(unit), canClimb, canDock, unit.owner)`
- `doMove` line 174: `pathBetween(this.map, from, { q, r }, canClimb, unit.shipLevel !== undefined, canDock, unit.owner)`
- `doAttack` line 190: `attackableTargets(this.map, attacker, attacker.owner)`
- `doShipLanding` line 337: `reachableTargets(this.map, unit, moveRange(unit), canClimb, canDock, unit.owner)`
- `doShipLanding` line 340: `pathBetween(this.map, from, { q, r }, canClimb, true, canDock, unit.owner)`

- [ ] **Step 2: Update `gameController.ts`**

- Line 1344: `reachableTargets(this.sim.map, unit, moveRange(unit), canClimb, canDock, store.localPlayerIndex)`
- Line 1347: `attackableTargets(this.sim.map, unit, store.localPlayerIndex)`

- [ ] **Step 3: Update `ai.ts`**

- `greedyMoveTarget` line 58: `reachableTargets(map, unit, undefined, undefined, canDock, unit.owner)`
- `randomAvailableAction` line 105: `attackableTargets(map, unit, unit.owner)`

- [ ] **Step 4: Update `aiPatterns.ts`**

- Line 76: `attackableTargets(map, unit, unit.owner)`
- Line 84: `reachableTargets(map, unit, undefined, undefined, undefined, unit.owner)`
- Line 130: `reachableTargets(map, unit, undefined, undefined, hasSkill(player, 'navigation'), unit.owner)`
- Line 163: same as line 130.

- [ ] **Step 5: Update `unitActions.ts`**

- Line 12: `reachableTargets(map, unit, moveRange(unit), canClimb, canDock, player.index)`
- Line 13: `attackableTargets(map, unit, player.index)`

- [ ] **Step 6: Run full tests, typecheck, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass. Any remaining call sites that relied on default `playerIndex = 0` will be caught by typecheck if signature mismatch; grep for remaining calls to confirm all updated.

Run: `grep -rn "reachableTargets(\|attackableTargets(\|pathBetween(" src/ --include="*.ts" | grep -v "export function"`
Expected: every call site passes a `playerIndex` argument (or is the internal call in `selection.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/game/simulator.ts src/controller/gameController.ts src/game/ai.ts src/game/aiPatterns.ts src/game/unitActions.ts
git commit -m "feat: apply fog limits to movement and attack for all players"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, start a single-player game with 2 players.
Check:
- A unit cannot move onto an unexplored cell (no move dot appears; clicks are ignored).
- A unit cannot move *through* fog to reach a discovered cell beyond it.
- A unit cannot attack an enemy whose cell is still fog; after the enemy's cell is
  discovered (e.g. by moving near it), it becomes attackable.
- The AI behaves under the same fog limits.
