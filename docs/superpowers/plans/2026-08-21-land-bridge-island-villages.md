# Land Bridge for Stranded Island Villages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect villages stranded on 1-ring islands (ring-1 all land, ring-2 all water) and build a single-tile land bridge to the nearest outside land.

**Architecture:** A new exported helper `bridgeIslandVillages(tiles: MapTile[])` in `src/game/mapGen.ts` detects stranded settlements and runs a BFS over water tiles from the island's ring-1 edge to the nearest non-water tile at distance >= 2, converting the water path to biome land. `generateMap` calls it after settlement placement.

**Tech Stack:** TypeScript, Vite, Vitest.

## Global Constraints

- No new dependencies.
- Applies to all settlements (owned capitals and free villages).
- Bridge is a single-tile path (narrowest).
- Bridge tiles become `BIOME_LAND[tile.biome!]`.
- Only `terrain` changes; `ownedBy`, claims, units, settlements are untouched.
- Existing suite (270 tests) and typecheck pass.

---

### Task 1: Add `bridgeIslandVillages` helper with tests

**Files:**
- Modify: `src/game/mapGen.ts`
- Test: `tests/mapGen.test.ts`

**Interfaces:**
- Consumes: `MapTile` (defined in `mapGen.ts`), `hexNeighbors`, `hexDistance`, `axialKey` (from `./hex`), `isWaterType` (from `./tileTypes`), `BIOME_LAND` (from `./biomes`).
- Produces: `bridgeIslandVillages(tiles: MapTile[]): void` — mutates `terrain` on water tiles along bridge paths.

- [ ] **Step 1: Write the failing tests (TDD)**

Add to `tests/mapGen.test.ts` a helper to build a synthetic tile map:

```ts
function tileAt(q: number, r: number, terrain: TileType, settlement: Settlement | null = null): MapTile {
  return {
    q,
    r,
    terrain,
    biome: Biome.Grassland,
    settlement,
    building: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
  };
}
```

Import `bridgeIslandVillages`, `Biome`, `Settlement`, `MapTile` at the top of the test file (update the existing imports from `'../src/game/mapGen'` and `'../src/game/biomes'`).

Add tests:

```ts
describe('bridgeIslandVillages', () => {
  it('builds a land bridge for a village stranded on a 1-ring island', () => {
    const tiles = [
      tileAt(0, 0, TileType.GrasslandLand, { owner: 0, level: 1, captureReady: false, capital: true }),
      ...ringOf({ q: 0, r: 0 }, 1).map((n) => tileAt(n.q, n.r, TileType.GrasslandLand)),
      ...ringOf({ q: 0, r: 0 }, 2).map((n) => tileAt(n.q, n.r, TileType.Water)),
    ];
    const mainland = { q: 3, r: 0 };
    tiles.push(tileAt(mainland.q, mainland.r, TileType.GrasslandLand));

    bridgeIslandVillages(tiles);

    const byKey = new Map(tiles.map((t) => [axialKey(t), t]));
    expect(isWaterType(byKey.get('1,0')!.terrain)).toBe(false);
    expect(isWaterType(byKey.get('2,0')!.terrain)).toBe(false);
    // The village now reaches mainland through non-water tiles.
    const reachable = new Set<string>();
    const frontier = [{ q: 0, r: 0 }];
    while (frontier.length > 0) {
      const cur = frontier.pop()!;
      for (const n of hexNeighbors(cur)) {
        const k = axialKey(n);
        const t = byKey.get(k);
        if (!t || reachable.has(k) || isWaterType(t.terrain)) continue;
        reachable.add(k);
        frontier.push(n);
      }
    }
    expect(reachable.has(axialKey(mainland))).toBe(true);
  });

  it('leaves the map untouched when the village is not stranded', () => {
    const tiles = [
      tileAt(0, 0, TileType.GrasslandLand, { owner: 0, level: 1, captureReady: false, capital: true }),
      ...ringOf({ q: 0, r: 0 }, 1).map((n) => tileAt(n.q, n.r, TileType.GrasslandLand)),
      ...ringOf({ q: 0, r: 0 }, 2).map((n) => tileAt(n.q, n.r, TileType.Water)),
      tileAt(2, 0, TileType.GrasslandLand), // land within ring-2 => not an island
    ];
    const before = tiles.map((t) => t.terrain);

    bridgeIslandVillages(tiles);

    expect(tiles.map((t) => t.terrain)).toEqual(before);
  });
});
```

