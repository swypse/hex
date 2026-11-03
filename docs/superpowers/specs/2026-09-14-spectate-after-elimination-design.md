# Spectate after Elimination (single-player capture mode)

## Goal

In single-player capture mode, when the local player is eliminated (loses their last
village) while the game is still running between the remaining AI players, prompt the
player with **Watch or finish?** instead of leaving them frozen on a dead board.

- **Watch:** reveal the whole map, auto-advance AI turns (with animations) until one AI
  wins, then show the Game Over screen.
- **Finish:** compute the winner from the current board and show the Game Over screen now.
- While watching, show an **"Exit to main menu"** button above the turn bar.

## Background / current behavior

- The game ends in capture mode only when one player owns all non-free villages
  (`captureWinnerIndex` in `src/game/gameMode.ts`).
- When the human player's last village is captured, `doCapture` marks them `isActive = false`
  (`src/game/simulator.ts`), and `doEndTurn` auto-skips inactive players
  (`src/game/simulator.ts`).
- Single-player turns only advance when the human presses End turn
  (`gameController.endTurn` → `sendCommand endTurn` → `doEndTurn`). Once the human is
  inactive and 2+ AIs remain, the game has no driver: the human is frozen with no prompt
  until an AI eventually wins.

## Changes

### 1. Store state (`src/store/gameStore.ts`)

- Add `watching: boolean` (default `false`) with a `setWatching(v: boolean)` action.
- Add overlay kind `{ kind: 'watchingPrompt' }` to `OverlayState`.

### 2. Elimination detection (`src/controller/gameController.ts`)

In `runCommand`, after `syncStore()` and before returning, detect the prompt condition
exactly once:

```
netMode === 'single'
&& mode === 'capture'
&& !gameOver
&& local player (sim.players[localPlayerIndex]) isActive === false
&& current overlay !== 'watchingPrompt'
&& !watching
```

When true, open the `watchingPrompt` overlay.

### 3. Prompt dialog (new `src/ui/overlays/WatchPromptDialog.ts`)

Popup titled **"Game over"**, body text explaining the player has been eliminated, with two
buttons:

- **Watch** → call `gameController.watchGame()`.
- **Finish** → call `gameController.finishGameNow()`.

Register the overlay in `OverlayManager` under the `watchingPrompt` kind.

### 4. Controller methods (`src/controller/gameController.ts`)

- Extract the reveal logic from `cheatRemoveFog` into a reusable `revealMapForLocal()` that
  marks every tile explored for the local player and adds all other tribes to
  `knownTribes`, then `syncStore()`, `saveGame()`, `render()`. `cheatRemoveFog` calls it.
- `watchGame()`: `revealMapForLocal()`, set `watching = true`, dismiss the prompt overlay,
  and start the autoplay loop.
- `finishGameNow()`: dismiss the prompt, call `sim.endNow()` (see below), `syncStore()`.
- `exitWatching()`: stop the loop (`watching = false`), `confirmLeaveGame()`.

### 5. Autoplay loop (`src/controller/gameController.ts`)

```
private async runWatchLoop(): Promise<void> {
  while (useGameStore.getState().watching && this.sim && !this.sim.gameOver) {
    await this.runCommand({ type: 'endTurn' });
    await delay(SPECTATE_ROUND_DELAY_MS);
  }
}
```

`runCommand` already animates events (attack/capture with camera follow), so each `endTurn`
advances exactly one round of AI play readably. The loop exits naturally on game over, and
the Game Over overlay shows automatically (`OverlayManager` shows it when
`gameOver && winnerIndex !== null`). Guard the loop against re-entry and against network
mode (only single-player).

### 6. Simulator: end-after-one-round (`src/game/simulator.ts`)

Currently `doEndTurn` bursts through up to 64 iterations when no active human remains,
running many rounds in one `endTurn`. Change it so that, after completing the round
boundary at `next === 0` (pirate/income/turn++ work), it **returns** after one full round
when there is no active human player left (instead of continuing to iterate). This makes
one `endTurn` == one round, so the watch loop paces cleanly. Normal play (active human) is
unchanged.

Add a public `endNow()` method that computes the winner via `computeWinner(players, map)`
and calls the existing private `endGame(winnerIndex)` (awards temple/achievement scores and
emits `gameOver`).

### 7. "Exit to main menu" button (new `src/ui/hud/HudWatchExit.ts`)

A small HUD widget rendered **only while `watching && !gameOver`**, positioned above the
turn bar (bottom-center; y = `screenHeight - TOOLBAR_HEIGHT - TURN_BAR_HEIGHT - GAP`).
Label: **"Exit to main menu"**. On click → `gameController.exitWatching()`.

Registered in `GameScreen`'s widget list.

### 8. i18n (`src/i18n/locales/en.ts`, `ru.ts`)

Add keys for: watch dialog title, body, the "Watch" and "Finish" buttons, and the
"Exit to main menu" button.

## Edge cases

- The prompt appears exactly once; subsequent elimination events don't re-prompt.
- Watch loop is single-player only and guarded against re-entry.
- "Exit to main menu" hides automatically once the game ends.
- If the game is already over at detection time (only one AI left), no prompt is shown; the
  normal Game Over overlay appears.

## Testing

- Unit: after the local player is eliminated in capture mode with AIs remaining, the prompt
  condition is true; `finishGameNow` ends the game with a computed winner.
- Unit: `doEndTurn` ends after one round when no active human remains.
- Existing test suite + `npm run typecheck`.
