# Close Spawn Popup on Outside Click Design

Date: 2026-08-21

## Problem

The spawn popup can only be closed with the Cancel button. Clicking the dimmed
backdrop does nothing, which is a common dismiss pattern players expect.

## Design

In `src/ui/SpawnDialog.tsx`:

- Add `onClick={() => setOpen(false)}` to the outer backdrop `<div>` (the full-screen
  overlay with `position: absolute; inset: 0`).
- Add `onClick={(e) => e.stopPropagation()}` to the inner popup `<div>` so clicking
  inside the dialog (on a unit button or Cancel) does not trigger the backdrop.

This makes an outside click behave identically to the Cancel button — it only calls
`setSpawnDialogOpen(false)`; no unit is spawned.

## Files touched

- `src/ui/SpawnDialog.tsx`

## Testing

- Manual: open the spawn dialog, click the backdrop → dialog closes; click unit
  buttons / Cancel inside → dialog stays open / behaves as before.
- Existing test suite and typecheck pass.