Import `ringOf` from `'../src/game/hex'` in the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mapGen.test.ts`
Expected: FAIL — `bridgeIslandVillages is not a function`.

- [ ] **Step 3: Implement the helper in `mapGen.ts`**

Add imports at the top of `src/game/mapGen.ts`:

```ts
import { isWaterType } from './tileTypes';
```

Add the helper after `mapRadiusFor` (or anywhere module-level in `mapGen.ts`):

```ts
export function bridgeIslandVillages(tiles: MapTile[]): void {
  const tileMap = new Map<string, MapTile>(tiles.map((t) => [axialKey(t), t]));
  for (const tile of tiles) {
    if (!tile.settlement) continue;
    const ring1AllLand = ringOf(tile, 1).every((n) => {
      const t = tileMap.get(axialKey(n));
      return t !== undefined && !isWaterType(t.terrain);
    });
    if (!ring1AllLand) continue;
    const ring2AllWater = ringOf(tile, 2).every((n) => {
      const t = tileMap.get(axialKey(n));
      return t !== undefined && isWaterType(t.terrain);
    });
    if (!ring2AllWater) continue;
    bridgeToNearestLand(tileMap, tile);
  }
}

function bridgeToNearestLand(tileMap: Map<string, MapTile>, settlement: MapTile): void {
  const key = (a: { q: number; r: number }): string => axialKey(a);
  const visited = new Set<string>();
  const parent = new Map<string, { q: number; r: number } | null>();
  const queue: { q: number; r: number }[] = [];
  for (const n of ringOf(settlement, 1)) {
    const k = key(n);
    if (!visited.has(k)) {
      visited.add(k);
      parent.set(k, null);
      queue.push(n);
    }
  }
  let target: { q: number; r: number } | null = null;
  while (queue.length > 0 && !target) {
    const cur = queue.shift()!;
    for (const n of hexNeighbors(cur)) {
      const k = key(n);
      if (visited.has(k)) continue;
      const t = tileMap.get(k);
      if (!t) continue;
      visited.add(k);
      parent.set(k, cur);
      if (!isWaterType(t.terrain) && hexDistance(settlement, n) >= 2) {
        target = n;
        break;
      }
      if (isWaterType(t.terrain)) queue.push(n);
    }
  }
  if (!target) return;
  let cur: { q: number; r: number } | null = target;
  while (cur) {
    const t = tileMap.get(key(cur));
    if (t && isWaterType(t.terrain)) {
      t.terrain = BIOME_LAND[t.biome!];
    }
    cur = parent.get(key(cur)) ?? null;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/mapGen.test.ts`
Expected: PASS, including the two new tests and all existing map-gen tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/mapGen.ts tests/mapGen.test.ts
git commit -m "feat: land bridge for stranded island villages"
```

---

### Task 2: Wire the bridge into `generateMap`

**Files:**
- Modify: `src/game/mapGen.ts:177` (before the return)

**Interfaces:**
- Consumes: `bridgeIslandVillages(tiles)` from Task 1.
- Produces: `generateMap` returns a map where no settlement is stranded on a 1-ring island.

- [ ] **Step 1: Call the helper before returning**

In `generateMap`, after the unit-placement loop and before the final `return` (line 177), add:

```ts
bridgeIslandVillages([...tileMap.values()]);
```

- [ ] **Step 2: Add a map-level integration test**

Add to `tests/mapGen.test.ts`:

```ts
it('connects every stranded village to land', () => {
  const map = generateMap(3, 42);
  const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
  for (const s of map.tiles.filter((t) => t.settlement !== null)) {
    const ring2 = ringOf(s, 2);
    const ring2AllWater = ring2.every((n) => {
      const t = byKey.get(axialKey(n));
      return t !== undefined && isWaterType(t.terrain);
    });
    if (!ring2AllWater) continue;
    const reachable = new Set<string>();
    const frontier = [{ q: s.q, r: s.r }];
    while (frontier.length > 0) {
      const cur = frontier.pop()!;
      for (const n of hexNeighbors(cur)) {
        const k = axialKey(n);
        const t = byKey.get(k);
        if (!t || reachable.has(k) || isWaterType(t.terrain)) continue;
        reachable.add(k);
        frontier.push(n);
      }
    }
    const outsideLand = map.tiles.some(
      (t) => !isWaterType(t.terrain) && hexDistance(s, t) >= 2 && reachable.has(axialKey(t)),
    );
    expect(outsideLand).toBe(true);
  }
});
```

- [ ] **Step 3: Run full tests and typecheck**

Run: `npm run typecheck && npm test`
Expected: all pass (including the new integration test).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/game/mapGen.ts tests/mapGen.test.ts
git commit -m "feat: connect stranded island villages in map generation"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Dev server check**

Run: `npm run dev`, generate a few maps (start several games with 2-4 players and different random seeds).
Expected: no settlement sits alone on an island ringed entirely by water; any island that would occur has a narrow land bridge to the mainland.
