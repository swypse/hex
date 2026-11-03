# Action Buttons Atlas Design

Date: 2026-09-12

## Goal

Pack the 20 button icon PNGs in `src/assets/action-buttons/` into a single
quantized atlas (like the skills and achievements atlases), and render the
toolbar action buttons, the skills button, the stats button, and the
achievements button from frames of that atlas instead of individual texture
files.

## Source

`src/assets/action-buttons/*.png`, 20 icons, all 120×120:

- `action-build-bridge`, `action-build-mine`, `action-build-port`,
  `action-build-road`, `action-build-sawmill`, `action-build-wall`,
  `action-build`, `action-capture`, `action-cup`, `action-disband`,
  `action-end-turn`, `action-get-bonus`, `action-get-bottle`,
  `action-skills`, `action-spawn`, `action-stats`, `action-upgrade`,
  `action-heal`, `action-water-temple`, `action-forest-temple`.

## Current consumers

- `HudToolbar.ICON_ACTIONS` (`src/ui/hud/HudToolbar.ts:16`): maps action keys
  (`upgrade`, `wall`, `upgrade-ship`, `heal`, `disband`, `capture`, `spawn`,
  `sawmill`, `mine`, `port`, `temple`, `forestTemple`, `road`, `bridge`,
  `bonus`, `bottle`) to individual texture files; `addIcon` and the stats
  button (`stats.png`) and end-turn button (`end-turn.png`) pass file names to
  `IconButton`.
- `HudSkills` (`icon: 'skills.png'`), `HudAchievements` (`icon: 'cup.png'`).
- `IconButton` (`src/ui/kit/iconButton.ts`) calls `makeIcon` to load the
  texture.

## Changes

### 1. Pack script — new `tools/packActionButtons.mjs`

Mirrors `tools/packAchievements.mjs` and reuses the shared codec + quantization
from `tools/packSkills.mjs` (`decodePng`, `encodePng`, `finalizeAtlas`):

- `SOURCE_DIR_URL = src/assets/action-buttons/`
- `ATLAS_URL = public/textures/action-buttons-atlas.png`
- `MANIFEST_URL = src/game/actionButtonAtlasData.gen.ts`
- `ACTION_BUTTON_COLS = 5`, `ACTION_BUTTON_CELL = 120`
- `ACTION_BUTTON_ATLAS_FILE = 'action-buttons-atlas.png'`
- `generateActionButtonAtlas()` returns `{ png, manifestTs, frames, width,
  height, cell, cols, rgba }`; `writeActionButtonAtlas()` is async and writes
  the smaller of lossless/quantized (`finalizeAtlas`) + the manifest; both use
  `import.meta.main` like the existing scripts.

Add npm script: `"pack:action-buttons": "node tools/packActionButtons.mjs"`.

The manifest shape matches `skillAtlasData.gen.ts`:

```ts
export const ACTION_BUTTON_ATLAS_FILE = 'action-buttons-atlas.png';
export const ACTION_BUTTON_ATLAS_CELL = 120;
export const ACTION_BUTTON_ATLAS_COLS = 5;
export const ACTION_BUTTON_ATLAS_FRAMES: Record<string, { x: number; y: number }> = { ... };
```

### 2. Runtime slicer — new `src/ui/kit/actionButtonIcons.ts`

Mirrors `skillIcons.ts`:

```ts
export const ACTION_BUTTON_ICON_FILES: Record<string, string>
export function makeActionButtonIcon(key: string, size: number, onReady?: () => void): Sprite
```

- `ACTION_BUTTON_ICON_FILES` maps logical button keys → atlas frame keys. Since
  the frame keys equal the source base names, the mapping is mostly identity
  but is kept explicit so callers stay decoupled from filenames:
  - `upgrade` / `upgrade-ship` → `action-upgrade`
  - `wall` → `action-build-wall`, `sawmill` → `action-build-sawmill`, `mine` →
    `action-build-mine`, `port` → `action-build-port`, `road` →
    `action-build-road`, `bridge` → `action-build-bridge`
  - `heal` → `action-heal`, `disband` → `action-disband`, `capture` →
    `action-capture`, `spawn` → `action-spawn`
  - `temple` → `action-water-temple`, `forestTemple` → `action-forest-temple`
  - `bonus` → `action-get-bonus`, `bottle` → `action-get-bottle`
  - `stats` → `action-stats`, `skills` → `action-skills`,
    `achievements` → `action-cup`, `end-turn` → `action-end-turn`
- `makeActionButtonIcon` loads the atlas texture once, slices the frame with
  `Texture({ source, frame: new Rectangle(x, y, CELL, CELL) })`, and caches per
  frame — identical to `skillIcons.sliceFrame`.

### 3. `IconButton` optional icon factory

`src/ui/kit/iconButton.ts` — add an optional `iconFactory` to `IconButtonOpts`:

```ts
export interface IconButtonOpts {
  // ...
  /** Overrides how the icon sprite is built (default `makeIcon`). */
  iconFactory?: (name: string, size: number, onReady?: () => void) => Sprite;
}
```

Constructor: `const buildIcon = opts.iconFactory ?? makeIcon;` and use it in
place of `makeIcon(opts.icon, iconSize, ...)`. Default behavior unchanged
(`iconButton.test.ts` stays green without edits).

### 4. Wire consumers

- `HudToolbar`: `ICON_ACTIONS` values become logical keys from the mapping
  (e.g. `upgrade: 'upgrade'`, `wall: 'wall'`, ...); `addIcon`, the stats button,
  and the end-turn button pass `iconFactory: makeActionButtonIcon`. The
  `temple`/`forestTemple`/`upgrade-ship` reuses listed above.
- `HudSkills`: `icon: 'skills'`, `iconFactory: makeActionButtonIcon`.
- `HudAchievements`: `icon: 'achievements'`, `iconFactory: makeActionButtonIcon`.

The generic `action-build.png` frame stays in the atlas but is unmapped (no
current toolbar key uses it) — harmless.

### 5. Tests

- `tests/packActionButtons.test.mjs` — mirrors `packAchievements.test.mjs`:
  coverage exactly the PNG files, determinism, non-overlapping 120×120 frames
  in bounds, committed-sync via `await finalizeAtlas(generateActionButtonAtlas().png)`,
  icons are valid 120×120.
- `tests/actionButtonIcons.test.ts` — mirrors `skillIcons.test.ts`: mapping has
  an entry for each `ACTION_BUTTON_ATLAS_FRAMES` key used, frames slice to
  non-null textures, sprite gets the slice.
- `hudToolbar` / `hudSkills` / `hudAchievements` / `iconButton` tests: keep
  passing unchanged (they assert button presence/type, not icon filename); only
  adjust if a test asserts a specific icon filename.

## Out of scope

- No change to the skills/achievements atlases or their consumers.
- No change to `makeIcon` for plain (non-atlas) icons.
- The `action-build` frame is packed but unused.

## Verification

- `npm run pack:action-buttons` prints a byte count (quantized smaller than the
  lossless atlas).
- `npm test` runs the new pack + slicer tests alongside the full suite.
- `npm run typecheck` is clean.