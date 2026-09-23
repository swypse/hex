# Show all toolbar actions for any selected tile

## Problem

Commit `602d489` added toolbar scoping: `toolbarSpecs()` filters action buttons by the
selection kind, so when a cell (not its unit) is selected, only tile-level actions
(build, upgrade, road, …) appear, and the unit actions for the unit standing on that
cell (heal, disband, upgrade ship, deal, capture) are hidden.

The player wants the former behavior back: every applicable action button is shown
regardless of whether the selection is the unit or the cell beneath it.

## Decision

Full revert to the pre-scoping behavior (`return out;`). Confirmed by the player
(choice B): always show all buttons that apply to the selected tile, in both the
unit-selected and cell-selected states.

## Requirements

1. `toolbarSpecs()` must return every applicable action for the selected tile,
   independent of `selection.kind`.
2. No dead code: remove the `scope` field from `ToolbarSpec`, the `scope: 'unit'`
   properties on the unit specs, and the trailing selection filter.
3. The toolbar renderer (`hud-toolbar.ts`) is unaffected — it already lays out all
   returned buttons and auto-scales the row to fit.
4. Tests that asserted the scoped behavior are updated to assert the actions show in
   both selection states.

## Implementation

`src/ui/hud/toolbar-specs.ts`:

- Delete `scope?: 'unit' | 'tile';` from the `ToolbarSpec` interface.
- Delete `scope: 'unit'` from the capture, heal, upgrade-ship, disband, and deal specs.
- Delete the trailing filter:

  ```ts
  const unitSelected = selection.kind === 'unit';
  return out.filter((spec) => (unitSelected ? spec.scope === 'unit' : spec.scope !== 'unit'));
  ```

- `return out;`

`tests/toolbar-specs.test.ts`:

- `offers heal only while the unit itself is selected`: heal is shown for both
  `select(tile)` and `selectCell(tile)` (assert present in both).
- `offers the ship upgrade only while the ship unit itself is selected`: upgrade-ship
  is shown for both selection states.
- All other tests (bottle, temple, bridge, repair, deal, paused) are unaffected.

## Testing

- `npm test` (full suite).
- `npm run typecheck`.

## Success criteria

- A selected cell with an own unit sitting on it shows both the cell actions and the
  unit actions.
- No references to `ToolbarSpec.scope` remain in the codebase.