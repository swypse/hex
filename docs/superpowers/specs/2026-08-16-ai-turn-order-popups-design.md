# Design: AI players, turn order, and popup system

Date: 2026-08-16

## Goal

Add a real turn system (human first, then AI players, round-based), simple AI behavior, per-turn HUD display, and a stacking popup/notification system.

## Turn order & rounds

- `turn` = round number. Player order is fixed: human (`players[0]`) first, then AI players in index order.
- `currentPlayerIndex` tracks who is active. HUD top-center: `Turn {turn} — {player.name}`.
- Human turn: full interaction. "End turn" commits the human's turn and starts the AI phase.
- AI phase (async, sequential over AI players):
  1. HUD shows the AI's name + resources.
  2. Popup `{name}'s turn!` with the tribe's color background.
  3. AI actions execute with 300ms gaps; the map re-renders after each action.
  4. Each AI player's turn lasts at least 5s before the next player starts.
- Human input is blocked (`aiActive` flag) during the AI phase: map clicks ignored, End turn disabled.
- After the last AI player acts: `turn++`, control returns to the human, popup `{name}'s turn!`, resources display reverts to human.

## AI logic (`src/game/ai.ts`, new — pure & testable)

```ts
type AiAction = { type: 'upgrade'; q: number; r: number } | { type: 'move'; unitId: string; q: number; r: number };
function planAiActions(map: GameMap, playerIndex: number, rng: SeededRandom): AiAction[]
```

- **Upgrade**: for each village owned by the player, with probability 0.8, upgrade if affordable (deduct cost). Emits one `upgrade` action per actually-upgraded village.
- **Move**: for each unit owned by the player with `!hasMoved`, with probability 0.9: pick a random reachable tile (`reachableTargets`) and emit a `move` action.
- Plan order: all upgrades first, then all moves.
- `gameScreen.ts` executes the plan sequentially: apply each action, wait 300ms, re-render.

## Popup system (`src/ui/popups.ts`, new)

- Persistent stack container `#popup-stack` (top-left); hidden when empty.
- `showPopup(text: string, opts?: { background?: string; color?: string }): void`:
  - Default background black; turn/upgrade popups pass the tribe color.
  - Each popup has a per-popup ✕ close button.
  - Popup is active 300ms, then fades out. Clicking it (or its ✕) fades immediately. On fade, the popup is removed from the DOM.
  - Newest popup at top of the stack; older ones pushed down.

## HUD wiring

- `#turn-info`: `Turn {turn} — {currentPlayer.name}`.
- `#resources-info`: current player's resources (human during human turn, AI during its turn).
- Popups:
  - Any turn start: `{name}'s turn!` (tribe color).
  - Village upgrade: `{name}'s village upgraded to level N` (tribe color).

## Tests

- `ai.ts` with seeded `SeededRandom`:
  - Upgrade decisions: affordable villages upgraded at rate ~0.8 (deterministic with a seed); unaffordable skipped.
  - Move decisions: only unmoved units considered; moves land on reachable targets; probability ~0.9.
  - Plan order: upgrades precede moves.
- Popup system: manual DOM verification.
