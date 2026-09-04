# Tribe Discovery + Tribe Starting Features

## Overview

Enemy tribes are unknown to the player until the first unit of that tribe appears on a
tile the player has explored. Unknown tribes render in gray; the moment a tribe is
discovered its borders turn to its tribe color and a "You meet {TribeName}!" notification
appears. The stats screen shows "Unknown tribe" for undiscovered tribes. Each tribe also
gets a distinct starting bonus.

## Changes

### 1. Discovery state (derived)

New module `src/game/discovery.ts`:

- `knownTribesFor(map: GameMap, players: Player[], playerIndex: number): Set<Tribe>`
  - Always includes the local player's own tribe (`players[playerIndex].tribe`).
  - Includes the tribe of every unit standing on a tile explored by `playerIndex`
    (`isExploredFor(tile, playerIndex)`), skipping pirates (unit owner `-1`).

This is a pure derivation from the map's `exploredBy` per-player data, so it needs no new
synced state, works identically for host and clients, and survives save/load.

### 2. Rendering (`src/render/mapRenderer.ts`, `src/render/tileSignature.ts`)

- `drawTileTerritory` (territory border) fills with `tribe.color` when the owner's tribe is
  known, `0x888888` (gray) when unknown.
- `addVillageLabel` name-pill background (`labelBg`) uses the same rule.
- `tileSignature` gains a known-ness component for the tile's owner (`k`/`u`/`-`) so cached
  tile views refresh to the tribe color the moment discovery happens.

### 3. Stats screen (`src/ui/overlays/GameStats.ts`)

- For each player row: if the tribe is known, show `tribe.name` in `tribe.color`; otherwise
  show `Unknown tribe` in gray (`0x888888`).

### 4. Discovery notification (`src/controller/gameController.ts`)

- New private field `knownTribeIds = new Set<Tribe>()` (tribe ids known to the local player).
- New method `updateKnownTribes()`: derive the current known set for
  `store.localPlayerIndex`, diff against `knownTribeIds`, and for each newly discovered tribe
  show `You meet {TribeName}!` via `setCenterMessage`, chaining sequentially (~1s each);
  then update the field.
- Called at the end of `presentEvents` (after moved units are revealed) and on snapshot
  adoption. Initialized silently (no notification) at game start, snapshot adoption, and load
  so a fresh game or a reload never re-announces an already-known tribe.

### 5. Tribe starting features (`src/game/tribes.ts`, `src/game/players.ts`)

- `TribeInfo` gains optional fields:
  - `startMoneyBonus?: number` — Villagers: `10`.
  - `startSkill?: SkillId` — Barbarians: `climbing`, Cats: `shields`, Warriors: `swordsman`,
    Forest people: `forestry`, Aqua people: `navigation`.
- `players.ts` applies them in both `buildPlayers` and `buildMultiplayerPlayers` (all players
  of that tribe, human or AI):
  - Villagers start with `money: 15` instead of `5`.
  - The tribe's `startSkill` is pre-opened (present in `player.skills`). No +15 action score is
    awarded, and parent skills are NOT auto-opened (e.g. Warriors get Swordsman but not
    Climbing).

### 6. Tests

- New `tests/discovery.test.ts`: `knownTribesFor` returns own tribe always; discovers a tribe
  whose unit is on an explored tile; ignores units on unexplored tiles; ignores pirates; no
  false discovery for another player's exploration.
- `tests/mapRenderer.test.ts` / `tests/tileSignature.test.ts`: unknown-owner territory border
  renders gray and switches to the tribe color when known; the tile signature changes on
  discovery.
- `tests/players.test.ts`: Villagers start with 15 money; each skill-starting tribe has its
  skill pre-opened; applies to AI players too; starting skill does not affect score.
- `tests/gameStats.test.ts` (new or existing): an unknown tribe's row reads "Unknown tribe".

## Out of scope

- No changes to unit hp-bar colors (a unit's appearance IS the discovery, so the tribe is
  already known when its unit is rendered).
- No per-tribe AI behavior changes.
- No skill-tree changes (parents of starting skills stay locked).
