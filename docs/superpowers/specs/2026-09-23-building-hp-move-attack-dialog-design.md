# Building HP info + catapult move-or-attack dialog

## Problem

1. The selected-hex info block (`hud-selected.ts`) shows a building's name, level,
   and yield, but never its HP. Buildings are siegeable (2 HP, catapult deals 1),
   so a damaged `1/2` mine is indistinguishable from a pristine one.
2. When a catapult has a reachable building/village siege target on an adjacent
   cell, the click always fires the attack (game-controller.ts `handleMapClick`
   checks `attackableKeys` before `reachableKeys`). The player can never choose to
   move onto the cell instead.

## Decision

- Add building HP to the selected-hex info block, always displayed as `hp/2`
  (matches how units always show `hp/maxHp`), rendered as the building heading
  row with the hp icon + value.
- When a clicked tile is both attackable and reachable (catapult adjacent to an
  enemy building/village), show a "Move or attack?" dialog with Move / Attack /
  Cancel. Attack-only and move-only tiles behave exactly as today.

## Implementation

### Building HP (`src/ui/hud/hud-selected.ts`)

- Render the building heading as a composite icon row (extending the existing
  unit/settlement icon-row mechanism):
  - `buildingRow = { name: '{name} (level {level})', pairs: [{ icon: '16/hp-16.png', value: '{hp}/2' }] }`
  - `hp = buildingHp(tile.building)`, `max = BUILDING_MAX_HP` (from `buildings.ts`).
- The building line keeps its `buildingHelp` (?) button and `buildingLineIndex`.

### Move-or-attack dialog

- Store (`src/store/game-store.ts`): new overlay state
  `{ kind: 'moveAttack'; target: { q: number; r: number } }`.
- Controller (`src/controller/game-controller.ts`):
  - `handleMapClick`: before the immediate-attack branch, if the tile is in both
    `attackableKeys` and `reachableKeys`, `setOverlay({ kind: 'moveAttack', target })`
    and return.
  - `chooseMoveFromDialog()`: reads overlay target, sends `{ type: 'move' }`,
    updates the selection to the target tile.
  - `chooseAttackFromDialog()`: reads overlay target, clears selection, sends
    `{ type: 'attack' }` (siege resolves the structure).
  - `cancelMoveAttack()`: clears the overlay.
- Dialog (`src/ui/overlays/move-attack-dialog.ts`, modeled on
  `ship-landing-dialog.ts`): popup titled "Move or attack?" with Move / Attack /
  Cancel buttons and a hint line.
- Overlay manager (`src/ui/overlays/overlay-manager.ts`): register a `moveattack`
  entry and the `moveAttack` case.
- i18n (`src/i18n/locales/en.ts`, `ru.ts`): `moveAttack.title`, `moveAttack.hint`,
  `moveAttack.move`, `moveAttack.attack`.

## Testing

- Building HP: `hud-selected.test.ts` asserts `2/2` for a pristine building and
  `1/2` for a damaged one.
- Dialog: new tests in `tests/catapult-move-attack.test.ts`:
  - catapult + adjacent enemy building: click opens the `moveAttack` overlay and
    sends no command.
  - Move button sends `{ type: 'move' }`; Attack button sends `{ type: 'attack' }`;
    Cancel clears the overlay.
  - An attackable-but-not-reachable target still attacks immediately (existing
    behavior).
- Full suite + typecheck.

## Success criteria

- Pristine and damaged buildings are visually distinguishable in the info block.
- A catapult can choose to march onto an adjacent building/village tile or shell it.