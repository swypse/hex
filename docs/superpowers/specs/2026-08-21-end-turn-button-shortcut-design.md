# End Turn Button Size and Ctrl+Enter Shortcut Design

Date: 2026-08-21

## Problem

The "End turn" button is easy to miss, and players must click it every round. Add a
keyboard shortcut as an alias for ending the turn.

## Design

### Bigger button

Enlarge the `#end-turn-btn` button in `index.html`'s inline `<style>`:

- `font-size: 22px` (was inherited 16px from the shared `button` rule)
- `padding: 14px 32px` (was 8px 16px)
- `min-width: 180px`
- `font-weight: 700`

Keep the shared button hover/active states from the base `button` rule.

### Ctrl+Enter shortcut

In `EndTurnButton.tsx`, register a `keydown` listener on `window` inside a `useEffect`
(matching the existing pattern in `StartScreen.tsx`). When the event is `Ctrl+Enter` or
`Cmd+Enter` (`e.ctrlKey || e.metaKey` and `e.key === 'Enter'`), call
`gameController.endTurn()`.

No new guards needed: `gameController.endTurn()` already returns early when the AI is
active or the game is over (`src/controller/gameController.ts:584`).

### Hint label

Show the shortcut on the button as a small secondary line: "End turn" with a
`Ctrl+Enter` hint beneath it, so players discover the shortcut.

## Files touched

- `index.html` — enlarge `#end-turn-btn`
- `src/screens/hud/EndTurnButton.tsx` — keyboard listener + hint label

## Testing

- Manual: click ends turn as before; Ctrl+Enter ends turn while on the game screen;
  shortcut is ignored while AI is thinking and after game over.
- Existing test suite and typecheck pass.
