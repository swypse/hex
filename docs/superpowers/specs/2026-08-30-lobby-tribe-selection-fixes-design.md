# Lobby Tribe Selection and Create Button Fixes

## Overview

Two small lobby-screen fixes:

1. Center the "Create room" button in the host view.
2. In a joined room, a client must see their own picked tribe circle highlighted with the
   selected (blue) border — currently the host's tribe is always highlighted and the
   client's own pick disappears from the tribe row.

## Changes

### 1. Center "Create room" button (`src/ui/screens/LobbyScreen.ts`)

- In `renderHost()`, the Create room button is 240px wide and positioned at
  `createBtn.position.set(cx - 260, y + 446)`. Change the x to `cx - 120` so the button is
  centered on `cx`. The Back button below (96px wide at `cx - 48`) is already centered and
  stays.

### 2. Client tribe selection in a joined room (`src/ui/screens/LobbyScreen.ts`)

In `renderRoom()`, two bugs affect a joining (client) player:

- `available = TRIBES.filter((t) => !taken.has(t.id) || t.id === hostTribeId)` — `taken`
  includes every joined player's tribe, including the client's own, so once a client picks a
  tribe it is filtered out and disappears from the row.
- `makeTribeOption(..., t.id === hostTribeId)` always draws the selected border on the
  host's tribe.

Fix:

```ts
const ownTribeId = isHost ? hostTribeId : (me?.tribeId ?? -1);
const available = TRIBES.filter((t) => !taken.has(t.id) || t.id === hostTribeId || t.id === ownTribeId);
```

and render each option with `t.id === ownTribeId` as the selected flag. This keeps the
host's tribe visible in the row (host behavior unchanged), keeps the client's own pick
visible, and highlights the client's own pick. A client that has not picked yet has
`ownTribeId === -1`, so nothing is highlighted.

## Tests (`tests/lobbyHost.test.ts`)

- "centers the create room button": in the host view, the Create room button's `position.x`
  equals `1280 / 2 - 120`.
- "highlights the joining player's own tribe": set the store's `lobby` to a client room
  (host + one client, both with a tribe) and `myPeerId` to the client's peer id, render, and
  assert the client's tribe option's circle Graphics has a `stroke` instruction while the
  host's tribe option does not.

## Out of scope

- No change to the game-over screen, host flow, or ready/start logic.
- No change to `makeTribeOption` or tribe naming.
