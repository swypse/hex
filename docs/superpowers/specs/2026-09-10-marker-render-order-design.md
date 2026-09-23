# Marker Render-Order Fix Design

## Problem

When a unit is selected, the pulsing ground-circle markers (move dots / attack
targets) are hidden below other map overlays:

- Village name labels, unit HP bars and capture icons are drawn in a separate
  `overlay` container that is mounted **above** the main map `container`.
- The markers are drawn inside the main `container`, so they always render below
  everything that lives in the overlay layer.

The result: a reachable/attackable tile that also carries an overlay element
(village label, hostile unit HP bar, capturable-village capture icon) shows no
usable marker.

## Goal

Attack and move markers should render above village-name labels, buildings, unit
textures, unit HP bars and capture icons.

## Approach

Add a third world-space layer, `markerLayer`, to `MapView`:

1. `markerLayer` is a plain `Container` added to `mapView`.
2. Mounted **after** the overlay in `GameController.render()`:
   `mapRoot` order becomes `mapView.container` → `mapView.overlay` →
   `mapView.markerLayer`. Components later in the list render on top.
3. Transformed exactly like the main container in `applyTransform()` (same scale
   and pan), so the move/attack dots keep their world-space placement and keep
   shrinking with the map when zoomed out.
4. The move/attack marker `Graphics` dots are added to `markerLayer` instead of
   `container`. Cleanup continues to flow through the existing `clearHighlights()`
   path (the same `highlights` array is emptied there).

### What does not change

- The selected-tile red border: the top strip stays inside the tile `el`
  (z-index 2), the bottom strip stays in the container. The order split is
  intentional (it must be occluded by mountains/units in front).
- Tutorial markers: unchanged (they are borders, not ground markers).
- Capture edge markers: unchanged.
- Village labels / HP bars / capture icons: stay in the overlay, unchanged. The
  markers deliberately render **above** them now (option 2).

## Marker-layer lifecycle

- Tiles are never added to `markerLayer`; only the per-frame move/attack dots.
- `clearHighlights()` runs at the start of every `MapView.update()` and releases
  the pooled graphics, so the layer is empty between renders.

## Edge cases

- **Zoom:** because `markerLayer` uses the same transform as the container, dots
  scale with the world, preserving today's look. Overlay items (HP bars, labels)
  remain fixed pixel size.
- **Multiple markers per hex:** a tile is either reachable (move dot) or
  attackable (attack dot), never both; `drawHighlights` already guarantees this.
- **Selected hex:** the move dot is skipped on the selected hex; the attack dot
  cannot be the selected hex. Unchanged.

## Tests

Add a renderer test in `tests/mapRenderer.test.ts`:

- Build a small map, select an own unit, pass reachable and attackable keys with
  a selected unit.
- Assert that:
  - a move marker dot exists in `markerLayer`,
  - an attack marker dot exists in `markerLayer`,
  - `container` contains no move/attack marker dots,
  - `markerLayer` renders **after** the overlay (i.e., it is a sibling of
    `container`/`overlay` mounted on top) — asserted via mount order in
    `gameController` render as well.

## Out of scope

- Reordering village labels, HP bars, capture icons relative to each other.
- Changing the marker visuals (radius, pulse, colors).