# Map Size, Village Distance, Water Border, and Start Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump map radii by 1, enforce a 4-tile minimum village distance, ring the map with a 1-tile water border, and pre-select the local player's starting unit.

**Architecture:** All map changes live in `src/game/mapGen.ts` (`mapRadiusFor` + `generateMap`); the start selection is one store call in `gameController.startGame()`. Tests in `tests/mapGen.test.ts` are updated to match.

**Tech Stack:** TypeScript, Vite, Vitest.

## Global Constraints

- No new dependencies.
- Final map radii per player count: 2→8, 3→9, 4→10 (mapRadiusFor +1, then +1 water border).
- Minimum pairwise village distance (and start↔free distance) is 4.
- Forced water ring: exactly the outermost ring (`hexDistance` from center `=== radius`).
- Natural water/mountain ratio test excludes the forced border ring.
- Existing test suite and typecheck must pass after changes.

---

### Task 1: Bump map radii and enforce water border + village distance 4

**Files:**
- Modify: `src/game/mapGen.ts:49-54` (mapRadiusFor)
- Modify: `src/game/mapGen.ts:71-127` (generateMap: radius, water ring, closeness check)
- Test: `tests/mapGen.test.ts`

**Interfaces:**
- Consumes: `allTiles(radius)`, `hexDistance({q,r}, tile)`, `generateTerrain`, `TileType.Water` (all already imported in `mapGen.ts`).
- Produces: `mapRadiusFor(2|3|4) === 7|8|9`; `generateMap(playerCount, seed)` returns a `GameMap` with `radius === mapRadiusFor(playerCount) + 1`, its outermost ring forced to `TileType.Water`, and all settlements at pairwise distance `>= 4`.

- [ ] **Step 1: Update failing tests first (TDD)**

In `tests/mapGen.test.ts`:

a. Update the radius expectations (lines ~7-13):

```ts
it('chooses radius by player count', () => {
  expect(mapRadiusFor(2)).toBe(7);
  expect(mapRadiusFor(3)).toBe(8);
  expect(mapRadiusFor(4)).toBe(9);
  expect(() => mapRadiusFor(1)).toThrow();
  expect(() => mapRadiusFor(5)).toThrow();
});
```

b. Update "generates the expected number of tiles" — `generateMap(2, 42)` now has `allTiles(8).length` tiles because of the +1 water border:

```ts
it('generates the expected number of tiles', () => {
  const map = generateMap(2, 42);
  expect(map.tiles).toHaveLength(allTiles(8).length);
});
```

c. Update the two distance tests (`>= 3` → `>= 4`):

```ts
it('keeps all villages at pairwise distance >= 4', () => {
  const map = generateMap(3, 42);
  const villages = map.tiles.filter((t) => t.settlement !== null);
  for (let i = 0; i < villages.length; i++) {
    for (let j = i + 1; j < villages.length; j++) {
      expect(hexDistance(villages[i], villages[j])).toBeGreaterThanOrEqual(4);
    }
  }
});
```

```ts
it('pairs each player with a free village at distance >= 4', () => {
  const map = generateMap(3, 42);
  expect(map.spawns).toHaveLength(3);
  for (const s of map.spawns) {
    expect(hexDistance(s.start, s.free)).toBeGreaterThanOrEqual(4);
  }
});
```

d. Update the water/mountain ratio test (lines ~57-79) to exclude the forced border ring from the wild sample:

```ts
it('produces roughly 50% water and 20% mountains away from villages', () => {
  const map = generateMap(3, 42);
  const radius = map.radius;
  const nearVillage = new Set<string>();
  for (const s of map.tiles.filter((t) => t.settlement !== null)) {
    for (const n of tilesInRange(s, 1)) nearVillage.add(axialKey(n));
  }
  const wild = map.tiles.filter(
    (t) => !nearVillage.has(axialKey(t)) && hexDistance({ q: 0, r: 0 }, t) < radius,
  );
  expect(wild.length).toBeGreaterThan(0);
  const water = wild.filter((t) => t.terrain === TileType.Water).length / wild.length;
  const mountain =
    wild.filter(
      (t) =>
        t.terrain === TileType.GrasslandMountain ||
        t.terrain === TileType.DesertMountain ||
        t.terrain === TileType.TundraMountain ||
        t.terrain === TileType.TaigaMountain ||
        t.terrain === TileType.RainforestMountain,
    ).length / wild.length;
  expect(water).toBeGreaterThan(0.42);
  expect(water).toBeLessThan(0.58);
  expect(mountain).toBeGreaterThan(0.12);
  expect(mountain).toBeLessThan(0.25);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the radius test fails (`expected 6 to be 7`), the tile-count test fails, and the ratio test fails or errors.

- [ ] **Step 3: Update `mapRadiusFor`**

In `src/game/mapGen.ts`:

```ts
export function mapRadiusFor(playerCount: number): number {
  if (playerCount === 2) return 7;
  if (playerCount === 3) return 8;
  if (playerCount === 4) return 9;
  throw new Error(`Unsupported player count: ${playerCount}`);
}
```

- [ ] **Step 4: Update `generateMap` for the water border and distance 4**

In `src/game/mapGen.ts`:

a. Add a module constant near the top (after imports):

```ts
const WATER_BORDER = 1;
```

b. In `generateMap`, change the radius line (line 72):

```ts
const radius = mapRadiusFor(playerCount) + WATER_BORDER;
```

c. After `generateTerrain([...tileMap.values()], seed);` (line 91), force the outer ring to water:

```ts
for (const tile of tileMap.values()) {
  if (hexDistance({ q: 0, r: 0 }, tile) === radius) {
    tile.terrain = TileType.Water;
  }
}
```

d. Change the closeness check (line 98) from `< 3` to `< 4`:

```ts
const isTooCloseToAnyVillage = (t: { q: number; r: number }): boolean =>
  placedVillages.some((v) => hexDistance(t, v) < 4);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all 37 test files pass.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/mapGen.ts tests/mapGen.test.ts
git commit -m "feat: bigger maps, water border ring, min village distance 4"
```

---

### Task 2: Auto-select the local player's starting unit

**Files:**
- Modify: `src/controller/gameController.ts:210-239` (startGame)

**Interfaces:**
- Consumes: `map.spawns[localPlayerIndex].start` from `generateMap`; `store.setSelection(selection)` from `useGameStore`; `Selection` shape `{ kind: 'unit', q, r }`.
- Produces: after `startGame` completes, `store.selection` is `{ kind: 'unit', q: start.q, r: start.r }` for the local player's starting village.

- [ ] **Step 1: Set the selection in `startGame`**

In `src/controller/gameController.ts` in `startGame`, right after `store.setScreen('game');` (line 230), add:

```ts
const start = map.spawns[store.localPlayerIndex].start;
store.setSelection({ kind: 'unit', q: start.q, r: start.r });
```

`store.localPlayerIndex` was already set to `0` at line 224, so this selects the human player's starting warrior in single-player. In multiplayer host mode the same call selects the host's unit.

- [ ] **Step 2: Typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: passes.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: select local player's starting unit on game start"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Run the dev server and verify**

Run: `npm run dev`, open the game, start a single-player game.
Expected:
- The map is visibly larger and fully ringed by a water border.
- Your starting warrior is pre-selected (red highlight + info panel).
- All villages are at least 4 tiles apart.
- Ships can sail along the water border.
