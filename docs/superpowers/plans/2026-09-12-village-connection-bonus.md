# Village Connection Income Bonus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A village connected (via `isVillageRoadConnected`) to another same-owner village earns +1 money per turn, applied after its income floor.

**Architecture:** Modify `villageIncome` in `src/game/capture.ts` — the single source of truth that `villageIncomeTotal`, `HudMoney`, the selected-village tooltip, help text, and end-turn collection all descend from. The connectivity check reuses the existing `isVillageRoadConnected` (`src/game/roads.ts:50`).

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass.
- Follow existing code style: no comments unless self-evident, 2-space indent, `noUncheckedIndexedAccess` (index access needs `!`).
- The bonus is **after** the income floor: `net = Math.max(0, base - maintenance); net + 1` when connected.
- Enemy-occupied villages keep returning 0 (no bonus).
- `makeTile` in `tests/capture.test.ts` does not set `roadOwner`; road-connection tests must build their own tiles with `roadOwner: 0` (see Task 1 Step 1).
- Commit after each task with conventional messages (`feat:`).

---

### Task 1: Add the connection bonus to `villageIncome`

**Files:**
- Modify: `src/game/capture.ts`
- Test: `tests/capture.test.ts`

**Interfaces:**
- Consumes: `isVillageRoadConnected(map, villageTile)` from `./roads` (exists; default second arg builds `portWaterClusterJumps`).
- Produces: `export const VILLAGE_CONNECTION_BONUS = 1`. `villageIncome` returns the bonus for connected own villages. Everything downstream (`villageIncomeTotal`, HUD, help, collection) inherits it unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/capture.test.ts`, add a `roadTile` helper next to `makeTile` and new tests inside the `describe('villageIncome', ...)` block (after the existing `respects the owner after the enemy leaves` test at line ~193).

Add the helper (right after `makeTile`, ~line 14):

```ts
function makeRoadTile(q: number, r: number, owner: number): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement: null, unit: null, ownedBy: owner, claimedByVillage: null, building: null, roadOwner: owner };
}
```

Add these tests inside `describe('villageIncome', ...)`:

```ts
  it('gives +1 income to each village of a road-connected pair', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const a = makeTile(0, 0, { owner: 0, level: 1, captureReady: false }); // base 5
    const b = makeTile(2, 0, { owner: 0, level: 1, captureReady: false }); // base 5
    a.ownedBy = 0;
    b.ownedBy = 0;
    map.tiles.push(a, b, makeRoadTile(1, 0, 0));
    expect(villageIncome(map, a)).toBe(5 + 1);
    expect(villageIncome(map, b)).toBe(5 + 1);
  });

  it('gives +1 (not +2) to each village in a three-village road chain', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const a = makeTile(0, 0, { owner: 0, level: 1, captureReady: false }); // base 5
    const b = makeTile(2, 0, { owner: 0, level: 1, captureReady: false });
    const c = makeTile(4, 0, { owner: 0, level: 1, captureReady: false });
    for (const t of [a, b, c]) t.ownedBy = 0;
    map.tiles.push(a, b, c, makeRoadTile(1, 0, 0), makeRoadTile(3, 0, 0));
    expect(villageIncome(map, a)).toBe(5 + 1);
    expect(villageIncome(map, b)).toBe(5 + 1);
    expect(villageIncome(map, c)).toBe(5 + 1);
  });

  it('counts two directly adjacent own villages as connected', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const a = makeTile(0, 0, { owner: 0, level: 1, captureReady: false }); // base 5
    const b = makeTile(1, 0, { owner: 0, level: 1, captureReady: false });
    a.ownedBy = 0;
    b.ownedBy = 0;
    map.tiles.push(a, b);
    expect(villageIncome(map, a)).toBe(5 + 1);
    expect(villageIncome(map, b)).toBe(5 + 1);
  });

  it('gives no bonus to a connected village while an enemy stands on it', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const a = makeTile(0, 0, { owner: 0, level: 3, captureReady: false }); // base 9
    const b = makeTile(2, 0, { owner: 0, level: 1, captureReady: false });
    a.ownedBy = 0;
    b.ownedBy = 0;
    map.tiles.push(a, b, makeRoadTile(1, 0, 0));
    const enemy = makeUnit('e', 1, 0, 0);
    enemy.spawnVillage = null;
    a.unit = enemy;
    expect(villageIncome(map, a)).toBe(0);
  });
