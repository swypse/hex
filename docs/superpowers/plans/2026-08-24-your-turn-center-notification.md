# "Your Turn" Center Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a centered "Your turn!" message whenever the local player's turn begins, including the game-start turn.

**Architecture:** Add one line to `presentTurnStarted` in `src/controller/gameController.ts` that calls `store.setCenterMessage('Your turn!')` when `playerIndex === store.localPlayerIndex`. The existing `CenterMessage` component already renders `centerMessage` centered and auto-dismisses after 1 second.

**Tech Stack:** TypeScript, React (existing `CenterMessage`), Zustand.

## Global Constraints

- `npm run typecheck` and `npm test` must pass.
- No automated test exists for `gameController` (singleton with a Pixi app; node test env). Verification is typecheck + test suite + manual browser check.
- Keep `showPopup(...)` toast on the left as-is — it still fires for every player's turn.
- `CenterMessage.tsx` and the store are unchanged.

---

### Task 1: Show center message on local player's turn start

**Files:**
- Modify: `src/controller/gameController.ts` (`presentTurnStarted`, lines 1132-1141)

**Interfaces:**
- Consumes: `useGameStore.getState()` — `store.localPlayerIndex`, `store.setCenterMessage(message: string | null)`.
- Produces: no new interface.

- [ ] **Step 1: Add the center message call**

In `src/controller/gameController.ts`, locate `presentTurnStarted`:

```ts
  private presentTurnStarted(playerIndex: number, turn: number): void {
    const store = useGameStore.getState();
    const player = store.players[playerIndex];
    if (!player) return;
    store.setCurrentPlayerIndex(playerIndex);
    store.setTurn(turn);
    store.setSelection(null);
    store.setAiActive(playerIndex !== store.localPlayerIndex);
    showPopup(`${player.name}'s turn!`, { background: tribeBackground(player) });
  }
```

Insert the new line immediately after `store.setAiActive(...)` (line 1139), so it becomes:

```ts
    store.setAiActive(playerIndex !== store.localPlayerIndex);
    if (playerIndex === store.localPlayerIndex) store.setCenterMessage('Your turn!');
    showPopup(`${player.name}'s turn!`, { background: tribeBackground(player) });
```

`setCenterMessage` already exists in the store (`src/store/gameStore.ts:127`) and
`CenterMessage` (`src/ui/CenterMessage.tsx`) renders it centered at `zIndex: 70`
and clears it after `MESSAGE_MS` (1000ms). No other edits needed.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the app, start a game.

Checklist:
1. At game start (local player's first turn): a centered dark box with "Your turn!"
   appears and disappears after ~1 second.
2. End your turn: during the AI's turn no center message appears; when your turn
   returns, "Your turn!" appears again.
3. The existing left toast with the player name still appears as before.

- [ ] **Step 5: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: show your turn center notification when local player's turn begins"
```
