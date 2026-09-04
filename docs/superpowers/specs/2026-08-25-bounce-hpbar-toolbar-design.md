# Unit Feedback, HP Bar Nudge, and Toolbar Layout Design

Date: 2026-08-25

## Problem

Three items:

1. The selected-unit up-down bounce also plays after a unit moves, but the
   player wants it only on explicit unit selection (moves should show only the
   cell-to-cell move animation).
2. The unit HP bar (and its text label) should sit 10px higher relative to the
   unit.
3. The bottom toolbar buttons should be bigger, all centered horizontally, with
   End turn always last.

## Section 1 — Up-down bounce only on explicit selection

Currently the bounce is driven by render-time selection identity
(`updateSelectedBounce`), so it restarts whenever the selection object changes —
including after a move (the move branch sets a new selection object).

`src/render/mapRenderer.ts`:

- Replace `updateSelectedBounce` with a **stop-only** guard: it stops the bounce
  when the current selection is no longer a local player's visible unit; it never
  starts one.
- Add `bounceUnit(q, r): void` — starts a single 300ms up-down bounce for the
  unit at that tile (base → up → base). Uses a shared `stopBounce()` helper.
- `destroy()` calls `stopBounce()`.

`src/controller/gameController.ts`, `handleMapClick`:

- In the **selection branch** (the `setSelection(cycleSelection(...))` path),
  after setting the selection, if the new selection is a unit owned by the local
  player, call `this.mapView?.bounceUnit(selection.q, selection.r)`.
- The **move branch** never bounces — only the existing cell-to-cell move
  animation plays.

Result: click a unit → bounce once; move a unit → only the move animation;
enemy/village/terrain selections → no bounce.

## Section 2 — HP bar + text up 10px

`src/render/mapRenderer.ts`, `addHpBar`: the bar+label group is drawn in the
unscaled overlay centered at the unit's position. Offset every element up by 10
screen px via a constant `up = -10` applied to the bar rect, the fill, the label
position, and the action dot. The label background moves with the label. The
group still tracks the unit on zoom.

## Section 3 — Toolbar buttons bigger, centered, End turn last

`src/ui/hud/HudToolbar.ts`:

- **Bigger**: text `Button`s → `fontSize 20`, `paddingX 16`, `paddingY 10`
  (~48px tall); `IconButton` size 36 → 48; inter-button gap 8 → 12.
- **Centered row**: all buttons are children of a single row `Container`, laid
  out left→right as **Skills → contextual actions → Stats → End turn**, and the
  whole row is centered horizontally in the bar.
- **End turn always last**: it is the rightmost item of the centered row.
- `update()` rebuilds the row; `layout()` (also run on resize) re-centers it
  horizontally using the row's measured width and vertically at
  `barY = (64 − 48) / 2 = 8`. `TOOLBAR_HEIGHT` stays 64.

## Files touched

- Modify: `src/render/mapRenderer.ts`, `src/controller/gameController.ts`,
  `src/ui/hud/HudToolbar.ts`.

## Testing

- `npm run typecheck` and `npm test` must pass (no game-logic changes).
- Manual (`npm run dev`):
  1. Clicking your unit bounces it once; moving it shows only the cell-to-cell
     move animation (no up-down after arrival).
  2. HP bars sit 10px higher, label included, and track on zoom.
  3. Toolbar buttons are ~2× larger, the whole row is centered, and End turn is
     the rightmost button; row re-centers on window resize.
