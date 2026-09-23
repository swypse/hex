# Persistent MapView Renderer Design

Date: 2026-08-22

## Problem

The renderer rebuilds the entire scene graph on every `render()`: ~217-331 tile sprites,
fog sprites, territory graphics, village labels, HP bars, and highlights are all recreated
and the old container destroyed. This happens on every command, event batch, and twice per
move animation. Additionally, offscreen tiles are fully built every render and `Text`
objects (expensive — each allocates a canvas texture) are churned per render.

## Design

Replace the `renderMap` function in `src/render/mapRenderer.ts` with a persistent `MapView`
class. The controller holds one `MapView` instance for the life of a game. This single
rewrite delivers three optimizations together: dirty/incremental rendering, pooled
`Text`/`Graphics`, and viewport culling.

### Class shape

```ts
class MapView {
  container: Container;          // map layer — tiles painter-sorted once
  overlay: Container;            // hp bars, village labels, exclamations
  overlayItems: OverlayItem[];   // same contract the controller already uses

  constructor(
    app: Application,
    textures: TextureSet,
    hexSize: number,
    spriteScale: number,
  )
  update(
    map: GameMap,
    players: Player[],
    selection: Selection | null,
    reachableKeys: Set<string>,
    attackableKeys: Set<string>,
    localPlayerIndex: number,
    fogEnabled: boolean,
    hiddenUnitIds: Set<string>,
    viewport: { x: number; y: number; scale: number; width: number; height: number },
  ): void
  destroy(): void
}
```

### 1. Dirty/incremental rendering

- **Build once in the constructor:** every tile gets a `TileView` holding child sprites:
  terrain sprite, fog sprite, village sprite, capital dot, building sprite, unit sprite,
  and territory `Graphics`. TileViews are inserted into `container` in painter Y-order
  (sorted by `compareTileY`), exactly as today. Positions never change; only content does.
- **Signature per tile:** each `update` computes a render signature from the tile:
  `terrain + explored`, `settlement.owner + capital`, `unit.id/type/owner/hp + hidden`,
  `building.kind`, `ownedBy`. Compare to the cached signature.
  - Unchanged → skip entirely (no work).
  - Changed → update only that `TileView`'s sub-sprites in place: swap texture, toggle
    `visible`, redraw territory graphics, reposition/move unit sprite.
- **Painter order preserved:** sprites live at fixed Y-sorted slots, so a unit moving to
  another tile still draws correctly without re-sorting.
- **Overlay** (HP bars, labels, exclamations) is rebuilt each update but from pooled
  objects (see below).

### 2. Pooled Text/Graphics

- `MapView` owns two pools: `Graphics[]` and `Text[]`.
- HP bars, village labels, reachability dots, and attackable/selection borders borrow an
  object from the pool, reset and configure it, then return it to the pool when the update
  finishes (or when the object is replaced). Pooled `Text` instances update their `.text`
  instead of allocating a new canvas texture.
- `destroy()` clears both pools.

### 3. Viewport culling

- `update` receives the current viewport (`pan`, `scale`, screen size). For each `TileView`,
  compute its screen position; if outside a margin, set `visible = false`, otherwise
  `visible = true` (and update only if dirty).
- TileViews remain in the painter-sorted container, so panning/zooming needs no re-sort —
  the win is skipping updates and render work for offscreen tiles.

### Controller integration (`src/controller/gameController.ts`)

- Replace `mapContainer`/`overlay` fields with `mapView: MapView | null`.
- `render()` calls `mapView.update(...)` instead of `renderMap(...)`; the stage add happens
  once after construction (in `init` and after `startGame`).
- `applyTransform()` applies pan/zoom to `mapView.container` + overlay items and passes the
  viewport into culling on the next update.
- Move animation (`animateMoveEvent`): toggles `hiddenUnitIds` and calls `mapView.update()`
  instead of full rebuilds at animation start/end.
- Module-level exclamation globals move into `MapView` (bob containers pooled; ticker
  already self-stops when idle).

## Files touched

- `src/render/mapRenderer.ts` — rewrite `renderMap` into `MapView`
- `src/controller/gameController.ts` — use `MapView`

## Risk & verification

- No direct renderer tests exist; visual parity is manual.
- Existing 273 game-logic tests and `npm run typecheck` must pass.
- Manual: fog/territory/units/selection/hp-bars/exclamations/capture markers render
  identically; pan/zoom behaves the same.
