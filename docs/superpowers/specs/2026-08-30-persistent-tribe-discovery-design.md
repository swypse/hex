# Persistent Tribe Discovery

## Overview

Tribe discovery currently derives the set of known tribes from the *current* game state
(units standing on tiles explored by the local player). Because it is stateless, a tribe's
borders and stats revert to "unknown" once its units leave explored territory or are killed,
and the "You meet X!" message can fire again. Discovery must instead be **persistent**: once
a player meets a tribe, it stays discovered until the game ends.

## Changes

### 1. Player state (`src/game/players.ts`)

- `Player` gains `knownTribes: Tribe[]` — the monotonic set of tribes the player has met.
- `buildPlayers` / `buildMultiplayerPlayers` seed it with the player's own tribe:
  `knownTribes: [tribe]`. This is part of `GameStateSnapshot` (players are already
  `structuredClone`d), so it syncs across host/clients and survives save/load.

### 2. Simulator persistence (`src/game/simulator.ts`)

- New method `syncDiscoveries()`: for each player `P`, compute
  `knownTribesFor(map, players, P)` (own tribe + tribes of units currently standing on tiles
  explored by `P`) and union it into `players[P].knownTribes` (never removing entries).
- Called at the end of every `applyCommand`, after the action dispatch (including the whole
  AI/pirate round triggered by `endTurn`). Entries are monotonic, so once a tribe is added it
  stays until game end.
- `knownTribesFor` in `src/game/discovery.ts` is unchanged and remains the "currently
  visible tribes" helper that `syncDiscoveries` unions from.

### 3. Renderer & stats read the persisted set

- `src/render/mapRenderer.ts`: `knownOwners` is computed from
  `new Set(players[localPlayerIndex].knownTribes)` instead of the derived
  `knownTribesFor(map, players, localPlayerIndex)`.
- `src/ui/overlays/GameStats.ts`: `known` is `new Set(players[localPlayerIndex].knownTribes)`
  instead of the derived call. Border/label colors and stats names therefore stay correct
  after discovery even when the tribe's units are gone.

### 4. Controller notification (`src/controller/gameController.ts`)

- `deriveKnownTribes()` returns the persisted set: `new Set(players[localPlayerIndex].knownTribes)`.
- `syncKnownTribes(notify)` unions the current set into the private `knownTribeIds` instead of
  replacing it, so a discovered tribe is announced exactly once. "You meet X!" chaining stays.

## Tests

- `tests/discovery.test.ts`: keep the `knownTribesFor` derivation tests; update the two
  controller-notification tests to seed `sim.players[0].knownTribes` (persisted) instead of
  relying on unit positions.
- `tests/players.test.ts`: assert every player's `knownTribes` starts as their own tribe.
- `tests/simulator.test.ts` (or a new case): after `applyCommand('move')` that reveals an
  enemy unit, the moving player's `knownTribes` gains the enemy tribe; moving the enemy unit
  away afterwards does not remove it (persistence).
- `tests/gameStats.test.ts`: seed `players[0].knownTribes` to control known vs unknown instead
  of unit positions.

## Out of scope

- No change to the discovery trigger rule (units on explored tiles only; pirates excluded).
- No change to the "You meet X!" message text or chaining.
