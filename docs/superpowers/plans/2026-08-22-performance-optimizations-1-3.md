# Performance Optimizations 1-3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply three safe performance optimizations: dedupe GPU textures by (terrain, height, anchor), stop the exclamation ticker when idle, and make `tileAt` O(1).

**Architecture:** Each change is isolated in its own file. The texture cache is a local `Map` inside `createTextures`; the ticker self-stops; `tileAt` uses a lazily-built module-level `WeakMap` index keyed by the map object.

**Tech Stack:** TypeScript, PixiJS 8, Vite, Vitest.

## Global Constraints

- No behavior or visual change.
- No change to `GameMap` shape or multiplayer wire payload.
- Existing 273 tests pass; `npm run typecheck` clean.
- No new dependencies.

---

### Task 1: Cache deduplicated tile textures

**Files:**
- Modify: `src/render/textureFactory.ts:221-240`

**Interfaces:**
- Consumes: `composeHexTexture(app, hexSize, heightPx, img, fill, opts)` returning `TileTexture`; `TileTexture` is `{ texture, anchorY }`.
- Produces: Same `TextureSet` shape; water tiles reuse one tile texture and one fog texture.

- [ ] **Step 1: Add a cache to `createTextures`**

In `src/render/textureFactory.ts`, inside `createTextures`, add a cache before the tile loop:

```ts
const textureCache = new Map<string, TileTexture>();
```

Add a helper closure right after the cache (still inside `createTextures`):

```ts
const getTileTexture = (
  terrain: TileType,
  heightPx: number,
  img: Texture | null,
  fill: number,
  anchor: 'base' | 'topface',
): TileTexture => {
  const cacheKey = `${terrain}|${heightPx}|${anchor}`;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;
  const tex = composeHexTexture(app, hexSize, heightPx, img, fill, { walls: anchor === 'base', anchor });
  textureCache.set(cacheKey, tex);
  return tex;
};
```

Note: `TileType` is already imported in this file.

- [ ] **Step 2: Use the cache for tile and fog textures**

Replace the two `composeHexTexture` calls in the tile loop:

```ts
tileTextures.set(
  key,
  getTileTexture(tile.terrain, heightPx, img, bottom, 'base'),
);
fogTextures.set(
  key,
  getTileTexture(tile.terrain, heightPx, fogImage, 0x7a7a7a, 'base'),
);
```

For the fog texture the `terrain` value only matters for its `|heightPx|` combination; since the fog image and fill are constant, passing `tile.terrain` still produces the correct dedup key (water tiles share height 0, so all water fog reuses one texture).

- [ ] **Step 3: Cache the top-face fog texture**

The `fogTopTexture` at the bottom of `createTextures` also calls `composeHexTexture` with `anchor: 'topface'`. Replace it to reuse the cache:

```ts
fogTopTexture: getTileTexture(TileType.Water, 0, fogImage, 0x7a7a7a, 'topface'),
```

`TileType` is already imported.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/render/textureFactory.ts
git commit -m "perf: cache tile textures by terrain, height, anchor"
```

---

### Task 2: Stop the exclamation ticker when idle

**Files:**
- Modify: `src/render/mapRenderer.ts:19-30`

**Interfaces:**
- Consumes: module globals `exclamationBobs: Container[]`, `exclamationAnimRemove: (() => void) | null`.
- Produces: the ticker removes itself when `exclamationBobs` is empty, and re-arms on the next render that has exclamations.

- [ ] **Step 1: Make the ticker self-remove**

In `startExclamationAnimation`, change the registered `fn` to stop itself when empty:

```ts
const fn = (): void => {
  if (exclamationBobs.length === 0) {
    ticker.remove(fn);
    exclamationAnimRemove = null;
    return;
  }
  const phase = ((performance.now() - start) % 800) / 800;
  const offset = -Math.abs(Math.sin(phase * Math.PI * 2)) * 5;
  for (const bob of exclamationBobs) bob.position.y = offset;
};
```

`renderMap` sets `exclamationBobs = []` at the start of each render and pushes bobs as it encounters exclamation tiles, then calls `startExclamationAnimation(app)`. So: a render with exclamations starts the animation; the animation continues until a later render produces no bobs, at which point the next frame removes the ticker. A subsequent render with exclamations restarts it.

- [ ] **Step 2: Run tests and typecheck**

Run: `npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "perf: stop exclamation bob animation when idle"
```

---

### Task 3: O(1) `tileAt` via WeakMap index

**Files:**
- Modify: `src/game/selection.ts:16-18`

**Interfaces:**
- Consumes: `GameMap`, `MapTile` (imported), `axialKey` (imported).
- Produces: `tileAt(map, q, r)` returns `MapTile | undefined` with O(1) average lookup after first call per map object.

- [ ] **Step 1: Add the WeakMap index**

In `src/game/selection.ts`, add near the top (after imports):

```ts
const tileIndex = new WeakMap<GameMap, Map<string, MapTile>>();

function tileIndexFor(map: GameMap): Map<string, MapTile> {
  let index = tileIndex.get(map);
  if (!index) {
    index = new Map(map.tiles.map((t) => [axialKey(t), t]));
    tileIndex.set(map, index);
  }
  return index;
}
```

- [ ] **Step 2: Rewrite `tileAt`**

```ts
export function tileAt(map: GameMap, q: number, r: number): MapTile | undefined {
  return tileIndexFor(map).get(axialKey({ q, r }));
}
```

The index is keyed by the map object in a `WeakMap`, so clones (multiplayer `structuredClone`) get their own lazily-built entry with no wire-payload change.

- [ ] **Step 3: Run tests and typecheck**

Run: `npm run typecheck && npm test`
Expected: all 273 tests pass (existing selection/simulator tests exercise `tileAt`).

- [ ] **Step 4: Commit**

```bash
git add src/game/selection.ts
git commit -m "perf: O(1) tileAt via lazily-built WeakMap index"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Dev server check**

Run: `npm run dev`, start a single-player game.
Expected:
- Map renders identically (no visual change).
- Moving a unit and opening the spawn/capture dialogs work as before.
- Exclamation bob markers above capture-ready villages animate while present and no per-frame animation runs when none exist (perf tab shows no lingering frame callbacks).
- Selection reachability dots still appear instantly on larger maps.
