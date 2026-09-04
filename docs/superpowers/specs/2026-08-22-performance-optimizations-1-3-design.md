# Performance Optimizations 1-3 Design

Date: 2026-08-22

## Problem

Performance audit identified three safe, high-value optimizations:

1. `createTextures` generates a unique GPU texture per tile and per fog tile (~662
   `generateTexture` calls on a radius-10 map), even though water tiles (height 0) share
   identical texture inputs.
2. The exclamation-bob animation ticker runs every frame forever, even when no exclamation
   exists.
3. `tileAt` is O(n) (`map.tiles.find`), called inside the BFS in
   `reachableTargets`/`pathBetween`, making reachability computation O(n²) on larger maps.

## Design

### 1. Texture cache (`src/render/textureFactory.ts`)

Inside `createTextures`, add a local `Map<string, TileTexture>` cache. Key:
`\`${terrain}|${heightPx}|${anchor}\``. The image and fill color are fully determined by
`terrain`; `anchor` distinguishes top-face textures (`'topface'`) from base textures
(`'base'`).

- Before calling `composeHexTexture`, check the cache; if present, reuse the `TileTexture`.
- Otherwise compose, store in the cache, and use it.

Result: water tiles (all height 0) dedupe to a single tile texture and a single fog
texture. Land tiles keep per-tile textures because their heights are continuous — no
visual change. This roughly halves GPU texture count on typical maps.

### 2. Stop exclamation ticker when idle (`src/render/mapRenderer.ts`)

In `startExclamationAnimation`, the registered ticker fn currently iterates
`exclamationBobs` forever. Change it so that when `exclamationBobs.length === 0`, it
removes itself and resets `exclamationAnimRemove = null`. The animation then runs only
while an exclamation actually exists and re-arms on the next render that has one.

### 3. O(1) `tileAt` via WeakMap index (`src/game/selection.ts`)

Add a module-level `WeakMap<GameMap, Map<string, MapTile>>` in `selection.ts`. `tileAt`
builds the index lazily once per map object (keyed by `axialKey`), then does O(1) lookup.
Cloned maps (multiplayer `structuredClone`) get their own index automatically because the
WeakMap is keyed by the map object itself — nothing is added to the wire payload.

`findUnit` (in `simulator.ts`) remains a linear scan: it is called once per command, not
in hot loops, and a unit index would need invalidation on every move.

## Files touched

- `src/render/textureFactory.ts`
- `src/render/mapRenderer.ts`
- `src/game/selection.ts`

## Testing

- No behavior change: existing 273 tests must pass and `npm run typecheck` clean.
- Manual: game renders identically; exclamation bobs animate only while present; camera
  and selection behave the same.
