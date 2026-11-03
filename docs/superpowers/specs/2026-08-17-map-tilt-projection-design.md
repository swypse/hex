# Design: Camera-tilt projection for the hex map (baked into hex math)

Date: 2026-08-17

## Goal

Make the whole map look tilted toward the camera: the projected hex height should be less than the hex width (moderate tilt, squash factor **0.7**). The tilt is baked into the hex projection math (`hexToPixel`/`pixelToHex`) rather than applied as a container transform, so every consumer of hex-space coordinates stays consistent by construction.

## Current behavior

- `hexToPixel` (`src/game/hex.ts:58`) maps axial → screen with `y = hexSize * (3/2) * r`; `pixelToHex` (`:64`) is its inverse. Pointy-top hexes are taller than wide (height `2·hexSize`, width `~1.73·hexSize`).
- Tile textures are full-height hexagons (`hexagonPoints` in `src/render/textureFactory.ts`), drawn as prisms: a wall silhouette shifted down by `TERRAIN_HEIGHT` + a gradient top face, anchored at the grid point.
- `clampPan` (`src/game/zoom.ts:22`) and `applyFitToScreen` (`src/controller/gameController.ts:126`) compute the map's vertical screen extent directly (`1.5 * mapRadius * hexSize`) rather than through `hexToPixel`.

## Design

### 1. Projection constant and math (`src/game/hex.ts`)

Add a single source-of-truth constant:

```ts
export const HEX_TILT = 0.7; // projected Y squash — hexes wider than tall
```

- `hexToPixel`: `y = hexSize * (3/2) * r * HEX_TILT` (x unchanged).
- `pixelToHex`: inverse — `r = (2/3) * (y / hexSize / HEX_TILT)`; the rest of the roundtrip solve is unchanged.
- `hexCorners` and the private `hexCorner` (behind `hexEdge`): squash the corner Y offset — `p.y + hexSize * sin(angle) * HEX_TILT` — so territory borders and selection outlines align with the squashed tile footprint.

All consumers that already go through `hexToPixel` (tile/unit/village positions, labels, HP bars, move dots, camera visibility, move animation) squash automatically and consistently. `pixelToHex` roundtrips, so clicks stay correct with no interaction-code changes.

### 2. Texture geometry (`src/render/textureFactory.ts`)

`hexagonPoints` squashes Y by the same `HEX_TILT` so drawn tile prisms and village hexagons match the projected footprint:

```ts
points.push(size * Math.cos(angle), size * Math.sin(angle) * HEX_TILT);
```

- The prism wall (hexagon shifted down by `height`) and the `FillGradient` range (change `y` bounds to `±hexSize * HEX_TILT`) stay consistent.
- Units (circle/square/triangle) remain **unsquashed** — they read as upright tokens standing on the tilted board, as in strategy games.
- Village name labels and HP bars remain upright/readable (flat `Text`/`Graphics` at squashed positions).

### 3. Camera bounds (`src/game/zoom.ts`, `src/controller/gameController.ts`)

Two Y-extent computations do not go through `hexToPixel` and need the factor:

- `clampPan`: `halfH = 1.5 * mapRadius * hexSize * scale * HEX_TILT`. Its signature gains a trailing `tilt` parameter: `clampPan(pos, mapRadius, hexSize, scale, screenW, screenH, tilt)`. Called from `gameController` (passes `HEX_TILT`) and from `inertiaStep`.
- `inertiaStep`: gains a trailing `tilt` parameter — `inertiaStep(pan, velocity, dt, mapRadius, hexSize, scale, screenW, screenH, tilt)` — and passes it through to `clampPan`.
- `applyFitToScreen`: `mapH = 2 * (1.5 * radius * HEX_SIZE * HEX_TILT)` so the map still fits and centers correctly.

`isCellVisible`, `bringCellIntoView`, and `animateUnitMove` already use `hexToPixel`, so they stay correct with zero changes. Wheel zoom (`zoomAroundCursor`) operates purely in screen space — unchanged.

### 4. Map generation note

`mapGen.angleOf` uses `hexToPixel` for sector placement; with tilt the angles shift slightly, but placement remains deterministic and valid — no change needed.

## Files touched

- `src/game/hex.ts` — `HEX_TILT` constant; squash in `hexToPixel`, `pixelToHex`, `hexCorners`, `hexCorner`.
- `src/render/textureFactory.ts` — `hexagonPoints` Y squash; `FillGradient` range.
- `src/game/zoom.ts` — `clampPan`/`inertiaStep` `tilt` parameter; `halfH` uses it.
- `src/controller/gameController.ts` — `applyFitToScreen` map height; pass `HEX_TILT` to `clampPan`/`inertiaStep`.
- `tests/hex.test.ts` — tilted roundtrip + explicit Y check.
- `tests/zoom.test.ts` — `clampPan`/`inertiaStep` with tilt.

## Testing

- `hex.test.ts`: `pixelToHex` inverts the *tilted* `hexToPixel` (existing roundtrip test now covers it); add explicit `hexToPixel({q:0,r:1}, 40).y === 1.5 * 40 * HEX_TILT`; `hexCorners` retains its symmetry (x and y sums ≈ 0).
- `zoom.test.ts`: `clampPan` with `tilt` — a pan `y` far above the tilted half-height clamps to `-(halfH - 1)` with `halfH = 1.5 * radius * hexSize * scale * tilt`; `inertiaStep` passes tilt through (same clamp still applies).
- Manual via `npm run dev`: map visibly tilted (hexes wider than tall), clicks/camera/pan/zoom behave as before, prisms and borders align.

## Out of scope

- Squashing unit tokens, labels, or HP bars.
- Any game-logic change.
- Container-level or sprite-level transforms (Approach 1) — rejected in favor of the projection-level approach.
