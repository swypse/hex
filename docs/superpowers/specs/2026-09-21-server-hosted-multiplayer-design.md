# Server-Hosted Multiplayer (Durable Objects)

## Goal

Move the authoritative game host from the host player's browser to a Cloudflare Durable
Object so every browser becomes a thin, honest client.

- **Honest game:** no player sees another player's hidden data (strict server-side
  per-player redaction, mine-fog enforcement).
- **Lighter clients:** clients hold and render only their own `PlayerView`, not the whole
  game snapshot.
- **Stats / progress / leaderboards:** match results, per-player stats, and score-based
  global leaderboards persisted server-side.
- **Continue on other device:** stable player identity via email+password and OAuth
  accounts (JWT), so a player can resume play from any browser.
- **Out of scope:** single-player stays fully local (existing code path unchanged).
- **Scope:** multiplayer only.

## Background / current behavior

- The game is simulation-driven on a single host: the host browser owns the only
  authoritative `Simulator` (`src/game/simulator.ts`), created in
  `NetworkController.startHostGame` (`src/controller/network-controller.ts:383`).
- After every command batch the host calls `broadcastBatch`
  (`network-controller.ts:209`) which sends each client the **entire**
  `GameStateSnapshot` (~107 KB measured, 4 players) + a `GameEvent[]` batch over the
  WebSocket relay (`RelayHostSession` → Cloudflare Durable Object per room code).
- Clients never mutate authoritative state: they rebuild a `Simulator` mirror via
  `Simulator.fromSnapshot(snap)` (`adoptSnapshot`, `game-controller.ts:270`) and send
  `Command`s back. The exception is optimistic prediction of the deterministic subset
  (`PREDICTABLE_COMMAND_TYPES`, `simulator.ts:54`) reconciled FIFO.
- The full snapshot contains every player's units, explored slots (`exploredBy`), money,
  skills, and the entire map — **leaked to all clients** today. Honest play requires the
  server to build a per-player `PlayerView`.
- AI and pirates run synchronously inside the host's `Simulator` (`runAiTurn`,
  `simulator.ts:842`); nothing AI-related runs on clients. `Simulator` is pure game logic
  (imports only `game/*` and `util/random`) — it already runs headless on Cloudflare.
- The relay (`RelayCore` in `server/relay-core.mjs` and `worker/src/relay-room.ts`) is a
  stateless packet forwarder with zero game state. Games moving into Durable Objects
  removes the relay from the game path.

## Measured baseline (4 players: 2 human + 2 AI, normal map)

| Metric | Value |
|---|---|
| Map | 397 tiles, radius 11 |
| Map generation | ~2 ms |
| Full snapshot (all players) | ~103 KB start → ~107 KB mid-game |
| Redacted per-player `PlayerView` | ~5 KB early → ~40 KB late (avg ~20 KB) |
| Full 4-player turn cycle (incl. AI + pirates) | ~21 ms wall-clock |

## Architecture

```
Browser (thin client)
  │  WebSocket (direct to GameRoom DO, no relay)
  ▼
Cloudflare
  ├─ GameRoom DO (one per room code)
  │    ├─ owns headless Simulator (authoritative; runs AI + pirates)
  │    ├─ command validation + serial turn processing
  │    ├─ per-player redaction → sends PlayerView broadcasts
  │    ├─ persist state → DO transactional storage
  │    └─ on game end: POST result → Stats API
  ├─ Auth/Stats Worker (global, not per-room)
  │    ├─ register/login (email+password, PBKDF2 via WebCrypto) + OAuth
  │    ├─ verify JWT (HMAC-SHA256, secret shared with GameRoom DO)
  │    ├─ ingest game results → D1
  │    └─ leaderboards: D1 query, cached in KV
  └─ D1 (match results, per-player stats) + KV (leaderboard cache)
```

**Component split (mirrors the existing `RelayCore` pattern):**