```

In the existing `describe('villageIncomeTotal', ...)` block, add:

```ts
  it('includes the connection bonus for a road-connected pair', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const a = makeTile(0, 0, { owner: 0, level: 1, captureReady: false }); // base 5
    const b = makeTile(2, 0, { owner: 0, level: 2, captureReady: false }); // base 7
    a.ownedBy = 0;
    b.ownedBy = 0;
    map.tiles.push(a, b, makeRoadTile(1, 0, 0));
    expect(villageIncomeTotal(map, 0)).toBe((5 + 1) + (7 + 1));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/capture.test.ts`
Expected: the 5 new tests FAIL (bonus missing → they expect `base + 1` but get `base`). Existing tests still pass.

- [ ] **Step 3: Implement**

In `src/game/capture.ts`, add the import and constant at the top:

```ts
import { isVillageRoadConnected } from './roads';
```

```ts
/** Extra money income per turn for a village connected to another own village. */
export const VILLAGE_CONNECTION_BONUS = 1;
```

Change `villageIncome` from:

```ts
export function villageIncome(map: GameMap, villageTile: MapTile): number {
  if (villageEnemyOccupied(villageTile)) return 0;
  const level = villageTile.settlement!.level;
  const base = 3 + level * 2;
  return Math.max(0, base - villageMaintenance(map, villageTile));
}
```

to:

```ts
export function villageIncome(map: GameMap, villageTile: MapTile): number {
  if (villageEnemyOccupied(villageTile)) return 0;
  const level = villageTile.settlement!.level;
  const base = 3 + level * 2;
  const net = Math.max(0, base - villageMaintenance(map, villageTile));
  return isVillageRoadConnected(map, villageTile) ? net + VILLAGE_CONNECTION_BONUS : net;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/capture.test.ts tests/roads.test.ts tests/village.test.ts tests/waterRoads.test.ts`
Expected: PASS (new tests green; existing capture/roads/village/waterRoads tests unchanged).

- [ ] **Step 5: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS. If any HUD/simulator test asserts an exact income number that now includes a connection bonus, that map must have a connected pair — check the failure and adjust only that fixture (do not change the rule).

- [ ] **Step 6: Commit**

```bash
git add src/game/capture.ts tests/capture.test.ts
git commit -m "feat: connected own villages earn +1 income"
```

---

## Self-Review

**Spec coverage:**
- Bonus after floor — Task 1 Step 3 (`net + VILLAGE_CONNECTION_BONUS`, net already floored) ✓
- Reuse `isVillageRoadConnected` — Task 1 Step 3 ✓
- Enemy-occupied → 0 — unchanged first `return 0` guard ✓
- Two-village road pair +1 each — Task 1 Step 1 ✓
- Three-village chain +1 (not +2) — Task 1 Step 1 ✓
- Adjacent own villages (no roads) count — Task 1 Step 1 ✓
- `villageIncomeTotal` sums bonuses — Task 1 Step 1 ✓
- HUD/help/collection inherit via `villageIncome` — no changes needed ✓

**Placeholders:** none — real test code and implementation in every step.

**Type consistency:**
- `VILLAGE_CONNECTION_BONUS` exported and referenced in the same file.
- `makeRoadTile(q, r, owner)` returns a `MapTile` matching the `MapTile` interface (includes `roadOwner`), used identically in all new tests.
- `villageIncome`'s existing signature is unchanged; only the return expression changed.