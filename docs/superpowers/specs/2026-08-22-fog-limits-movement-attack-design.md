# Fog Limits on Movement and Attack Design

Date: 2026-08-22

## Problem

A unit can currently move into an unexplored (fog) cell and attack an enemy unit whose cell
is still unexplored. The fog of war should limit both:

1. A unit cannot move into an unexplored cell (and cannot move *through* one to reach a
   discovered cell beyond it).
2. A unit cannot attack an enemy standing on an unexplored cell, until that cell is
   discovered.

This applies to all players (human and AI) using the existing per-player `exploredBy` fog
model.

## Design

### 1. Movement restrictions (`src/game/selection.ts`)

Add a `playerIndex: number` parameter to `reachableTargets` and `pathBetween`:

```ts
export function reachableTargets(
  map: GameMap,
  unit: Unit,
  range = UNIT_MOVEMENT[unit.type],
  canClimb = false,
  canDock = false,
  playerIndex = 0,
): MapTile[]
```

```ts
export function pathBetween(
  map: GameMap,
  from: Axial,
  to: Axial,
  canClimb = false,
  canSail = false,
  canDock = false,
  playerIndex = 0,
): Axial[]
```

- `reachableTargets`: add `if (!isExploredFor(t, playerIndex)) return false;` to the
  candidate filter.
- `pathBetween`: add `if (!isExploredFor(tile, playerIndex)) continue;` so paths cannot
  pass through fog.
- The candidate path check inside `reachableTargets` (`pathBetween(map, from, t, ...)`)
  passes `playerIndex` through.

`isExploredFor` is already imported in this file? No — `selection.ts` does not import it.
Add `import { isExploredFor } from './explore';`.

### 2. Attack restriction (`src/game/combat.ts`)

Add a `playerIndex: number` parameter to `attackableTargets`:

```ts
export function attackableTargets(map: GameMap, unit: Unit, playerIndex = 0): MapTile[]
```

Add to the filter:

```ts
if (!isExploredFor(t, playerIndex)) return false;
```

Add `import { isExploredFor } from './explore';`.

### 3. Thread `playerIndex` through all callers

- `src/game/simulator.ts` — `doMove` (line 171), `doShipLanding` (line 337), `doAttack`
  (line 190): pass `unit.owner` (the acting player is the unit's owner).
- `src/controller/gameController.ts` — reachable (line 1344) and attackable (line 1347)
  highlight computation: pass `store.localPlayerIndex`.
- `src/game/ai.ts` — `greedyMoveTarget` (line 58) and `randomAvailableAction` (line 105):
  pass `unit.owner` (or the `player` in scope).
- `src/game/aiPatterns.ts` — lines 76, 84, 130, 163: pass `unit.owner`.
- `src/game/unitActions.ts` — `unitCanAct` (lines 12-13): pass `player.index`.

Because the fog model is per-player and AI units explore as they move, the AI is naturally
bound by its own fog.

## Files touched

- `src/game/selection.ts`
- `src/game/combat.ts`
- `src/game/simulator.ts`
- `src/controller/gameController.ts`
- `src/game/ai.ts`
- `src/game/aiPatterns.ts`
- `src/game/unitActions.ts`
- `tests/selection.test.ts`, `tests/combat.test.ts`, `tests/simulatorTurn.test.ts`

## Testing

- `reachableTargets` excludes unexplored tiles; `pathBetween` cannot cross unexplored tiles.
- `attackableTargets` excludes enemies on unexplored tiles.
- New tests in `selection.test.ts` / `combat.test.ts` with `exploredBy` populated for the
  actor.
- Existing suite + typecheck pass.