- `RoomCore` — transport-agnostic game-room state machine (lobby → running → over).
  Testable headless, no Cloudflare APIs.
- `GameRoom` DO — thin Cloudflare wrapper: owns WebSocket connections, routes messages to
  `RoomCore`, persists snapshots.

`Simulator`, `ai.ts`, `pirates`, `discovery`, `score` remain unchanged on the server —
they are already pure and headless.

## Changes

### 1. GameRoom DO (`worker/src/game-room.ts`) — server-side authority

Everything in `NetworkController`'s host half moves into the DO. The host browser is
replaced by `RoomCore`.

**State machine inside `RoomCore`:** `lobby` (join / pickTribe / ready / start) →
`running` → `gameOver`.

**Lobby flow:** first player creates room → DO `idFromName(code)`; they are host
player index 0. Others join by code → next free human slot. Host configures AI count /
map size / mode; all humans ready → `startGame()` builds players + map (same as
`network-controller.ts:383-433`) and broadcasts the first state.

**Command pipeline** (replaces `handleClientCommand`, `network-controller.ts:190-207`):

```
onMessage(ws, { type:'command', cmd })
  → verify JWT → find player for this ws
  → check it's their turn && isHuman
  → sim.applyCommand(cmd)                      // authoritative
  → events = sim.drainEvents()
  → redact + send per-player state            // PlayerView per client
  → broadcast events batch
  → persist to ctx.storage (debounced)
  → if gameOver → POST result to Stats API, archive
```

**AI & pirates:** executed inside the sim's `doEndTurn` (`simulator.ts:842-897`) in the
DO. No client runs AI. Measured ~21 ms for a full 4-player cycle.

**No store, no renderer, no Pixi.** `RoomCore` only touches clean game modules.

**Persistence:** debounced `ctx.storage.put('state', …)` — flush at most every ~500 ms and
always on `endTurn` / `gameOver`. The existing client rejoin machinery resurrects this
server-side.

### 2. Per-player redaction (`PlayerView`) — honest-game core

On every broadcast the server builds a **view** per player — never sends the raw snapshot.

- **Tiles:** only tiles with `exploredBy.includes(playerIndex)` (matches what the client
  already renders as "explored"); drops unexplored tiles entirely.
- **Visible enemy units:** enemy units appear only on tiles the player can currently see
  (permanent exploration, no re-fog), matching today's rendered behavior.
- **Own player:** full `Player` object (money, units, stats, skills, achievements).
- **Other players:** minimal public identity only — name, tribe, ordinal, and score
  counts already shown (`rankPlayers` / score tallies). No private fields.
- **`exploredBy` arrays:** stripped from all sent tiles.
- **Terrain noise fields** (`temperature`, `rain`, `height`): stripped unless required for
  rendering.
