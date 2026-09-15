# BitmapText rendering (replace PIXI.Text)

## Goal

Render all in-game text with `PIXI.BitmapText` instead of `PIXI.Text`, using pre-baked
bitmap fonts (`roboto-regular.fnt/png`, `roboto-black.fnt/png` in `public/fonts`) for crisp
glyphs and faster rendering than canvas-measured `Text`.

## Background / current behavior

- All Pixi text is created in three places:
  1. `makeLabel` (`src/ui/kit/label.ts`) — the central factory used by ~100 UI call sites
     (screens, HUD, popups, tooltips, buttons, dialogs, overlays).
  2. `takeText` (`src/render/mapRenderer.ts`) — pooled unit HP text and village labels on the
     map, sized from `label.width/height` for background boxes.
  3. A direct `new Text` (`src/controller/eventPresenter.ts:923`) for floating `+N` score/Hp
     text.
- `makeLabel` currently supports: `fontSize`, `fill`, `fontWeight` (`600`–`900`, `bold`),
  `anchor`, `wordWrap`/`wordWrapWidth`, and `dropShadow`.
- Fonts are baked at 72px with `face="Roboto Regular"` / `face="Roboto Black"`; the `.fnt`
  page entries reference `Roboto Regular.png` / `Roboto Black.png`, but the files on disk are
  `roboto-regular.png` / `roboto-black.png` (mismatch).

## Changes

### 1. Font assets (`public/fonts`)

The fonts live as `Roboto Black.fnt` / `Roboto Black.png` and
`Roboto Regular.fnt` / `Roboto Regular.png`. The `.fnt` page entries reference the matching
PNG filenames, so no renaming is needed. The baked charset covers ASCII punctuation/letters
and digits, Cyrillic (`Ё`, `А-Я`, `а-я`, `ё`), `№`, and the special glyphs the game renders:
`«` `·` `»` `×` `—` `…` `←` `↑` `↓` `→` `✓`.

Keep `Roboto-Regular.ttf` / `Roboto-Black.ttf` (still used by the DOM text-input overlay in
`src/ui/kit/textInputOverlay.ts`).

### 2. Font loading (new `src/ui/kit/bitmapFonts.ts`)

- Export `FONT_REGULAR = 'Roboto Regular'` and `FONT_BLACK = 'Roboto Black'` (must match the
  `.fnt` `face=` names exactly).
- Export `fontFamilyForWeight(weight?: TextStyleFontWeight)` → `FONT_BLACK` for `bold` or
  numeric `>= 700`, else `FONT_REGULAR`.
- Export `async loadBitmapFonts()` that calls
  `Assets.load([...BASE_URL/fonts/Roboto Regular.fnt, ...BASE_URL/fonts/Roboto Black.fnt])`
  using `${import.meta.env.BASE_URL}` like the rest of the codebase (e.g.
  `textureFactory.ts`).

In `src/main.ts` `boot()`, `await loadBitmapFonts()` before `new ScreenManager(app)` so no
`BitmapText` is ever created before the fonts are registered (otherwise Pixi falls back to
canvas-generated dynamic fonts).

### 3. `makeLabel` (`src/ui/kit/label.ts`)

- Return `BitmapText` instead of `Text`.
- Map `fontWeight` → `fontFamily` via `fontFamilyForWeight`; keep `fontSize` as-is
  (BitmapText scales the 72px bake).
- `fill` passes through as the BitmapText tint color.
- `wordWrap`/`wordWrapWidth` → BitmapText `wordWrap`/`maxWidth`.
- Keep `anchor`.
- **Remove** the `dropShadow` option (unsupported by BitmapText) and the `resolution` arg.
- Update the `HudScore.ts` call site to drop its `dropShadow` argument.

### 4. `takeText` (`src/render/mapRenderer.ts`)

- Change the `textPool`/`takeText`/`releaseText`/`releaseOverlay` from `Text` to
  `BitmapText` (update `instanceof Text` checks to `instanceof BitmapText`).
- Remove `textResolution` usage (`BitmapText` has no per-instance resolution).
- Change the two inline styles (`hp/${maxHp}`, settlement label) from
  `fontFamily: 'Roboto, system-ui, sans-serif'` to `FONT_REGULAR`.
- `label.width`/`label.height` still measure synchronously via `updateBounds`.

### 5. Floating text (`src/controller/eventPresenter.ts`)

Replace `new Text({ text, style: { fontSize: 20, fill: color, fontWeight: '800' } })` with
`new BitmapText({ text, style: { fontFamily: FONT_BLACK, fontSize: 20, fill: color } })`.

### 6. Tests (`tests/setup.ts` + suite fixes)

- In `tests/setup.ts`, install both font names via `BitmapFont.install` with a comprehensive
  `chars` set (printable ASCII + Latin-1 supplement + Cyrillic + common symbols such as
  `✓`, `—`, `·`), using a richer fake 2D canvas context available at setup time.
- Because the installed fonts are found on `getFont`'s first cache hit and all chars are
  pre-rendered, `BitmapText` construction in tests never touches the per-test `document`
  stubs. If the full suite surfaces a missing char, add it to the installed charset.

## Edge cases

- Fonts must load before any label is created; `boot()` awaits them.
- Multiple weights/fills reuse the same baked font via tinting — no per-style font explosion.
- The DOM input overlay keeps using the TTF font via CSS; `THEME.fontFamily` stays unchanged
  (still asserted by `tests/theme.test.ts`).

## Testing

- Run the full existing suite (`npm test`) — every UI/popup/HUD test constructs labels.
- `npm run typecheck`.
- `npm run build`.
- Manual: `npm run dev` and eyeball UI text sizes/wrapping vs before; confirm map HP/village
  labels and floating `+N` text still look right.
