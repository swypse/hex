# Unit Texture Flip on Move Design

Date: 2026-09-13

## Goal

When a unit moves, its walking sprite should flip left/right to face its
direction of travel on every path step where the horizontal direction changes.
The flip must happen immediately, before that step's walk animation (tween)
begins — instead of only orienting the unit after the whole move finishes, as
today.

## Current behavior

In `animateMoveEvent` (`src/controller/eventPresenter.ts:669`):

- A temporary walk `Sprite` is created facing right (texture default) and
  tweened through each path step.
- Only after the final step does the code set the unit's facing
  (`eventPresenter.ts:725-730`), comparing the last path hex against the start
  hex. During the entire walk the sprite faces right even when the unit is
  walking left, and flips only at the very end.

## Change — `src/controller/eventPresenter.ts`

Inside `animateMoveEvent`, before the step loop:

- Track `let facing: 'left' | 'right' = 'right';` (matching the sprite's default
  orientation).

Inside the step loop, before each `tweenSpriteTo` call:

1. Compute the step's horizontal direction:
   `const stepFacing = hexToPixel(step, HEX_SIZE).x < hexToPixel(prev, HEX_SIZE).x ? 'left' : 'right';`
   (`prev` is the previous hex, starting at `e.from`; adjacent hexes always
   differ in x, so a direction is always determinable.)
2. If `stepFacing !== facing`, flip:
   - Negate the walk sprite's horizontal scale: `sprite.scale.x = -sprite.scale.x;`
   - `facing = stepFacing;`
   - Keep the renderer's stored facing in sync:
     `mapView.setUnitFacing(unit.id, facing);`
   The flip occurs before that step's tween starts, so the unit always walks
   facing the way it is going.

Remove the end-of-move facing block (`eventPresenter.ts:725-730`); the final
step's direction already sets the correct stored facing.

## Edge cases

- Zero-x delta between consecutive hexes does not occur on the hex grid; if it
  ever did, it is treated as `'right'` (no flip, harmless).
- Ships and pirates are treated identically — they share the walk sprite.
- Move-ghost sprites (`makeMoveGhostSprite`) are untouched: they are static
  placeholders at the starting hex and are removed before the walk begins.
- No change to `unitMoved` event shape, fog filtering, or path step logic.

## Tests — `tests/moveAnimation.test.ts`

Use the existing harness. Capture the transient walking sprite on
`mapView.container` mid-animation (as the existing tests do) and assert the
`scale.x` sign matches the direction of travel:

1. A move straight right (`{q:0,r:0}` → `{q:1,r:0}` → `{q:2,r:0}`) keeps
   `scale.x > 0`.
2. A move straight left keeps `scale.x < 0` from the very start (immediate
   flip before the animation progresses).
3. A zig-zag path whose last step goes left (e.g. `{q:0,r:0}` → `{q:1,r:0}` →
   `{q:1,r:1}` → `{q:0,r:1}`) flips `scale.x` from positive to negative after
   the direction change.

## Out of scope

- No change to attack-facing, movement rules, or stored-facing semantics outside
  the move animation.
- No new assets or sound.