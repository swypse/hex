# P2P Multiplayer Design

Date: 2026-08-19

## Goal

Let the game be played by multiple human players on separate machines plus AI opponents,
without requiring the player to run or host any game server.

## Decisions

- **Transport:** WebRTC via the PeerJS public broker (`0.peerjs.com`). Signaling only;
  game data flows P2P. Zero infrastructure maintained by the user.
- **Topology:** Star — one peer is the **host**, every other human peer is a **client**
  connected only to the host.
- **Authority:** The host runs the single authoritative simulation (map, players, combat
  RNG, AI turns, income, win checks). Clients hold a mirror of the state and send commands.
- **Sync:** Full-state snapshot on connect **and after every command batch** (the map is
  ~217 tiles, so a snapshot is tens of KB — negligible for turn-based play). A
  lightweight **presentation event** list accompanies each snapshot to drive animations,
  popups, HP floats, and camera follow. Clients replace their mirror wholesale and never
  re-implement mutation logic. Clients render fog of war locally (honest-by-rendering,
  no per-player filtering).
- **Lobby:** Host creates a room with a code; clients join, pick a free tribe; host starts
  when all human slots are filled.

## Architecture

```
pc1 (HOST) ── PeerJS data channel ── pc2 (CLIENT) ... pcN
  │                                     │
  Simulator (authoritative)              Simulator mirror
  - owns map + players                   - no AI, no RNG
  - resolves commands + combat           - renders from state
  - runs all AI turns                    - computes reachable/attackable locally
  - emits domain events                  - sends commands, applies events
```

Every peer runs the full client (Pixi renderer + React UI). The host additionally runs
the authoritative **Simulator**, a new module extracted from `GameController`.

Both host and client feed received events through the same **presentation layer**, so
animations, popups, HP floats, and camera follow are written once. This also decouples
simulation from animation: today `runAiPhase` interleaves awaited animation into turn
logic; after the split the simulator is synchronous and emits events, and the
presentation layer animates them (with the existing tween delays).

### Turn flow (host)

A synchronous state machine over players, in order:

- If the current player is **AI**: run its turn synchronously (produces events).
- If the current player is a **remote human**: emit `turnStarted`, wait for commands.
- If the current player is the **host human**: emit `turnStarted`, host inputs directly.
- After all active players: apply income, increment turn, check win conditions.

Because the simulator is synchronous, a whole AI round of events can be produced
instantly and streamed; clients animate as events arrive.

## Protocol

### PeerJS

- Host creates peer with id `hex-<roomcode>` (6 alphanumeric chars).
- Clients call `peer.connect(hostId)`.

### Messages

Client → Host:

- `join` `{ name }`
- `pickTribe` `{ tribeId }`
- `ready`
- `command` `{ type, payload }`

Host → Client:

- `lobbyUpdate` `{ joined: [{ peerId, name, tribe }] }`
- `state` — full snapshot (map + players + mode + turn + currentPlayerIndex), sent on
  connect and after every command batch
- `events[]` — presentation events for the latest batch (animation, popups, camera)
- `error` `{ message }`

### Commands

Mirror the existing controller actions: `move`, `attack`, `capture`, `spawn`, `build`,
`upgradeVillage`, `upgradeShip`, `openSkill`, `heal`, `extractForest`, `shipLanding`,
`endTurn`. The host validates each command against its authoritative state using the
same game-rule checks the controller performs today (unit owner, reachable target,
affordable cost, etc.) before applying it.

### Events

Presentation cues only — the authoritative state always arrives via the snapshot.
JSON-serializable deltas:

- `unitMoved` — `{ unitId, from, path, to }`
- `attack` — `{ attackerId, targetId, attackerDamage, targetDamage, missed,
  attackerDied, targetDied }`
- `spawned` — `{ unitType, tile, playerIndex }`
- `captured` — `{ tile, oldOwner, newOwner, ownerDied }`
- `villageUpgraded` — `{ tile, level, playerIndex }`
- `built` — `{ kind, tile, playerIndex }`
- `skillOpened` — `{ playerIndex, skillId }`
- `healed` — `{ unitId, playerIndex }`
- `extracted` — `{ tile, playerIndex }`
- `shipUpgraded` — `{ unitId, level, playerIndex }`
- `shipReverted` — `{ unitId }`
- `scoreFly` — `{ playerIndex, amount, tile }`
- `turnStarted` — `{ playerIndex, turn }`
- `gameOver` — `{ winnerIndex, bonus }`

## Lobby flow

- **Host setup screen:** choose mode, total players (2–4), number of AI; then show the
  generated room code and the list of joined players with their chosen tribes. Start
  button enabled once every human slot has picked a tribe. Unfilled slots get AI.
- **Client screen:** enter code + display name → see room → pick a free tribe from
  `TRIBES` minus taken ones.
- Player slots: host = index 0, then join order, AI last.
- AI get remaining tribes and names from `generatePlayerNames`.

## Code changes

| File | Change |
|------|--------|
| `src/game/simulator.ts` (new) | Extraction of simulation from `GameController`: commands, AI phase, income, win checks, event emission. |
| `src/game/events.ts` (new) | Domain event type definitions. |
| `src/net/peerSession.ts` (new) | PeerJS wrapper, message protocol, JSON serialization, host/client classes. |
| `src/screens/LobbyScreen.tsx` (new) | Room + tribe picking for host and client. |
| `src/screens/StartScreen.tsx` | Add "Multiplayer" entry. |
| `src/screens/SetupScreen.tsx` | Single-player path unchanged; host multiplayer path routes to lobby. |
| `src/controller/gameController.ts` | Slim to presentation + input; react to events; replace `players[0]` / `owner === 0` with `localPlayerIndex`; gate input to the local player's turn. |
| `src/store/gameStore.ts` | Add `localPlayerIndex`, lobby/connection state, turn-gating fields. |
| `src/render/mapRenderer.ts` | `owner === 0` → `localPlayerIndex`. |
| `src/game/players.ts` | Add `buildMultiplayerPlayers(humans, aiCount, rng)`. |

**Unchanged:** `combat`, `spawn`, `capture`, `skills`, `buildings`, `score`, `explore`,
`ai`, `aiPatterns`, `mapGen`, `hex`, ship, village, resources, all rendering core.

## Human = local player

The codebase hardcodes player 0 as the only human in ~20 places (controller and
renderer). Introduce `localPlayerIndex` in the store and replace those references.
Input handlers only act when it is the local player's turn and the peer is not the host
simulating AI.

## Serialization

`GameMap`, `MapTile`, `Player`, `Unit` are plain JSON-serializable objects (no classes,
Maps, or Sets), so `JSON.stringify` / `structuredClone` round-trips work directly.

## Error handling

- Host disconnects: game ends (out of scope for v1: no host migration or resync).
- Commands on a stale mirror: host validates authoritatively and drops invalid ones.
- Reconnect / resync: out of scope for v1.

## Testing

- **Simulator tests:** deterministic command → event sequences with seeded RNG; AI turn
  chaining produces correct `turnStarted` sequence; income and win checks match current
  behavior.
- **Serialization round-trip tests:** map/players → JSON → clone deep-equals original.
- **Lobby logic tests:** tribe-slot allocation, host-start gating.
- Existing tests keep passing (simulator behavior must match current controller logic).

## Out of scope (v1)

- Host migration, reconnect, and state resync.
- Anti-cheat / intel protection (full-state sync is honest-by-rendering).
- In-game chat.
