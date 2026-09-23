# Design: Road movement bonus, HP bar action indicator, and unit death animation

Date: 2026-08-28

## Overview

Three small gameplay/presentation changes to the 2D hex strategy game:

1. Units that start a turn on their own road tile get +1 movement.
2. The red "unit has actions" dot on HP bars is removed; instead, the HP text
   background is dimmed (black, alpha 0.3) for the local player's units that have
   no actions available this turn.
3. A unit death animation: 10 white circles burst from the dead unit's hex, rise
   +200px with a horizontal swing, and fade to fully transparent.

## 1. Road movement bonus

### Behavior

- A unit that starts on a tile whose `roadOwner === unit.owner` moves up to
  `moveRange + 1` tiles.
- The bonus applies to land units only. Ships (move on water, no roads) and
  pirates (never on a player's road) are unaffected.
- Enemy roads give no bonus.

### Implementation

`moveRange` in `src/game/units.ts` gains an optional tile parameter:

```
moveRange(unit: Unit, tile?: MapTile): number
```

Base range is unchanged (ships → `shipMovement`; rider that already attacked →
1; otherwise `UNIT_MOVEMENT[unit.type]`). If `tile?.roadOwner === unit.owner`,
the result is `+1`.

Call sites that already have map context pass the unit's current tile
(`tileAt(map, unit.q, unit.r)`):

- `src/controller/gameController.ts` (~line 1402, `reachableKeys`)
- `src/game/simulator.ts` (`doMove` ~line 172, and the second validation ~line 342)
- `src/game/unitActions.ts` (`unitCanAct`)
- `src/game/aiPatterns.ts` and `src/game/ai.ts` reachability calls, so the AI
  benefits too

For AI call sites that currently pass `undefined` as the range (relying on the
`reachableTargets` default of `UNIT_MOVEMENT[unit.type]`), switch them to pass
`moveRange(unit, tileAt(map, unit.q, unit.r))`. This also makes the AI correctly
apply the existing rider-attacked range rule — a small consistency improvement.

`pathBetween` is unchanged: it finds a shortest path; the `+1` only widens the
allowed range in `reachableTargets`.

### Tests

- `moveRange(unit, tile)`: +1 on own road; base on no road; base on enemy road;
  base for ships/pirates.
- `reachableTargets` with a road bonus reaches one hex further from an own-road
  start.
- Simulator accepts a `+1`-range move from an own-road start and rejects it when
  the unit does not start on its own road.

## 2. HP bar: remove red dot, dim bg instead

### Behavior

- The red circle dot (right of the HP bar) marking "unit has actions" is removed.
- The HP text label background (currently opaque black for all units) becomes
  `black, alpha 0.3` for **the local player's own units that have no actions**
  available this turn. All other units (own units with actions, enemy units)
  keep the current opaque black background.

### Implementation

In `addHpBar` in `src/render/mapRenderer.ts`:

- Delete the `canAct && unit.owner === localPlayerIndex` red dot block.
- Compute `dim = unit.owner === localPlayerIndex && !canAct` and set the label
  background fill to `{ color: 0x000000, alpha: dim ? 0.3 : 1 }`.

The existing `canAct` value (`unitCanAct(...)` for non-pirates, `false` for
pirates) is reused. The local-player check matches the previous red-dot
visibility condition.

### Tests

- `mapRenderer.test.ts`: own unit without actions → label bg alpha 0.3; own unit
  with actions → alpha 1 (existing opaque-bg test covers this case); enemy unit
  → alpha 1 regardless of its action state.
- No red "can act" dot is added to an own unit's HP bar.

## 3. Unit death animation

### Behavior

When a unit dies in combat, 10 white circles appear on the dead unit's hex and
animate up +200px with a horizontal swing, fading to fully transparent at the
top, over ~1 second. Pirate deaths are included.

### Implementation

New `spawnDeath(tile: MapTile)` private method in `src/controller/gameController.ts`,
modeled on `spawnFloatText`:

- Build a `Container` added to `mapRoot` at the tile's screen position
  (`pan + world * scale`, minus tile elevation).
- Add 10 `Graphics` circles (radius random 3–18px, fill `0xffffff`), each with a
  random initial opacity in `[0.1, 0.4]`, random horizontal offset, and a random
  swing amplitude.
- Drive with `app.ticker`: rise +200px (progress from 0→1), x offset follows
  `sin`, opacity goes from its random start to `0` by the top.
- ~1000ms duration; on completion remove the container from `mapRoot` and destroy
  it (remove the ticker callback).

Call from `presentAttack`:
- if `e.attackerDied` → `spawnDeath` on `e.attackerTile`
- if `e.targetDied` → `spawnDeath` on `e.targetTile`

Respect the same visibility rule as HP-text effects: only spawn when the tile is
explored by the local player.

### Tests

- `moveAnimation.test.ts`: presenting an `attack` event with `targetDied: true`
  spawns a death container on `mapRoot` with 10 circle Graphics; after the
  animation time elapses (rAF stepped), the container is removed and destroyed.
- No container is spawned when the death tile is not explored.

## Out of scope

- No changes to `pathBetween` / movement costs (roads do not reduce step cost).
- No new texture assets.
- The selected-unit border rendering is unchanged.
