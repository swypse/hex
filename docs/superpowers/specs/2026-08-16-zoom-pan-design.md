# Design: Map zoom, pan, double-click reset

Date: 2026-08-16

## Goal

Add mouse-scroll zoom (0.5×–2× relative to fit-to-screen), drag-to-pan with a partial-visibility constraint, double-click-on-empty reset to fit-to-screen, and remove the gray border around free territories.

## Fit-to-screen (start zoom)

- Map renders at fixed `HEX_SIZE = 40`.
- At `startGame` after first render, compute `fitScale` so the whole map fits the viewport with ~10% margin:
  - mapW ≈ `2 * sqrt(3) * radius * hexSize`, mapH ≈ `2 * (1.5 * radius * hexSize)`.
  - `fitScale = min(screenW / mapW, screenH / mapH) * 0.9`.
- `fitScale` is the **zoom 1 baseline**: controller stores `baseScale` and `zoom` (1.0).

## Zoom (controller)

- `gameController` stores `zoom` and `pan { x, y }`, applied to the map container (`container.scale.set(scale, scale)`, `container.position.set(...)`).
- Wheel handler zooms **around the cursor**:
  - `worldPos = (cursor - container.position) / oldScale`
  - `newScale = clamp(oldScale * factor, baseScale * 0.5, baseScale * 2)` (factor 1.1 per step)
  - `container.position = cursor - worldPos * newScale`
- `zoom` is normalized (`zoom = newScale / baseScale`) so the 0.5–2 clamp is relative to fit-to-screen.

## Pan (drag)

- `pointerdown` records start cursor + start pan; `pointermove` while down sets `container.position = startPan + (cursor - startCursor)`, then clamps.
- Clamp: map bounds (`radius * hexSize * scale`, centered on `container.position`) must keep at least part of the map overlapping the viewport.

## Double-click reset

- Double-click on empty space (tap that hits no tile) resets `zoom = 1` and re-centers the map to the fit-to-screen position.
- Implemented via a double-click timer on the container tap; only resets when the click did not select a tile.

## Remove free-territory gray border

- `mapRenderer.drawOwnedBorders`: delete the `freeLoop` gray-border block. Free territories remain in the model but are not drawn.

## Tests

- Pure helpers in `src/game/zoom.ts`: `clampZoom`, `zoomAroundCursor`, `clampPan` — unit-tested (clamp bounds, cursor-anchored zoom, pan clamping).
- Manual: wheel zooms toward cursor within 0.5–2×; drag pans with map never fully off-screen; double-click empty space resets; free villages show no gray border.
