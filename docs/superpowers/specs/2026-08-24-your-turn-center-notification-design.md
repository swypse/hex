# "Your Turn" Center Notification Design

Date: 2026-08-24

## Problem

When it becomes the local player's turn, there is no prominent indication — only a
small toast on the left edge. Players want a clear center-screen "Your turn"
notification each time their turn begins.

## Design

`presentTurnStarted` in `src/controller/gameController.ts:1132` runs for every
`turnStarted` event (game start and each turn change) and already knows the
`playerIndex` and `store.localPlayerIndex`. Reuse the existing `CenterMessage`
component (`src/ui/CenterMessage.tsx`), which renders `centerMessage` centered at
`zIndex: 70` and auto-dismisses after 1 second.

Add one line to `presentTurnStarted` (after the `setAiActive` line):

```ts
if (playerIndex === store.localPlayerIndex) store.setCenterMessage('Your turn!');
```

Behavior:
- Shows at game start when the local player begins (including the initial turn).
- Shows every time the local player's turn begins thereafter.
- Opponent / AI turns show only the existing left toast (`showPopup`), no center
  message.
- Works in single-player and net modes via `localPlayerIndex`.

## Files touched

- `src/controller/gameController.ts` (one line in `presentTurnStarted`)

## Testing

- Run `npm run typecheck` and `npm test`.
- Manual (`npm run dev`): start a game → "Your turn!" appears centered at game
  start and again each time your turn begins; when the AI/opponent plays, no
  center message appears.
