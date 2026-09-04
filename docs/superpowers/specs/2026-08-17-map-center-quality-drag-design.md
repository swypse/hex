# Design: Map centering, max-zoom quality, and smooth dragging with inertia

Date: 2026-08-17

## Goal

Fix four viewport/camera issues in the hex game:

1. The map must appear centered — the map's center in the center of the viewport — at game start and on reset.
2. At maximum zoom the map must render at 100% quality for sprites, text, and UI elements (no blur/pixelation).
3. Dragging must always stop on `pointerup` (no "stuck drag" when the pointer is released outside the map or canvas).
4. Dragging must be smooth and gain momentum (inertia) when the pointer is released while moving.

## Background (current behavior)

- `GameController` (`src/controller/gameController.ts`) owns the Pixi app, the map container, and `zoom`/`pan` state. `HEX_SIZE = 40`.
- `startGame` is called from `SetupScreen` before the game screen mounts. `init()` is async and resolves after `startGame` returns, so `applyFitToScreen()` is skipped on first run and the map renders with `pan = {0,0}` at the top-left. `init().then()` never re-centers.
- Textures are generated at `HEX_SIZE` px and the whole container is scaled by `baseScale × zoom` (up to `MAX_ZOOM = 2`), so sprites, text, and glow get magnified past their native resolution and blur.
- Drag uses `pointermove`/`pointerup` listeners only on the map container, so releasing the pointer outside the map (or off-canvas) never ends the drag.
- Text (`Text`) defaults to resolution 1; the renderer resolution defaults to 1.

## Design

### 1. Center the map at startup and on reset

- Remove the `mapContainer` guard from `applyFitToScreen()` (it only needs `app` and `map`). It sets `baseScale`, `zoom = 1`, and `pan = screen center`.
- In `init().then()`, after creating textures, call `applyFitToScreen()` before `render()`.
- Reorder `startGame` so the fit (`baseScale`) is computed before textures are created (needed for the quality factor, section 2).
- `resetView()` (double-click on empty space) already re-centers to `pan = screen center` and `zoom = 1`; it must also stop any running inertia.

The map's geometric center is pixel `(0,0)` (hex grid `allTiles(radius)` is symmetric about the origin), so `pan = screen center` places the map center in the viewport center.

### 2. 100% quality at max zoom

Introduce a single **quality factor**:

```
qualityFactor = baseScale * MAX_ZOOM * window.devicePixelRatio
```

- `MAX_ZOOM` from `src/game/zoom.ts`.
- Computed on the controller after fit; stored and passed down.

**Sprites** — `createTextures(app, HEX_SIZE * qualityFactor)` generates every texture (tiles, villages, units, free village, glow) at max-zoom pixel resolution (the factory is already size-parameterized). In `renderMap`, each Sprite is drawn at `scale = 1 / qualityFactor` so it occupies the same `HEX_SIZE` local units; layout is unchanged.

**Text** — `Text` accepts a per-instance `resolution`. Pass `resolution: qualityFactor` to the village `count/capacity` labels and HP bar labels so glyph textures are crisp at max zoom.

**Vectors** — territory borders and HP bar backgrounds are `Graphics`, which scale natively; no change.

**Glow blur** — scale `BlurFilter.strength` by `qualityFactor` (`12 * qualityFactor`) so the glow keeps its current appearance at base zoom (the texture is now `qualityFactor`× larger).

**Renderer DPI** — `app.init` gains `resolution: window.devicePixelRatio, autoDensity: true` so the whole canvas renders at native display density (retina baseline).

**Downscale-only softness** — below max zoom textures/text are downsampled, which is the expected, acceptable behavior.

### 3. Dragging always stops on release

- Keep `pointerdown` on the map container (records drag start, pan start, last pointer, velocity) and call `app.canvas.setPointerCapture(e.pointerId)`.
- Attach `window` listeners for `pointermove`, `pointerup`, and `pointercancel` at drag start; remove them on release/cancel.
- Any `pointerup`/`pointercancel` ends the drag and (if moving fast enough) starts inertia. This covers releases outside the map, outside the canvas, and pointer-cancel events.

### 4. Smooth drag with inertia

- Only treat the interaction as a drag once the pointer has moved more than `DRAG_THRESHOLD = 5px` (prevents click jitter from being mistaken for a drag).
- Track smoothed velocity in px/s on each move: `v = 0.8 * prev + 0.2 * (delta / dt)`.
- During drag, pan is updated from the window-level moves and clamped with the existing `clampPan` — this keeps dragging smooth even when the cursor leaves the map.
- On release, if `|v| > INERTIA_MIN_SPEED = 100 px/s`, run an inertia animation on `app.ticker`: each tick `pan += v * dt`, `v *= pow(DECAY, dt)` with `DECAY = 0.01`, stop when speed drops below `30 px/s` or when `clampPan` pins the map at a boundary.
- A new `pointerdown`, a `wheel` zoom, or `resetView()` stops any running inertia immediately.

## Files touched

- `src/controller/gameController.ts` — centering fix, quality factor, drag/inertia rework.
- `src/render/mapRenderer.ts` — `spriteScale` and `textResolution` params applied to sprites/text.
- `src/render/textureFactory.ts` — glow blur strength scaled with texture size.
- `src/game/zoom.ts` — new pure helpers (quality factor, inertia step/decay), kept in the existing pure-math module.
- `tests/zoom.test.ts` — tests for the new pure helpers.

## Testing

- Pure helpers (quality factor calculation, inertia velocity step/decay) unit-tested in `tests/zoom.test.ts`.
- Existing zoom/pan behavior preserved (`clampZoom`, `zoomAroundCursor`, `clampPan`).
- Manual via `npm run dev`: map centered on start and after double-click reset; tiles/text crisp at max zoom; drag always ends on release; dragging feels smooth and flings with inertia.
