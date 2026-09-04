# Design: Move selected-border split points toward the top of the hex

Date: 2026-08-28

## Overview

The selected-cell red border is drawn as two open polylines split at points on
the left and right edges of the hex (`splitHexBorder` in `src/game/hex.ts`).
The split points currently sit at the middle of those edges (0.5 blend). Move
them closer to the top corners (0.9 blend) so the top part of the border is a
short arc and the bottom part covers most of the hex.

## Behavior

- `rightMid` (right edge, between `corners[0]` top-right and `corners[1]`
  bottom-right) is placed 10% of the way from `corners[0]` toward `corners[1]`
  (blend `0.1`, near the top).
- `leftMid` (left edge, between `corners[3]` bottom-left and `corners[4]`
  top-left) is placed 90% of the way from `corners[3]` toward `corners[4]`
  (blend `0.9`, near the top).
- Both split points therefore sit near the hex's top corners, and the `top` and
  `bottom` polylines still share them, so the border stays continuous.

## Implementation

`src/game/hex.ts`, in `splitHexBorder`, replace the current single-factor helper
with a parameterized blend used at `0.1` on the right edge and `0.9` on the left
edge:

```ts
const blend = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const rightMid = blend(corners[0], corners[1], 0.1);
const leftMid = blend(corners[3], corners[4], 0.9);
```

## Tests

- `tests/hex.test.ts`: update the `splitHexBorder` test to expect the `0.1`
  right split point and `0.9` left split point; the `top`/`bottom` continuity
  assertions stay the same.

## Out of scope

- No other rendering or geometry changes.
