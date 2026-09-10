# Highlight End-Turn Button When No Actions Are Available

Date: 2026-09-10

## Goal

When the local player has **no action available anywhere this turn**, highlight
the End Turn button with an orange pulsing stroke so they know to end the turn.
The highlight must use the same ring/pulse style as the tutorial action-button
highlight.

"Available action" is a **comprehensive** check over all seven action families
regardless of the current selection: a pulse appears only when truly nothing can
be done anywhere.

## Definitions

`hasAnyAvailableAction(map, player, turn)` returns `true` when at least one of
the following is possible. Empty maps or a null player return `false`.

1. **Unit actions** — an own unit with:
   - `canMove(unit)` and at least one reachable tile
     (`reachableTargets(map, unit, range, canClimb, canDock, playerIndex)
     .length > 0`, using the same skill flags as the map render: `canClimb =
     hasSkill(player, 'climbing')`, `canDock = hasSkill(player,
     'navigation')`), or
   - `canAttack(unit)` and at least one attackable enemy
     (`attackableTargets(map, unit, playerIndex).length > 0`), or
   - `canHeal(unit)`.

2. **Spawn** — an owned village tile with: no unit on the tile,
   `unitsInVillage(map, tile) < villageCapacity(level)`, and
   `resources.money >= cheapest unit price`. The cheapest price is computed the
   same way as the toolbar: `Math.min(...Object.values(UNIT_TYPES).filter(t =>
   t.price > 0).map(t => t.price))`.

3. **Skill open** — `canOpenSkill(player, id)` is true for any skill id
   (already respects parent prerequisites and money).

4. **Village capture** — any non-owned village with `captureReady === true` and
   an own unit standing on it (owner `null` counts: a free village is
   capturable).

5. **Bonus** — any tile in `bonusEligibleFor(map, player.index, turn)`.

6. **Village upgrade** — any owned village where
   `canAfford(player.resources, villageUpgradeCost(level))`. There is no village
   level cap.

7. **Builds** — any tile where any of the following is true **and** the build is
   affordable:
   - `canBuildSawmill` / `canBuildMine` / `canBuildPort` / `canBuildTemple` /
     `canBuildForestTemple` + `canAfford(BUILDING_COSTS[kind])`
   - `canBuildRoad` (includes affordability itself)
   - `canBuildBridge` + `canAfford(BRIDGE_COST)` (`canBuildBridge` does not
     check affordability)
   - `canBuildWall` (includes affordability itself)

   These functions already bundle the required skill, ownership, terrain,
   building-slot and unit/building-emptiness conditions.

## Approach

Single pure helper function in a new module `src/game/playerActions.ts`,
consumed by the toolbar. Iterates the map once per category and short-circuits
as soon as any action is found. No coupling to the store or controller beyond
the pure game types (`GameMap`, `Player`).

## Files

### New: `src/game/playerActions.ts`

- `export function hasAnyAvailableAction(map: GameMap, player: Player, turn: number): boolean`
  implementing the seven checks above.
- Imports from `units` (`canMove`, `canAttack`, `canHeal`, `UNIT_TYPES`),
  `selection` (`reachableTargets`), `combat` (`attackableTargets`), `village`
  (`unitsInVillage`, `villageCapacity`, `canBuildWall`), `resources`
  (`canAfford`, `villageUpgradeCost`), `skills` (`hasSkill`, `canOpenSkill`,
  `SKILLS`), `buildings` (build builders + `BUILDING_COSTS`), `roads`
  (`canBuildRoad`), `bridges` (`canBuildBridge`, `BRIDGE_COST`), `bonus`
  (`bonusEligibleFor`), `explore` (for `isExploredFor` if needed by reachable
  filtering — `reachableTargets` already filters explored internally).

### Edit: `src/ui/hud/HudToolbar.ts`

In `update()`, after building the End Turn button, add:

```
const noActions = !store.aiActive && !store.gameOver && !store.paused &&
  !store.tutorial && !hasAnyAvailableAction(map, human, store.turn);
if (noActions && store.tutorialHighlightEndTurn) → tutorial wins (skip)
```

When `noActions` is true, draw the **existing** pulsing ring on the end-turn
button via the existing `startEndTurnPulse()` (the same ring the tutorial uses for
the action-button highlight: `0xffd700` gold, width 4, radius
`24 + 2·|sin(phase·2π)|`, 900ms period). It is added to `endTurnRow`, so no new
visual code is needed.

Guard against double-highlight: if the tutorial is already pulsing the End Turn
button (`tutorialHighlightEndTurn`), do not add the no-actions ring as well.

Note: the toolbar only mounts in-game (`screen === 'game'`), which is the only
place this highlight makes sense. When there can be no action (e.g., a fresh
turn where the player is mid-AI turn), `store.aiActive` gate prevents it.

### Tests

New file `tests/playerActions.test.ts` using `makeTestMap` + `buildPlayers`:

- True cases: one per family (unit move, unit attack, unit heal, spawn, skill
  open, capture, bonus, village upgrade, each build kind) — each set up on an
  otherwise-empty map returns `true`.
- False cases: an empty owning player with no units/villages/skills/buildables
  and no money returns `false`; spending every resource and parking all units
  (all `hasMoved`/`hasAttacked`/`hasHealed`) returns `false`.
- Exhaustion case: map with money but all villages already at a full spawn
  capacity, all built-out, all units exhausted → `false`.

`tests/hudScore.test.ts`-style host mock is NOT needed here since
`hasAnyAvailableAction` is pure.

Existing `tests/toolbarSpecs.test.ts` asserts toolbar contents; add a case (or a
small `tests/hudToolbar.test.ts` if none exists — check for one) that the
end-turn ring appears when `hasAnyAvailableAction` is false and is absent when
true. If no toolbar widget test file exists, extend `toolbarSpecs.test.ts` with
a direct call to the helper instead to keep the change minimal.

## Verification

- `npm test` — all suites pass, including the new `playerActions` suite.
- `npm run typecheck` — clean.
- `npm run build` — succeeds.
- Manual: start a game, spend the entire turn (move/attack all units, empty
  money, no affordable builds on the selected tiles anywhere), confirm the End
  Turn button pulses orange; take any available action and confirm it stops.

## Out of scope

- No change to the tutorial pulse behaviour.
- No change to end-turn button colour (the `LAST_TURN_COLOR` logic stays).
- No change to how actions are performed.