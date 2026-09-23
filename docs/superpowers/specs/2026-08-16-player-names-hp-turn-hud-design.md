# Design: Player names, HP, turn system, and HUD

Date: 2026-08-16

## Goal

Add player names (random, unique), unit HP with a visible green bar + text, a turn system with an "End turn" button, a top-center turn/player HUD, a bottom-left selected-object info panel, and recolor unit circles to their tribe's color.

## Player names

- New file `src/game/names.ts`:
  - `ADJECTIVES` — exactly 10: `fury, glorious, tricky, silent, brave, cunning, savage, noble, ancient, wild`
  - `ANIMALS` — exactly 10: `fox, wolf, bear, hawk, lion, serpent, raven, tiger, boar, eagle`
  - `generatePlayerNames(count: number, rng: SeededRandom): string[]` — returns `count` unique names of the form `"<Adjective> <Animal>"` (capitalized), e.g. `Fury Fox`, `Glorious Wolf`. Max 3 players, so uniqueness is always satisfiable.
- `Player` in `src/game/players.ts` gains `name: string`.
- `buildPlayers(humanTribe, enemyCount, rng)` assigns unique names via `generatePlayerNames`.
- Call site `src/main.ts:20` passes a new `SeededRandom(Math.floor(Math.random() * 100000))` as the third argument.

## Unit HP

- `Unit` in `src/game/units.ts` gains `hp: number`.
- New `MAX_HP = 5` constant. Warriors start at `hp: MAX_HP`.
- New `UNIT_TYPE_NAMES: Record<UnitType, string>` — `{ warrior: 'Warrior' }`.

## Tile type names

- `src/game/tileTypes.ts` gains `TILE_TYPE_NAMES: Record<TileType, string>`:
  - Land: `Land`, Sand: `Sand`, Snow: `Snow`, ForestLand: `Forest on land`, ForestSand: `Forest on sand`, ForestSnow: `Forest on snow`, Water: `Water`, Mountain: `Mountain`, Settlement: `Settlement`.

## Turn system (`src/screens/gameScreen.ts`)

- `let turn = 1`; `let currentPlayer = players[0]` (the human; AI turns come later).
- **End turn** button (bottom-right): increments `turn`, sets `hasMoved = false` on every unit, re-renders. Selection is kept.
- Movement gating stays `unit.owner === 0 && !unit.hasMoved`, so End turn makes the human's units movable again.
- HUD top-center shows `Turn {turn} — {currentPlayer.name}`.

## HUD (HTML overlay in `index.html`)

- Top center: `#turn-info`.
- Bottom right: `#end-turn-btn` labeled "End turn".
- Bottom left: `#selected-info`. Updated on every render from `selection`:
  - terrain → name from `TILE_TYPE_NAMES`, type `terrain`, no tribe/player rows.
  - village → name `Settlement`, type `village`, plus tribe + player rows if owned; free village (owner null) omits tribe/player.
  - unit → name from `UNIT_TYPE_NAMES`, type `unit`, tribe + player rows from `players[owner]`.
  - No selection → panel hidden.
- Top-left players list now shows `{player.name} ({Tribe name})` per player.

## Rendering

- `TextureSet.unitTexture` replaced by `unitTextures: Record<Tribe, Texture>` (circles filled with `tribe.color`).
- Renderer uses `unitTextures[players[unit.owner].tribe]`; move ghost uses the same tribe-colored texture at alpha 0.5.
- HP bar per unit, always visible above the unit circle: dark background rect + green fill rect scaled to `hp / MAX_HP` + a `Text` label `{hp}/{MAX_HP}`. Rebuilt with each full map re-render.

## Tests

- `names.ts`: 10+10 lists; `generatePlayerNames` returns requested count, all unique.
- `players.ts`: `buildPlayers` assigns unique names; existing player structure tests updated for the `name` field and `rng` param.
- `units.ts`: warriors start with `hp = MAX_HP`.
- `mapGen.ts`: unit placement sets `hp` (existing unit tests updated).
- Selection/movement tests updated for the new `buildPlayers` signature (no behavior change).
