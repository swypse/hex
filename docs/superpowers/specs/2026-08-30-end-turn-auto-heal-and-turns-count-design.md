# End-Turn Auto-Heal and Game-Over Turns Count

## Overview

Two small changes:

1. The game-over screen shows a global `Turns: N` line under the `Mode: ...` line.
2. When any player's turn ends (human or AI), all of that player's units that still have an
   action available and are below max HP automatically heal (+2 HP), as if they had used the
   Heal action.

## Changes

### 1. Turns count on the game-over screen (`src/ui/overlays/GameOver.ts`)

- In `mount()`, below the existing `Mode: ...` label, add a label `Turns: ${s.turn}` with the
  same style (`fontSize: 16, fill: 0xcccccc`), centered, using the shared `y` cursor so the
  icon row and buttons shift down by one line.
- `s.turn` is already in the store and reflects the turn the game ended on (30 for
  `turns30` mode, the final round for `capture` mode).

### 2. Auto-heal at turn end (`src/game/simulator.ts`)

- New private helper:

```ts
private autoHealFor(playerIndex: number): void {
  for (const t of this.map.tiles) {
    const u = t.unit;
    if (u && u.owner === playerIndex && canHeal(u)) {
      healUnit(u);
      this.emit({ type: 'healed', unitId: u.id, playerIndex });
    }
  }
}
```

- `canHeal(u)` already means "has an action available and HP is not full": not moved, not
  attacked, not healed this turn, and `hp < maxHp`. Freshly spawned units have all three
  flags set, so they are skipped, as are units that already moved/attacked/healed.
- Call it:
  - at the start of `doEndTurn()` for `this.currentPlayerIndex` — the human whose turn is
    ending, and
  - right after `this.runAiTurn(next)` inside the end-turn loop for each AI player.
- Emitting `healed` keeps the behavior consistent with the manual Heal action (the
  controller already renders `+2` HP text for `healed` events).

## Tests

- `tests/gameOver.test.ts`: assert the `Turns: N` label renders with the store's `turn`.
- `tests/simulatorTurn.test.ts`:
  - an idle damaged unit of the ending human player is healed (hp +2, `hasHealed` set) and a
    `healed` event is emitted;
  - a damaged unit that already acted (e.g. `hasAttacked: true`) is not healed;
  - a freshly spawned unit (all flags true) is not healed;
  - an AI player's idle damaged unit is healed when its turn runs during `endTurn`.

## Out of scope

- No change to the Heal action itself, its cost, or the AI planning heuristics.
- No change to score/win logic or any other HUD.
