# 16px Icons Atlas Design

Date: 2026-09-12

## Goal

Pack the seven 16×16 icons in `src/assets/16/` into one row-atlas
(`icons-16-atlas.png`), render the selected-cell unit stat row and the unit help
popup stats from atlas frames instead of separate `public/textures/16/*.png`
files, and use the new `help-16` texture as the mark inside the info panel's
help circles.

## Source

`src/assets/16/*.png`, 7 icons, all 16×16:

`attack-16`, `def-16`, `gold-16`, `help-16`, `hp-16`, `move-16`, `village-16`.

## Current consumers

- `HudSelected.unitRow.pairs` (`src/ui/hud/HudSelected.ts:112-116`): icons
  `16/hp-16.png`, `16/attack-16.png`, `16/def-16.png`, `16/gold-16.png`, each
  rendered via `makeIcon(pair.icon, 16)`.
- `UnitHelpDialog` (`src/ui/overlays/UnitHelpDialog.ts:132`): renders each
  `unitHelpStats(unit)` row via `makeIcon(stat.icon, 16)`; `unitDescriptions.ts`
  provides `icon` strings `16/move-16.png`, `16/attack-16.png`, `16/hp-16.png`,
  `16/gold-16.png`, `16/def-16.png`.
- `HudSelected` help circle (`src/ui/hud/HudSelected.ts:271-287`): black circle
  (`HELP_SIZE = 14`) + a `?` `Text` label as its mark.

`village-16` is currently unmapped (packed into the atlas, unused — harmless).

## Desired end state

- `UnitHelpDialog`/`HudSelected` load their 16px icons from the atlas.
- The help circle shows the `help-16` sprite (sized 14 to keep the layout
  unchanged) instead of the `?` text.

## Changes

### 1. Pack script — new `tools/packIcons16.mjs`

Mirrors `tools/packActionButtons.mjs`, reusing the shared codec +
quantization from `tools/packSkills.mjs`:

- `SOURCE_DIR_URL = new URL('../src/assets/16/', import.meta.url)`
- `ATLAS_URL = new URL('../public/textures/icons-16-atlas.png', import.meta.url)`
- `MANIFEST_URL = new URL('../src/game/icons16AtlasData.gen.ts', import.meta.url)`
- `ICONS16_COLS = 7` (one row), `ICONS16_CELL = 16`,
  `ICONS16_ATLAS_FILE = 'icons-16-atlas.png'`
- `generateIcons16Atlas()` returns `{ png, manifestTs, frames, width, height,
  cell, cols, rgba }`; `writeIcons16Atlas()` is async and writes the smaller of
  lossless/quantized (`finalizeAtlas`) + the manifest; `import.meta.main` entry
  like the existing scripts.

Manifest shape matches the other atlases:

```ts
export const ICONS16_ATLAS_FILE = 'icons-16-atlas.png';
export const ICONS16_ATLAS_CELL = 16;
export const ICONS16_ATLAS_COLS = 7;
export const ICONS16_ATLAS_FRAMES: Record<string, { x: number; y: number }> = { ... };
```

npm script: `"pack:icons-16": "node tools/packIcons16.mjs"`.

### 2. Runtime slicer — new `src/ui/kit/icons16.ts`

Mirrors `actionButtonIcons.ts` (incl. the logical-key resolution):

```ts
export const ICONS16_FILES: Record<string, string> = {
  hp: 'hp-16',
  attack: 'attack-16',
  def: 'def-16',
  upkeep: 'gold-16',
  move: 'move-16',
  village: 'village-16',
  help: 'help-16',
};

export function icons16FrameForIconPath(path: string): string;
export function makeIcon16(key: string, size: number, onReady?: () => void): Sprite;
```

- `icons16FrameForIconPath('16/hp-16.png')` → `'hp-16'` (strip `16/` prefix and
  `.png`) so `UnitHelpDialog` can keep passing the existing `'16/foo-16.png'`
  strings and `unitDescriptions.ts` stays untouched.
- `makeIcon16(key, size, onReady)` resolves `ICONS16_FILES[key] ?? key` before
  slicing (same fallback as `makeActionButtonIcon`, so direct frame keys like
  `'hp-16'` also work). Loads the atlas once, slices via
  `Texture({ source, frame: new Rectangle(x, y, 16, 16) })`, caches per frame.

### 3. Wire consumers

- `HudSelected`: unit stat row uses `makeIcon16(ICONS16_FILES[key], 16)` for the
  four `pairs`. Help circle: keep the black circle, replace the `?` `Text` mark
  with `makeIcon16('help', HELP_SIZE)` (sized 14), keeping the `HELP_SIZE`-sized
  circle and hit area unchanged.
- `UnitHelpDialog`: `makeIcon(stat.icon, 16)` →
  `makeIcon16(icons16FrameForIconPath(stat.icon), 16)`.

The old `public/textures/16/*.png` files become unused (left in place; not part
of this change to delete them).

### 4. Tests

- `tests/packIcons16.test.mjs` — mirrors `packActionButtons.test.mjs`:
  coverage exactly the PNG files, determinism, non-overlapping 16×16 frames in
  bounds, committed-sync via `await finalizeAtlas(generateIcons16Atlas().png)`,
  icons valid 16×16.
- `tests/icons16.test.ts` — mirrors `actionButtonIcons.test.ts`: every
  `ICONS16_FILES` value resolves to a frame; logical key (e.g. `'help'`) slices
  the right atlas region; load-lazy atlas src; slicing onload; destroyed-sprite
  safety. Also covers `icons16FrameForIconPath`.
- `hudSelected` / `unitHelpDialog` tests: keep green; adjust only if a test
  asserts the exact `?` text or icon file names (verify — they assert rows/presence).

## Out of scope

- No change to `unitDescriptions.ts` or its data/tests.
- No deletion of `public/textures/16/*.png`.
- Other icon sizes (non-16px) keep using `makeIcon`.

## Verification

- `npm run pack:icons-16` prints a byte count (quantized).
- `npm test` runs the new pack + slicer tests with the full suite.
- `npm run typecheck` is clean.
- Manual (not required post-fix): help circles show a glyph instead of `?` and
  the stat row/popup icons still render.