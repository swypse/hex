# In-Game Disconnect Handling Design

## Problem

When a player disconnects mid-game there is no graceful handling:

- If a **client** disconnects and it is their turn, the game simply stalls
  forever with no explanation. A manual rejoin already re-binds the seat and
  re-sends the snapshot, but there is no notice and no flow.
- If the **host** disconnects, clients retry for ~12 seconds then show a dead-end
  "Disconnected from the host." Host-reconnect is technically possible (the
  relay keeps the room while any client lingers, and the host can reclaim the
  same room code), but nothing supports a longer wait and there is no "waiting
  for the host" UI.
- There is no way to resolve a missing player: no AI takeover, no forfeit.

## Goal

Handle a mid-game disconnect so the game either resumes or the offending player
is resolved, with clear in-game UI:

- Freeze the game and show a notice ("Waiting for host…" / "{name} disconnected").
- Let waiting continue as long as it is useful (transient drops recover).
- Let the host resolve a dropped peer: **Wait**, **Give to AI**, or **Forfeit**.

## Architecture

Host-authority model. The host already owns the authoritative `Simulator`; the
relay server holds no game state, so "wait for host" only recovers transient
host drops where the host tab survives.

### 1. Store state

Add to `GameStore`:

- `paused: 'disconnect' | null`
- `pausedName: string` (the disconnected player's name, for the message)

While `paused` is set:

- `handleMapClick` returns early.
- Toolbar action buttons and `endTurn` are disabled.
- The player chips still render (existing `playersOnline` presence).

### 2. Client side: waiting for the host

- Add an `inGame` flag to `RelayClientSession` (set by `NetworkController` once
  the client is in the game).
- When in-game, `reconnect()` retries with a much longer cap (≈5 min) instead of
  the lobby default (12 × 1 s). Lobby behaviour is unchanged.
- On `onClose`, `onError`, or `host-left` **while in-game**: set
  `paused='disconnect'`, `pausedName=''`, and show a modal "Waiting for host…"
  with a **Leave game** button.
- On the first `state` message after reconnecting (the host re-sends a full
  snapshot): clear the pause, close the modal, resume. The existing pending
  snapshot machinery adopts the new state.

### 3. Host: managing a dropped human peer

Extend `handleClientClosed` (src/controller/networkController.ts:224). Keep
existing presence updates, but when the dropped seat is the **current turn **,
set `paused='disconnect'`, `pausedName=<name>`, and show a host modal with three
choices:

- **Wait** — stay paused. A rejoin re-binds the seat via
  `bindInGameClient` and re-sends the snapshot. Resume when the player's turn
  passes or they rejoin.
- **Give to AI** — sim op flips `isHuman=false` for that player. AI turns run
  automatically (simulator.ts:664). Resume the game. On a later rejoin, the
  seat flips back to human (the controlling player's request).
- **Forfeit** — sim op frees the player's villages (set `settlement.owner=null`),
  removes their units, sets `isActive=false`, and runs end-condition checks so
  the game can finish. Resume the game.

All three broadcast the resulting snapshot (and events) to clients.

### 4. Simulator ops

Add two host-only sim operations, issued by the host and applied through the
existing command/snapshot path:

- `giveToAI(playerIndex)`: `player.isHuman = false`.
- `forfeit(playerIndex)`: free all villages owned by the player (set
  `settlement.owner = null` and clear per-tile `ownedBy`/`claimedByVillage`),
  remove all their units from the map, set `isActive = false`, then run
  `checkEndConditions()`.

These may be represented as new `Command` kinds (`{type:'giveToAI'|'forfeit'}`)
accepted only by the host, or as host-private direct sim calls
broadcast as `state`. The latter is simpler and avoids exposing new player
commands to clients.

### 5. Rejoin after "Give to AI"

When a player officially rejoins a game where their seat was given to AI, the
host flips the seat back: `isHuman=true`, keeps their tribe/resources as-is
(AI may have played some turns), re-binds via `bindInGameClient`, and re-sends
the snapshot. The player resumes from the current state.

## UI

- **Client "Waiting for host…" modal**: overlay with a spinner/notice and a
  **Leave game** button.
- **Host "disconnected" modal**: three buttons (Wait / Give to AI / Forfeit),
  plus the disconnected player's name.
- Existing overlays (`WelcomeDialog`, etc.) are rendered over the map already;
  the new modals follow the same overlay mechanism.

## Tests

- `networkController`:
  - host sets pause when a dropped client is the current turn; clears when
    that turn passes.
  - Give to AI flips the seat and resumes; rejoin flips the seat back.
  - Forfeit runs the sim op, clears villages/units, ends conditions.
  - client sets pause while waiting for host; clears on snapshot.
- Relay: in-game extends retry attempts.
- Store: paused state persist/disables (via UI tests or store unit tests).
- GAME mode: forbid pause + forfeit interplay with end conditions.

## Out of scope

- Host reconnection requiring a state server: the relay deliberately holds no
  game state; "wait for host" covers only transient drops (host tab survives).
- Spectator rejoin for a forfeited seat.
- Automatic AI takeover or auto-forfeit timers (host decides manually).
- Game-clock reconnect timers beyond the fixed in-game cap.