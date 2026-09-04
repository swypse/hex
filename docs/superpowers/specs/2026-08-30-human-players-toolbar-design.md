# Human Players Toolbar with Online/Offline Status

## Overview

Add a top-left toolbar on the game screen (multiplayer only) showing each human player as a
tribe-icon circle with their name, tribe name, and a green (online) / red (offline) status
dot. The host tracks mid-game disconnects and broadcasts presence changes to all clients. In
the lobby, disconnected players continue to be removed from the list (unchanged).

## Changes

### 1. Store presence data (`src/store/gameStore.ts`)

- Add `playersOnline: boolean[]` (index-aligned with `s.players`; `true` = online) and
  `setPlayersOnline(online: boolean[])`. Initial value `[]`.
- The toolbar reads `s.playersOnline[i]` for player `i`.

### 2. Host tracks offline mid-game (`src/controller/gameController.ts`)

- `hostPlayers` entries gain `online: boolean` (initialized `true` on connect).
- `onClose(peerId)`:
  - If the entry's `playerIndex === null` (still in lobby): **remove** it from
    `hostPlayers` and rebroadcast the lobby (current lobby behavior, unchanged).
  - If `playerIndex !== null` (game running): keep the entry, set `online = false`, update
    the host store's `playersOnline` (index `entry.playerIndex` → `false`), and broadcast a
    new host message `{ type: 'playersOnline', online }` where `online` is a boolean array
    of length `players.length` (`true` for the host at index 0, then each client's `online`
    by `playerIndex`).
- Initialize the host store's `playersOnline` to all-true in `startHostGame` after building
  players.

### 3. Clients receive presence (`src/net/peerSession.ts`, `src/controller/gameController.ts`)

- Add `HostMessage` variant `{ type: 'playersOnline'; online: boolean[] }`.
- `onHostMessage` handles it with `store.setPlayersOnline(msg.online)`.
- When a client enters the game (the `state` message handler), initialize
  `store.setPlayersOnline(msg.state.players.map(() => true))`.

### 4. Human players toolbar (`src/ui/hud/HudPlayers.ts`, mounted in `GameScreen.ts`)

- New `Widget` implementing the standard HUD pattern (subscribe to `useGameStore`, re-render
  on change, destroy on unmount).
- Visible only when `s.screen === 'game'` and `s.netMode !== 'single'`.
- Docked top-left with a small padding.
- One chip per human player (`s.players.filter((p) => p.isHuman)`):
  - a circle (radius 20) with the tribe icon (`${code}-icon.png`, clipped) inside;
  - a status dot (radius 6) overlapping the circle's top-right edge — green `0x2ecc71`
    when `s.playersOnline[i]`, red `0xe74c3c` otherwise, with a thin white stroke;
  - the player name and tribe name as small labels below the circle.
- Chips arranged in a horizontal row starting at the top-left corner.
- Add `new HudPlayers()` to the widget list in `GameScreen.mount()`.

## Tests

- `tests/hudPlayers.test.ts` (new): mounts the widget with a multiplayer store state and
  asserts it renders each human player's name and tribe name; asserts green/red dots match
  `playersOnline`; asserts it is hidden when `netMode === 'single'`.
- `tests/peerSession.test.ts`: the new `playersOnline` host message survives a JSON
  round-trip (same style as the existing protocol test).
- Controller: a mid-game disconnect keeps the entry and marks it offline; a lobby disconnect
  still removes it.

## Out of scope

- No change to an offline player's turn handling (a dropped player's turn still blocks the
  game) or to lobby behavior (offline players are still removed from the lobby list).
- No reconnection support.
- No AI players in the toolbar (human players only).
