# Optimistic Updates for Non-Host Players

Date: 2026-09-06

## Goal

Remove the perceived latency between a client (non-host) player issuing an action and
seeing it on the map. Deterministic actions should apply instantly on the acting
client; the authoritative host result reconciles silently afterwards.

## Decision

Optimistic local application **only for deterministic commands** (Approach 1:
predict, commit locally, skip duplicate replay). Random/AI-dependent commands
(`attack`, `claimBonus`, `endTurn`) remain server-confirmed exactly as today.

No relay/protocol changes. No RNG sync. Reconciliation relies on command/reply
FIFO ordering, which holds because a single player acts at a time and the relay
preserves per-sender message order.

## Background

- A client keeps a full `Simulator` mirror rebuilt wholesale from authoritative
  snapshots (`Simulator.fromSnapshot`). It is never mutated locally today; the map
  only changes when the host's `state` + `events` arrive.
- Host → client: after each command the host broadcasts the full authoritative
  snapshot (personalized per client) plus the presentation `events` for that batch.
- The client `Simulator` is deterministic for a set of commands (no `this.rng`
  reads): `move`, `capture`, `spawn`, `build*`, `upgradeVillage`, `upgradeShip`,
  `openSkill`, `heal`, `shipLanding`.
- `attack`, `claimBonus`, and `endTurn` (AI/pirate phases) consume host `Math.random`
  state that is neither seeded nor part of the snapshot, so the client cannot predict
  them identically.
- The client and host already present events through the same serialized
  `taskQueue`/`EventPresenter`, which animates on top of an already-updated mirror.

## Flow (client side)

### Sending a deterministic command

In `gameController` client mode (`netMode === 'client'`), when the local player is
the current player and not `aiActive`, and the command type is in the deterministic
set:

1. Capture `preExplored = exploredKeysFor(localPlayerIndex)` (for fog-reveal FX).
2. `predicted = Simulator.fromSnapshot(this.sim.snapshot())`;
   `ok = predicted.applyCommand(cmd)`.
3. If `ok`:
   - Adopt `predicted` as the live mirror; `syncStore()` so resources/spawns show
     instantly.
   - Record one in-flight predicted command on the network layer.
   - Send the command to the host via the existing client path.
   - Drain `predicted` events and present them through the existing
     `presentEvents` animator (same code path the host uses).
4. If `!ok`, fall back to today's behavior (plain send, no local change).
5. If the presenter/app is not ready yet, fall back to the plain path.

### Reconciling with the authoritative reply

In `networkController.onHostMessage`:

- A `state` message that arrives while a prediction is in flight corresponds (FIFO)
  to one predicted command: consume one prediction and set a "skip next events"
  flag. `adoptSnapshot` still runs, replacing the mirror with the authoritative
  state. Because the command was deterministic, the state is identical — no visual
  change.
- The following `events` message is then skipped (not re-animated). If the host
  rejected the command, there are no events and the authoritative adopt reverts the
  optimistic mirror without animation (rare, acceptable).
- Non-predicted replies (attack/endTurn/other turns) present exactly as today.

Optimistic presentation and authoritative adopt both run on the serialized
`taskQueue`, so an in-progress local animation always finishes before the mirror is
swapped.

## Scope

Predicted command types: `move`, `capture`, `spawn`, `build`, `buildWall`,
`buildRoad`, `buildBridge`, `upgradeVillage`, `upgradeShip`, `openSkill`, `heal`,
`shipLanding`.

Server-confirmed (unchanged): `attack`, `claimBonus`, `endTurn`.

## Error handling

- Rejected/expired commands: reconciled by the authoritative snapshot; no special
  handling required.
- Races (e.g., stale selection): prediction `ok=false` → plain path.
- Out-of-order/duplicate replies are prevented by the single acting player + FIFO
  relay ordering; no extra correlation id needed.

## Testing

- New `optimisticUpdate.test.ts` using the existing client-flow harness:
  - Issue a deterministic `move` on a client; assert the unit state moves
    immediately and predicted events are presented.
  - Feed the matching authoritative `state` + `events`; assert events are not
    double-presented and the mirror equals authority.
- Determinism guard: applying each deterministic command on a host sim and on a
  fresh `fromSnapshot` mirror produces identical events/state (justifies skipping
  replay).
- Existing suites (`npm test`), `npm run typecheck`, `npm run build` stay green.

## Out of scope

- Optimistic prediction of `attack`, `claimBonus`, `endTurn`.
- RNG state in snapshots / lockstep determinism.
- Any relay protocol changes.
- Reconnect/resync (handled separately).
