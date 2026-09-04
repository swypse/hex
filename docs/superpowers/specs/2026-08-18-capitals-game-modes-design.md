# Design: Capitals, game modes & win conditions

Date: 2026-08-18

## Goal

Mark each player's starting village as a **capital** (with a black dot on its hex), add two **game modes** — "Capture the map" and "30 Turns" — with a mode selector on the setup screen, win conditions per mode, a kill counter for tiebreaks, and a game-over overlay.

## Design decisions (confirmed with user)

1. **Capital**: `Settlement.capital: boolean`; the owned starting village of each player is the capital. A black dot is drawn at the center of the capital village's hex.
2. **Game modes**: `'capture'` and `'turns30'`; selector on the setup screen; mode name label top-left above the players list.
3. **Capture the map**: game ends when one player owns all **owned** villages (free villages ignored). `expectedTurns = playerCount × 5 + 5` computed at game start; if the game ends at `turn ≤ expectedTurns`, the winner gets `playerCount × 10` bonus score.
4. **30 Turns**: game ends after round 30. Winner = highest score; tie → most kills; tie → fewer units on the map; tie → alphabetical by name.
5. **Kills**: `Player.kills: number` (init 0), incremented for the killer's player on every kill.
6. **Game-over overlay**: full-screen, shows winner + tribe, final scores sorted desc, bonus note (capture mode, when awarded), and "Play again" (→ setup) + "Main menu" buttons. Input frozen while shown.

## Data model

- `Settlement` gains `capital: boolean` (default `false`; set `true` on owned starting villages in `generateMap`).
- `Player` gains `kills: number` (init `0` in `buildPlayers`).
- Store gains:
  - `mode: GameMode` + `setMode` (`GameMode = 'capture' | 'turns30'`).
  - `gameOver: boolean` + `setGameOver`.
  - `winnerIndex: number | null` + `setWinnerIndex`.
  - `expectedTurns: number` + `setExpectedTurns`.
  - `bonusAwarded: boolean` (whether the capture-mode fast-win bonus was given).

## Capital rendering

In `mapRenderer`, when a tile has a settlement with `capital === true`, draw a small **black dot** at the village center (radius ~`hexSize * 0.08`) on top of the village sprite.

## Game flow (`gameController`)

- `startGame(tribe, enemyCount, mode)`:
  - stores `mode`; computes and stores `expectedTurns = playerCount * 5 + 5`; resets `gameOver`, `winnerIndex`, `bonusAwarded`.
- **Capture detection** (`captureVillage` handler in human and AI paths and at round end): if all owned settlements share a single owner → that player wins; if `mode === 'capture'`, end the game.
- **Round end** (`runAiPhase` after `turn++`): if `mode === 'turns30'` and `turn >= 30` → end the game (determine winner). If `mode === 'capture'` → run capture detection.
- **End game** (`endGame()`): computes winner, applies the capture-mode fast-win bonus to the winner's stored score if applicable (`turn <= expectedTurns`), sets `winnerIndex`, `bonusAwarded`, `gameOver = true`, `aiActive = false`, and `setPlayers` (to persist the bonus and kills). All further input is disabled while `gameOver`.
- **Winner computation** (`computeWinner(players, map)` — pure, testable):
  - capture mode: the single owner of all owned settlements.
  - turns30 mode: max total score; tie → max kills; tie → min units on map; tie → alphabetically earliest name.

## Kills

In `confirmAttack` and the AI attack handler: on `result.targetDied`, `players[attacker.owner].kills += 1`; on `result.attackerDied`, `players[target.owner].kills += 1` (alongside the existing score award).

## HUD

- `SetupScreen`: mode selector buttons ("Capture the map", "30 Turns"), default `'capture'`, selected style like the other options; `startGame(tribe, enemies, mode)`.
- Mode name label: small text at top-left **above** the players list (`#mode-label`), reading "Capture the map" or "30 Turns".
- New `GameOverScreen.tsx`: full-screen overlay with winner name + tribe, sorted final scores, bonus note, and Play again / Main menu buttons.
- `GameScreen`: renders `GameOverScreen` when `gameOver`.

## Pure module (new)

`src/game/gameMode.ts` (or extend existing): 
- `GAME_MODE_NAMES: Record<GameMode, string>`.
- `expectedTurnsFor(playerCount): number` (`playerCount * 5 + 5`).
- `captureWinnerIndex(map): number | null` — the single owner of all owned settlements, else null.
- `computeWinner(players, map): number` — per-mode tiebreak rules.
- `countUnits(map, playerIndex): number`.
- `bonusScoreFor(playerCount): number` (`playerCount * 10`).

## Files touched

- `src/game/mapGen.ts` — `Settlement.capital`.
- `src/game/players.ts` — `Player.kills`.
- `src/game/gameMode.ts` (new) — pure mode/winner helpers.
- `src/store/gameStore.ts` — mode/gameOver/winner/expectedTurns/bonusAwarded.
- `src/controller/gameController.ts` — mode handling, win checks, kills, bonus, endGame.
- `src/screens/SetupScreen.tsx` — mode selector.
- `src/screens/GameOverScreen.tsx` (new), `src/screens/GameScreen.tsx`.
- `src/render/mapRenderer.ts` — capital dot.
- `index.html` — `#mode-label` styles.
- `tests/gameMode.test.ts` (new); updated `tests/mapGen.test.ts`, `tests/players.test.ts`.

## Testing

- `gameMode.test.ts`: `expectedTurnsFor`, `captureWinnerIndex` (single owner, free villages ignored, null when split), `computeWinner` (score → kills → fewer units → alphabetical), `countUnits`, `bonusScoreFor`.
- `mapGen.test.ts`: owned starting village is `capital`; free villages are not.
- `players.test.ts`: `kills` starts 0.
- Existing suite, `npm run typecheck`, `npm run build` stay green.
- Manual via `npm run dev`: capitals show a black dot; mode selector works; capture mode ends on full ownership (fast-win bonus shown when under expected turns); 30-turns mode ends at round 30 with the tiebreak rules; game-over overlay + buttons.

## Out of scope

- AI-specific mode behavior changes (AI already plays normally in both modes).
- Persisting games across reloads.
- Victory animations beyond the overlay.