- **`gameOver`:** server sends the per-player scores it chooses to reveal (the in-game
  scoreboard's level of disclosure).

**Sanity guarantee:** `RoomCore` produces views by deep-cloning only selected subtrees —
never passes shared references onward. Include-allowlist, not strip-everything.

Net effect (measured): ~107 KB full snapshot → ~5 KB per-player view; bandwidth per
broadcast drops ~20x.

### 3. Protocol & client changes

**Transport:** browsers connect directly to the `GameRoom` DO by WebSocket. Drop the relay
hops for games: `ws://…/room/<code>` → DO `idFromName(code)`. Rejoin by code keeps working.

**Message protocol** (`src/net/peer-session.ts`) — adjusted, not rewritten:
- `ClientMessage` gains `{ type:'auth', token }` before `join`.
- `HostMessage` (`server→client`) mostly unchanged: `lobbyUpdate`, `state` (now a
  `PlayerView`), `events`, `playersOnline`, `error`. `playerIndex` still sent.

**Client (`NetworkController`) changes:**
- **Delete** the host half: `hostGame`, `startHostGame`, `handleClientCommand`,
  `broadcastBatch`, `giveDisconnectedToAI`, `forfeitDisconnected`.
- **Keep** the client half: `joinGame(code)` authenticates (JWT) then joins the DO;
  `sendClientCommand`, `onHostMessage`, `adoptSnapshot`, optimistic prediction + FIFO
  reconciliation, rejoin — all remain.
- `netMode` becomes `'single' | 'client'`.
- Optimistic prediction stays (regional DO round-trip 10–40 ms, well under the 150 ms
  threshold the prediction system was built for).
- `NetworkHost` interface shrinks to the client-side surface only.

**Sharing code:** `src/game/*` and protocol types move to a shared package imported by both
the client bundle and the Worker bundle (the worker already does this for `RelayCore`).

### 4. Auth, stats, leaderboards (global Worker + D1)

**Auth (`/api/auth/*`):**
- `POST /register {email,password}` — PBKDF2 hashing via WebCrypto (no native deps),
  per-user salt.
- `POST /login` → JWT (HMAC-SHA256, secret via encrypted binding; same secret bound to the
  GameRoom DO so it verifies tokens without an extra hop).
- **OAuth (GitHub + Google):** PKCE/OIDC flow → profile → same JWT. Email+password and
  OAuth both yield one canonical player row.
- `GET /me` → profile (stats, games played).

**Game results (`POST /api/games`):** `GameRoom` DO POSTs a compact result at `gameOver`:
resultId, mode, mapSize, players (playerId, name, tribe, score, wins/losses, `PlayerStats`
from `score.ts`). Inserted into D1.

**Stats / profile:** derived from D1 rows; denormalized into a `players` row on insert so
`GET /me` and leaderboards are single-row reads.

**Leaderboards:**
- `GET /api/leaderboard?mode=capture&limit=50` → top scores per mode, plus `?around=me`.
- D1 query with composite index `(mode, score)`. KV-cached (TTL ~60 s).
- **Score-based only** (per user choice): best score per player per mode, ranked globally.
- Stats only recorded for JWT-authenticated players. Guests may play but results are not
  ranked.

**Challenges:** OAuth provider setup (GitHub app / Google client IDs); shared JWT secret
rotation story (two overlapping secrets); D1 is the single write contention point early on
(~100–400 results/hr at 100 games).

### 5. Disconnects, rejoin, lifecycle, error handling

**Disconnect handling** (mirrors `disconnect-handling-design.md`, now server-side):
- Player `ws` drop → room pauses with a grace window; remaining players see the overlay.
- After grace: **Give-to-AI** or **Forfeit** — semantics of
  `giveDisconnectedToAI`/`forfeitDisconnected`, owned by the DO.
- **Host player disconnect is no longer a catastrophe** — the DO is the host.

**Rejoin:** client boots → reads `active-match` → reconnects to `<code>` → sends `auth` →
DO recognizes the peer via `playerId` → rejoins at correct `playerIndex`, gets a fresh
`state` view.

**Lifecycle / GC:** persisted `state` + `roomMeta`; `getAlarm` timer TTL (idle 2 h; finished
24 h → delete). `gameOver` final state kept a day for replay/score review.

**Error handling:** malformed/unauthorized message → `{type:'error'}` to that peer only;
rejected `applyCommand` → ignore + error to sender; auth failure at join → `error` + close;
persistence failure → log, retry once, degrade to in-memory (never kill the game).
`RoomCore` serializes game mutations through a single async queue (like `enqueue` today).

### 6. Testing

**Headless `RoomCore` tests (no Cloudflare):**
- Lobby: create/join, tribe pick, ready, start-validation (port of `lobby-host.test.ts`).
- Command pipeline: auth → turn enforcement → command applies → per-player `PlayerView`
  broadcast (port of `sync.test.ts` / `client-full-flow.test.ts`).
- **Redaction leak tests (the star):** `state` sent to player 0 contains nothing owned /
  explored by player 1 — no other player's units on unexplored tiles, no `exploredBy`
  leaks, no private fields. Property-test against the renderer's "what's visible" rule.
- Disconnect: pause/grace/give-to-AI/forfeit (port of `disconnect-handling.test.ts`).
- Optimistic prediction reconciliation unchanged (`optimistic-update.test.ts`).

**DO/Worker integration tests:**
- `GameRoom` DO wiring with fake WS + `ctx.storage` mock — join/auth/command/reconnect
  (like `relay-worker.test.ts`).
- **Snipe test:** a malicious client requests a raw snapshot; assert it gets a
  `PlayerView` or an `error`, never the raw sim.

**Auth/Stats Worker tests:**
- PBKDF2 register/login, JWT issue/verify, wrong-password, duplicate email.
- D1-backed result ingest + leaderboard query + KV caching (real run with Miniflare if
  available; otherwise mocked D1 binding).

**E2E:** keep the `ws`-based harness (`server/relay.mjs`) as a local DO emulator, or swap to
`wrangler dev` for manual runs. Existing `relay-core.test.ts`, `rejoin-game.test.ts`,
`active-match.test.ts` migrate to the new `GameRoom` API.

**Simulator untouched:** its ~200 tests remain; the server runs the same module.

## Server requirements estimate — 100 simultaneous games (2 human + 2 AI each)

Assumptions: humans issue ~40 commands/turn, average human turn ~90 s, full 4-player cycle
~6 min → ~10 cycles/hr, ~800–1500 command broadcasts/hr/game.

| Resource | Per game (hr) | × 100 games | Verdict |
|---|---|---|---|
| **Network egress (server→clients)** | 15–40 MB/hr (avg ~25 MB) | ~2.0–2.5 GB/hr ⇒ ~700 KB/s avg, 3–10 MB/s peaks | Trivial for Cloudflare's edge; the only real cost lever |
| **Network ingress (clients→server)** | ~0.2–0.5 MB/hr | ~50 MB/hr | Negligible |
| **WebSocket connections** | 2 | ~200 concurrent | Cloudflare handles millions |
| **CPU** | ~8–15 s vCPU/hr (AI+pirates 0.6 s; command handling + redaction dominates) | ~1200 s vCPU/hr aggregate ≈ 0.33 core, spread across 100 separate DOs | Each DO mostly idle; far under DO limits |
| **Memory per DO** | sim + a few PlayerViews, ~5–15 MB live | < 1.5 GB total; each DO well under 128 MB cap | No concern |
| **Storage (DO)** | debounced state writes ~5–100 KB/batch → a few MB per finished game | ~500 MB–1 GB fleet-wide, GC'd by alarm | Fits; keep the TTL alarm |
| **D1 results** | 1 row per finished game | ~100–400 rows/hr | Trivial |

**Rough cost guesstimate** (hosted CF, 24/7 at 100 concurrency): DO requests ~57M/month
(~$9; free tier covers 1M), outbound egress ~4 TB/month (~$360) *if running flat-out
24/7* — in practice games are bursty, expect far less. No compute or memory scaling issue
at this size.

**Scaling lever (deferred):** egress is linear in "commands × PlayerView bytes." Delta
updates (send only changed tiles/players) are the future optimization — not needed now.

## Challenges

1. **Redaction correctness** — the new trust boundary; needs dedicated leak tests (the
   snipe test).
2. **DO CPU budget per message** (30 s limit) — never near it, but the serial command
   queue must keep work under it per WebSocket message.
3. **Shared JWT secret** between Auth Worker and GameRoom DO — plus rotation story.
4. **OAuth provider setup** (GitHub/Google) — credentials, redirect URIs.
5. **Old relay becomes dead code** for games — migration must remove it cleanly or dev
   tooling breaks.

## Deferred

- Delta-update broadcasts for bandwidth.
- Rating (ELO/TrueSkill) ladder.
- Host-reload recovery is obsolete by design (the DO is the host).