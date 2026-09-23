# Pan Constraint Padding Design

Date: 2026-08-22

## Problem

The map is clamped so it always covers the screen; the map edge stops exactly at the
viewport edge. Panning feels abrupt — there is no empty spacing around the map. Add a
relative padding so the map edge can sit slightly inside the viewport, revealing empty
background.

## Design

In `src/game/zoom.ts`, relax `clampPan`'s bounds by a fraction of the screen dimensions.

Add a constant:

```ts
export const PAN_PADDING = 0.1; // fraction of the screen, on each side
```

Update the clamp bounds:

```ts
const PAD_X = PAN_PADDING * screenW;
const PAD_Y = PAN_PADDING * screenH;
const xMin = screenW - halfW - PAD_X;
const xMax = halfW + PAD_X;
const yMin = screenH - halfH - PAD_Y;
const yMax = halfH + PAD_Y;
```

The map spans `[pan.x - halfW, pan.x + halfW]`. With the new bounds:

- `pan.x = xMin` → map right edge at `screenW + PAD_X` (right edge sits 10% past the right
  side of the screen — i.e. 10% of empty space is visible on the right).
- `pan.x = xMax` → map left edge at `-PAD_X` (empty space visible on the left).

The `clampAxis` "center when map is smaller than the screen" fallback is unchanged.

## Files touched

- `src/game/zoom.ts`
- `tests/zoom.test.ts`

## Testing

- Existing `clampPan` tests updated: the "keeps the map covering the screen" assertions
  become "keeps the map within padding distance of the screen edges" — for every input,
  `pan.x - halfW >= -PAD_X` and `pan.x + halfW <= screenW + PAD_X` (and the y analog).
- The "centers the map when smaller than the screen" test is unchanged.
- `npm run typecheck`, `npm test`, `npm run build` pass.
- Manual: panning allows ~10% empty spacing around the map before stopping.
