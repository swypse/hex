# Client Rejoin After Reload / Disconnect (multiplayer)

## Goal

Let a multiplayer **client** who reloads the page or briefly disconnects get back into the
running match with one click, without the host having to resend a join link.

- The player's relay connection closes on reload; when they rejoin, the host must re-attach
  them to the same seat (by name) and push the current state back.
- **Out of scope:** host page reload recovery (the host's `Simulator` stays in-memory;
  persisting the authoritative room is a separate, larger feature).
- **Scope:** client only.

## Background / current behavior

- A host mid-game already re-binds a reconnecting client in
  `NetworkController.bindInGameClient`: it matches the joining client to a human seat by
  player `name` (`isHuman && index !== 0 && name === name`), updates the entry's `peerId`
  / `online`, cancels the disconnect pause timer, and sends a fresh
  `{ type: 'state', state, playerIndex }` snapshot. So a client who rejoins the same room
  under the **same name** while the host is still running lands back in the match.
- The relay (`RelayCore`) is idempotent about closes: a reconnecting client registers as a
  new connection, the old one delivers a single `client-left`, the new one `client-joined`.
- Nothing persists the room code / player name on the client today: after a reload the
  player must re-enter the code (from a shared link) and remember their exact name.
- The start screen already has a "Resume" button for the single-player save
  (`StartScreen.mount`, `saveRepository.hasSave()`), which is the UX pattern to mirror.

## Changes

### 1. Storage — new `src/storage/activeMatch.ts`

Follows the `settings.ts` / `storageService` pattern (guarded key/value JSON, safe in
tests / private mode):

```ts
interface ActiveClientMatch {
  role: 'client';
  code: string;
  name: string;
  relayUrl: string;
  savedAt: number;
}
```

- Key: `hex-active-match-v1`, via `storageService.getItem` / `setItem` / `removeItem`.
- `export const ACTIVE_MATCH_TTL_MS = 45 * 60 * 1000;`
- `saveActiveMatch(code: string, name: string, relayUrl: string): void`
- `clearActiveMatch(): void`
- `loadActiveMatchFresh(): ActiveClientMatch | null` — returns the record when
  `Date.now() - savedAt <= ACTIVE_MATCH_TTL_MS`; when stale (or on corrupt JSON) it clears
  the entry and returns `null`.

### 2. Persist / clear points (`src/controller/networkController.ts`, `src/store/gameStore.ts`)

- **Save** inside `NetworkController.joinGame(code, name, relayUrl?)` at call time (it knows
  the code and name): `saveActiveMatch(code, name, relayUrl ?? resolveRelayUrl())`.
- **Clear:**
  - `NetworkController.hostGame()` — hosting is not a client match.
  - `NetworkController.cancelLobby()` — player backed out.
  - `confirmLeaveGame()` in `src/store/gameStore.ts` when `netMode === 'client'` (leave /
    disconnect dialog "Leave game").
  - `NetworkController.onHostMessage` case `'state'` when `msg.state.gameOver` — match
    finished; the player watches the Game Over screen, no rejoin button later.
  - Implicitly by the TTL in `loadActiveMatchFresh()`.

### 3. Relay URL threading

- `gameController.joinGame(code, name, relayUrl?)` and `NetworkController.joinGame(...)`
  gain an optional `relayUrl` passed into the `RelayClientSession` constructor; when absent
  the session keeps its current `resolveRelayUrl()` default. This lets Rejoin reuse the same
  alternative relay the match was on (e.g. a self-hosted relay while Cloudflare is blocked).

### 4. Controller rejoin entry — `src/controller/gameController.ts`

```ts
rejoinGame(): void
```

- Reads `loadActiveMatchFresh()`; if `null` (none / expired / corrupt) it is a no-op.
- Otherwise calls `joinGame(match.code, match.name, match.relayUrl)` — the existing path:
  screen → lobby → relay register → `join` message → host `bindInGameClient` → fresh state
  → screen `game`, pause cleared, `playersOnline` restored.

### 5. Start screen button — `src/ui/screens/StartScreen.ts`

- In `mount()`, after the `saveRepository.hasSave()` resume check: when
  `loadActiveMatchFresh()` returns a record, prepend a **Rejoin match** button
  (`onClick: () => gameController.rejoinGame()`).
- i18n additions: `start.rejoinMatch` → en `Rejoin match`, ru `Вернуться в матч`.
- The button is prepended ahead of Resume; ordering with both present:
  Rejoin match, Resume, Single player, Multiplayer, Tutorial.

## Data flow (reload scenario)

1. Player reloads mid-game. Browser closes the relay socket → host sees `client-left`,
   marks the player offline, starts the disconnect grace timer.
2. App boots to start screen; `loadActiveMatchFresh()` returns the saved match → the start
   screen shows **Rejoin match**.
3. Player clicks → `rejoinGame()` → `joinGame(code, name, relayUrl)` → lobby/connecting.
4. Relay registers the new connection (`client-joined`), client sends `join` with the same
   name.
5. Host re-binds the seat (`bindInGameClient`): updates `peerId`/`online`, cancels the
   grace/pause, `setPaused(null)`, broadcasts presence, sends a `state` snapshot.
6. Client stores the snapshot, `setScreen('game')`, resumes play with their seat.

## Error handling

- **Transient failures** (`room-not-found`, `host-left` while the relay retries, host briefly
  unreachable): the match record is kept — the player can sit in the lobby and retry / wait.
  The record is only dropped by an explicit leave, game over, hosting, or the TTL.
- **Stale save / wrong name** (host seats can't be renamed in-game today, so mismatches are
  rare): the player lands in the lobby without a seat; the record stays so they can retry.
- **Corrupt storage value**: `loadActiveMatchFresh()` clears and returns `null`.

## Testing

- `tests/activeMatch.test.ts` (new): save/load round-trip; TTL expiry via `vi.useFakeTimers`
  (fresh within TTL, cleared after); stale load clears storage; corrupt JSON → null + clear.
- `tests/lobbyJoinLink.test.ts` (or StartScreen test): "Rejoin match" button is present with
  a fresh match, absent without one / with a stale one; clicking it invokes
  `gameController.rejoinGame()`.
- `tests/disconnectHandling.test.ts` or new: `rejoinGame()` with a fresh match calls
  `joinGame` with the stored code + name + relayUrl; with none/expired it is a no-op.
- Lifecycle: `confirmLeaveGame()` (client) clears the record; `hostGame()` clears it;
  joining a different room overwrites it; client `state` with `gameOver` clears it.
- Relay integration (extend `tests/relay.test.ts` style): host session stays up while a
  client session "reloads" (new `RelayClientSession`, same code + name) against the local
  relay; assert the host re-binds and forwards a fresh `state` to the new client id.

## Deferred

- **Host reload recovery** (approach C): persist the host's authoritative `Simulator`
  snapshot and rebuild the room on reload. Builds on the same storage layer later.