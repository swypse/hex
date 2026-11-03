# Village Baked Texture: 90px Blocks + New Column Layout Design

## Goal

Redesign the baked composite village texture: blocks become 90×90 px (heart of the whole
look), each village now has a single 5-tile set (`t1.png` + `m1..m4.png`, no more left/right
variants), and the columns sit at new positions with a new draw order. The packer, the
geometry constants, and the layout table all update to match; block-count-per-level rules,
random m-variant recording, anchoring, and the baking/caching pipeline stay untouched.

## Background / current behavior

- Source tiles: `src/assets/village-<tribe>/` previously held 10 files per tribe
  (`<tribe>-{l,r}-m1..m4.png` + `-t1.png`) at 70×52. They are **already replaced** by 5
  bare-named files (`m1.png` … `m4.png`, `t1.png`) at **90×90** in every tribe dir.
- `tools/packVillageTribes.mjs` auto-detects the source file list and cell size (reads the
  first PNG), so a rerun packs the new tiles; manifest frame keys become the bare base names
  (`'m1'`, …, `'t1'`). Constants are still written as 70×52 in the `.mjs` comments and the
  generated `village-*-atlas-data.gen.ts` (CELL_W/H) until regenerated.
- `src/render/village-build-texture.ts` implements the composite with
  `VILLAGE_BUILD_BLOCK_W/H` (70×52), `VILLAGE_BUILD_BLOCK_STEP = 27`, a `COLUMN_LAYOUT`
  table (8 columns × `{side, column, texSide, x, y}`), `texSide`-based frame keys
  (`${prefix}-${texSide}-t1|m<1..4>`), and `VillageBuildTextureService` baking in draw
  order (`sprite.zIndex = i`).
- `upgradeVillage` (`src/game/village.ts`) already records random per-column `m1..m4`
  variants into `Settlement.build`; the renderer resolves below-top blocks through
  `variantAt` with `'m1'` fallback for missing data (older saves).

## Architecture

No new components. Three coordinated edits:

- **Packer** (`tools/packVillageTribes.mjs`): cosmetic — update stale 70×52 comments, set
  `cols: 5` (5 tiles → one 450×90 row), then rerun all seven `pack:village-*` scripts to
  regenerate `public/textures/village-<tribe>-atlas.png` (450×90) and the
  `village-<tribe>-atlas-data.gen.ts` manifests (CELL_W/H = 90, frames `'m1'..'m4'`, `'t1'`).
- **Geometry** (`src/render/village-build-texture.ts`): new block size/step, new
  `ColumnLayout` (no `texSide`), bare frame keys (`'t1'` / `'m1'..'m4'`), `prefix` removed
  from `villageBuildFrames`.
- **Tests**: updated expectations in `village-build-texture.test.ts`,
  `village-build-atlas.test.ts` and the seven `pack-village-*.test.mjs`.

## Changes

### 1. Block geometry — `src/render/village-build-texture.ts`

- `VILLAGE_BUILD_BLOCK_W = 90`, `VILLAGE_BUILD_BLOCK_H = 90`.
- `VILLAGE_BUILD_BLOCK_STEP = 28` (90 − 62 px vertical overlap: stacked blocks
  overlap by 62px).
- Composite width follows from the layout table (`maxX + BLOCK_W − minX`): **190**.
- `villageBuildHeight`/`villageBuildAnchorY` formulas unchanged; ground offset recomputes
  from the new level-1 height (`130`).

### 2. Column layout — new positions + draw order

Draw order back→front (bottom z first), mapping to the existing `SettlementBuild` sides:

| # | Column | Side | x | y |
|---|---|---|---|---|
| 1 | back-left 2 | `lBack[1]` | 50 | −20 |
| 2 | back-right 1 | `rBack[0]` | 75 | −10 |
| 3 | right 2 | `r[1]` | 100 | 0 |
| 4 | right 1 | `r[0]` | 75 | 10 |
| 5 | back-left 1 | `lBack[0]` | 25 | −10 |
| 6 | left 1 | `l[0]` | 0 | 0 |
| 7 | left 2 | `l[1]` | 25 | 10 |
| 8 | left 3 | `l[2]` | 50 | 20 |

This is the user-specified front-to-back order (`left 3, left 2, left 1, back-left 1,
back-left 2, right-1, right-2, back-right 1`) reversed for the existing back→front table
convention, except back-left 2 renders below back-right 1 (drawn first). Within each
column, blocks emit **bottom block first** (zIndex ascending), so the upper block always
covers the one below.

- `ColumnLayout` drops `texSide`; frames carry `{ side, column, x, y }`.
- `villageBuildFrames(level, build?)`: `frameKey = i === 0 ? 't1' : variantAt(build, side,
  column, i - 1)` (variant ∈ `m1..m4`, fallback `'m1'`). The `prefix` parameter is removed —
  the tribe atlas is already pinned by the calling service, and atlas frame keys are now
  tribe-agnostic.
- `VillageBuildTextureService` no longer passes a `prefix` into `villageBuildFrames`; it still
  resolves textures through its own tribe loader. `villageBuildSignature` unchanged.
- Fix the stale `SettlementBuild` doc comment in `src/game/map-gen.ts` (currently claims
  `r[0..3]`/`lBack[0..2]`; reality is `r[0..1]`, `lBack[0..1]`, `rBack[0]`).

### 3. Atlas packer — `tools/packVillageTribes.mjs`

- Update header comments: 90×90, 5 tiles per tribe, single row at `cols: 5`.
- `TRIBE_CONFIGS[*].cols = 5` for all seven tribes.
- Rerun `npm run pack:village-villagers|warriors|cats|aqua|forest|sand|barbarians`; commit the
  regenerated `public/textures/village-<tribe>-atlas.png` (450×90) files and
  `src/game/village-<tribe>-atlas-data.gen.ts` manifests (CELL_W/H = 90, 5 frames each).

### 4. Tests

- `tests/village-build-texture.test.ts` — rewrite `villageBuildFrames` expectations: new
  widths (`190`) / heights (level 1 = 130), new frame x/y/order, bare frame keys
  (`'t1'`, `'m1'`…`'m4'`), `VILLAGE_BUILD_BLOCK_STEP = 28`. Drop the `prefix`-specific
  warriors/cats cases; keep a variants + `'m1'`-fallback + no-build cases.
- `tests/village-build-atlas.test.ts` — slice test looks up `'t1'` (was `'villagers-l-t1'`);
  CELL_W/H assertions use the regenerated constants.
- `tests/pack-village-<tribe>.test.mjs` (7) — `CELL_W = CELL_H = 90`; replace the
  "ships all ten l/r m/t variants" check with one asserting the five bare tiles
  (`m1..m4`, `t1`) are covered; committed-atlas-in-sync + dimension assertions carry over.
- `tests/village-build.test.ts` — unchanged (block-count rules untouched).

## Error handling

- Missing variant data falls back to `'m1'` exactly as today; a failed/missing atlas frame
  still makes the composite return `null` so the static village texture renders.

## Non-goals

- No changes to per-level block counts (`village-build.ts`), the random m-variant recording
  (`village.ts`), the baking/caching/ref-counting pipeline, anchoring math, or the
  `TextureSet`/`villageTextureFor` wiring.
- No asset art changes — the 90×90 PNGs are already in place.