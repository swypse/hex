# Design: Water temples

Date: 2026-08-28

## Overview

Add a buildable **Water temple** building on owned water tiles. Temples start at
level 1 and grow +1 level every 2 game turns after they are built (per-temple
counter), up to level 4. They produce no income, give no building board score,
and instead award a level-based score (10/15/20/25) for each own temple at game
end.

## Building rules

- New `BuildingKind` `'temple'` (`events.ts`).
- `Building` interface gains optional `bornTurn?: number` (`mapGen.ts`).
- `canBuildTemple(map, tile, player)`:
  - requires the `waterTemples` skill,
  - `tile.ownedBy === player.index`,
  - no settlement and no building (this makes port↔temple mutually exclusive —
    both `canBuildPort` and `canBuildTemple` reject tiles with any building),
  - `isWaterType(tile.terrain)`.
- Cost: `{ wood: 0, stone: 10, money: 30, ore: 0 }`.
- Display name: `Water temple`.

## Growth (per-temple counter)

- When a temple is built, `doBuild` stamps `tile.building.bornTurn = this.turn`
  (the global turn number at build).
- At each round end (in `doEndTurn`, after `turn += 1`), for every tile whose
  building is a temple with `level < 4` and `(turn - bornTurn) >= 2` and
  `(turn - bornTurn) % 2 === 0`, increment the level and emit a new
  `templeGrown { q, r, level, playerIndex }` event.
- Example: built on turn 3 → level 2 at turn 5, level 3 at turn 7, level 4 at
  turn 9.

## Rendering

- `TextureSet` gains `templeTextures: Record<1 | 2 | 3 | 4, TileTexture>`, loaded
  from `water-temple-1.png` … `water-temple-4.png`.
- `tileSignature` includes the temple level so a growth re-renders the tile.
- `applyTile` in `mapRenderer` uses `templeTextures[tile.building.level]` for
  temple buildings.

## Scoring

- `boardScore` in `score.ts` no longer adds the generic building score (+15) to
  temple tiles; only non-temple buildings grant it.
- New `TEMPLE_SCORES = { 1: 10, 2: 15, 3: 20, 4: 25 }` and
  `awardTempleScores(map, players)` which adds each player's own-temple score to
  `player.score`.
- `checkEndConditions` calls `awardTempleScores` before computing the winner /
  calling `endGame`, so the turns30 winner reflects temple scores.

## Build action

- `toolbarSpecs` adds a "Build water temple (10s, 30m)" option when
  `canBuildTemple` passes for the selected tile.
- `HudToolbar` maps `temple: 'build.png'` so it uses the build icon.
- The AI (`ai.ts`) also offers a temple build candidate when the skill is open
  and it can afford the cost (parity).

## Events

- New `templeGrown` event in `events.ts`; the client presentation adds an
  empty case (the tile re-renders via `tileSignature`).

## Tests

- `buildings.test.ts`: `canBuildTemple` rules (skill, own water tile, no
  settlement/building, port↔temple mutual exclusion), cost, build succeeds.
- `simulator.test.ts`: building a temple stamps `bornTurn`; temples grow +1
  every 2 turns to level 4 and emit `templeGrown`.
- `score.test.ts`: temples give no +15 building score; `awardTempleScores`
  grants 10/15/20/25 by level.
- `textureFactory.test.ts` / `mapRenderer.test.ts`: temple texture selection by
  level.

## Out of scope

- No production/income from temples.
- No change to the `waterTemples` skill definition.
