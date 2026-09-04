# Design: Unit actions (heal/collect), action order, balance, move animation, red-border highlighting

Date: 2026-08-17

## Goal

Rework the unit turn into a rule-based action system: heal, move→attack, attack→rider-move-1, collect resources (no double income), animated cell-by-cell movement, red-border highlighting (no glows), plus balance changes (archer range, spawn cost).

## Background

- `Unit` currently has a single `hasMoved` flag; `performAttack` sets `hasMoved` on both attacker and target; `reachableTargets`/`attackableTargets` are gated in the controller by `!unit.hasMoved`.
- `collectTerrainIncome` (capture.ts) counts owned forest→wood, mountain→stone per round.
- Highlighting uses glow sprites for selection/attackable and ghost previews for reachable tiles.
- Prices/range live in `UNIT_TYPES` (units.ts); `units.test.ts` asserts exact values.

## Design

### 1. Unit action model

Add required fields to `Unit`: `hasAttacked: boolean`, `hasHealed: boolean`, `hasCollected: boolean` (alongside `hasMoved`). Add pure helpers to `units.ts`:

- `HEAL_AMOUNT = 2`
- `canMove(unit)`: `!hasMoved && !hasHealed && !hasCollected && (type === 'rider' || !hasAttacked)`
- `moveRange(unit)`: `1` if `hasAttacked && type === 'rider'`, else `UNIT_MOVEMENT[type]`
- `canAttack(unit)`: `!hasAttacked && !hasHealed && !hasCollected`
- `canHeal(unit)`: first action only and `hp < maxHp`
- `canCollect(unit)`: first action only (`!hasMoved && !hasAttacked && !hasHealed && !hasCollected`)
- `healUnit(unit)`: `hp = min(maxHp, hp + 2)`, sets `hasHealed = true`

Round end resets all four flags for every unit (controller `runAiPhase`).

### 2. Combat and balance

- `performAttack`: set `attacker.hasAttacked = true` (not `hasMoved`); do **not** touch the target's flags (attacked units keep their move).
- `UNIT_TYPES`: archer `attackDistance` 3 → 2; prices warrior 2 → 4, rider 3 → 6, archer 3 → 6.

### 3. Heal and Collect actions (toolbar)

`ActionToolbar` renders for a selected unit owned by player 0: **Heal +2 HP** (disabled unless `canHeal(unit)`) and **Collect resources** (disabled unless `canCollect(unit)` and the tile yields something). Village buttons unchanged.

Controller methods `healSelectedUnit()` and `collectSelectedUnitResources()` guard: no AI turn, selection is a player-0 unit, action allowed. Heal applies `healUnit`. Collect applies `collectTileResource` and refreshes players in the store (so counters animate).

### 4. Collect resources (no double income)

- `MapTile` gains optional `resourceCollected?: boolean`.
- `capture.ts`:
  - `tileResourceYield(tile): { wood; stone }` — 1 wood for any forest terrain, 1 stone for Mountain, else `{0,0}`.
  - `collectTerrainIncome` skips tiles with `resourceCollected`.
  - `collectTileResource(map, unit, player): { wood; stone }` — yields `tileResourceYield` of the unit's current cell (any tile, including enemy territory), adds wood/stone to `player.resources`, sets `tile.resourceCollected = true` and `unit.hasCollected = true`.
- Round end clears `resourceCollected` on all tiles (controller `runAiPhase`), so a tile pays at most once per turn.

### 5. Cell-by-cell move animation

- `selection.ts`: `reachableTargets(map, unit, range = UNIT_MOVEMENT[unit.type])` (range param added) and `pathBetween(map, from, to): Axial[]` — BFS over non-water, unoccupied tiles; returns steps excluding the start (empty if unreachable).
- Controller `animateUnitMove(unit, target)`: compute path; temporarily clear the unit from its source and the selection, render; slide a temporary unit sprite (unit texture, `spriteScale`) from source pixel through each path cell (~140 ms per step via a small tween); commit `moveUnit` and render. Used for human moves (in `handleMapClick`) and AI moves (in `runAiPhase`).

### 6. Red-border highlighting

- `hex.ts`: `hexCorners(h, hexSize): { x; y }[]` (6 corners).
- `mapRenderer.ts`: remove selection glow, reachable ghost previews, attackable glow; draw a red 4px hex border (`0xff0000`) on every highlighted tile (selected, reachable, attackable).
- `textureFactory.ts`: remove glow texture generation and the `GlowTextures`/`glowTextures` members from `TextureSet`.

## Files touched

- `src/game/units.ts` — new flags, action helpers, balance values.
- `src/game/combat.ts` — `hasAttacked`, no target stun.
- `src/game/selection.ts` — `reachableTargets` range param, `pathBetween`.
- `src/game/hex.ts` — `hexCorners`.
- `src/game/capture.ts` — `tileResourceYield`, skip-collected income, `collectTileResource`.
- `src/game/mapGen.ts`, `src/game/spawn.ts` — create units with the new flags.
- `src/controller/gameController.ts` — action gating, heal/collect handlers, round-end flag resets, `animateUnitMove`, AI move animation.
- `src/screens/hud/ActionToolbar.tsx` — Heal / Collect buttons for selected units.
- `src/render/mapRenderer.ts`, `src/render/textureFactory.ts` — red borders, remove glows.
- Tests: `units.test.ts`, `combat.test.ts`, `selection.test.ts`, `capture.test.ts`, `hex.test.ts`, and Unit-literal fixtures across test files gain the new flags.

## Testing

- `canMove`/`canAttack`/`canHeal`/`canCollect`/`healUnit` and updated prices/range (units).
- `performAttack` sets `hasAttacked`, does not stun the target (combat).
- `reachableTargets` with range param, `pathBetween` (selection).
- `tileResourceYield`, `collectTerrainIncome` skipping collected tiles, `collectTileResource` (capture).
- `hexCorners` (hex).
- Manual (`npm run dev`): heal/collect buttons, move→attack, rider attack→move-1, cell-by-cell move animation, red borders instead of glows, no double wood/stone income.
