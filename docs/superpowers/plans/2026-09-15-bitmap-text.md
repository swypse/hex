# BitmapText Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render all in-game text with `PIXI.BitmapText` (backed by the baked `Roboto Regular` / `Roboto Black` bitmap fonts in `public/fonts`) instead of `PIXI.Text`.

**Architecture:** A small `bitmapFonts.ts` module owns the font family names, weight→family mapping, and an async loader. `makeLabel` (the ~100-call-site UI factory), the map renderer's text pool, and the floating `+N` text all build `BitmapText`. The test environment pre-installs the two fonts headlessly so `BitmapText` construction works in Vitest.

**Tech Stack:** TypeScript, PixiJS 8 (`BitmapText`, `BitmapFont`, `Assets`), Vite, Vitest.

## Global Constraints

- Font family names must exactly match the `.fnt` `face=` values: `Roboto Regular` and `Roboto Black`.
- Asset URLs use `${import.meta.env.BASE_URL}` (as in `textureFactory.ts`), e.g. `${import.meta.env.BASE_URL}fonts/Roboto Regular.fnt`.
- Weight mapping (option 1, approved): `bold` or numeric `>= 700` → `Roboto Black`; anything else (`600`, `normal`, undefined, etc.) → `Roboto Regular`.
- `dropShadow` is removed from `makeLabel` (unsupported by BitmapText); only `HudScore.ts` used it.
- Keep `MapView`'s constructor signature `(app, textures, hexSize, spriteScale, textResolution)` unchanged to avoid touching ~40 test call sites; just stop passing `resolution` to the text.
- `THEME.fontFamily` stays unchanged (still used by the DOM input overlay and asserted in `tests/theme.test.ts`).
- All work on branch `text`; do not push to origin.

---

### Task 1: Install bitmap fonts in the test environment

**Files:**
- Modify: `tests/setup.ts`
- Create: `tests/bitmapSetup.test.ts`

**Interfaces:**
- Produces: globally installed `Roboto Regular` and `Roboto Black` bitmap fonts + a `document.createElement` stub returning a canvas with a rich 2D context, so any later task's `BitmapText` construction works headless without per-test canvas stubbing.

- [ ] **Step 1: Write the failing test**

Create `tests/bitmapSetup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BitmapText } from 'pixi.js';

describe('test bitmap font setup', () => {
  it('constructs BitmapText for both font families headlessly', () => {
    const regular = new BitmapText({
      text: 'hello 123 ✓',
      style: { fontFamily: 'Roboto Regular', fontSize: 16, fill: 0xffffff },
    });
    const black = new BitmapText({
      text: 'hello 123 ✓',
      style: { fontFamily: 'Roboto Black', fontSize: 16, fill: 0xff8c00 },
    });
    expect(regular.width).toBeGreaterThan(0);
    expect(black.width).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bitmapSetup.test.ts`
Expected: FAIL. Without the fonts installed, `new BitmapText` triggers Pixi's canvas-based `DynamicBitmapFont` path; since `tests/setup.ts` does not stub `document`/`CanvasRenderingContext2D` yet, it throws (e.g. `document is not defined`) or renders nothing (`width === 0`).

- [ ] **Step 3: Modify `tests/setup.ts`**

Add a rich fake 2D context, a `document` stub, and install both fonts. Append to `tests/setup.ts`:

```ts
import { BitmapFont } from 'pixi.js';

function range(from: number, to: number): string {
  let out = '';
  for (let c = from; c <= to; c++) out += String.fromCharCode(c);
  return out;
}

const TEST_FONT_CHARS =
  range(0x20, 0x7e) +
  range(0x00a0, 0x00ff) +
  '\u0401' + range(0x0410, 0x044f) + '\u0451' + '\u2116' +
  '\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026' +
  range(0x2190, 0x2193) +
  '\u2212\u2713';

const fakeCanvasContext = () => ({
  measureText: (s: string) => ({
    width: s.length * 8,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: s.length * 8,
    actualBoundingBoxAscent: 12,
    actualBoundingBoxDescent: 3,
  }),
  fillText: noop,
  strokeText: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
  createPattern: () => ({}),
  getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  putImageData: noop,
  setTransform: noop,
  translate: noop,
  scale: noop,
  rotate: noop,
});

(globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D ??= class {};
(globalThis as { document?: unknown }).document ??= {
  createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
};

BitmapFont.install({ name: 'Roboto Regular', style: { fontSize: 16, fill: 0xffffff }, chars: TEST_FONT_CHARS });
BitmapFont.install({ name: 'Roboto Black', style: { fontSize: 16, fill: 0xffffff }, chars: TEST_FONT_CHARS });
```

Note: the `??=` guards keep the existing `navigator`/`window` stubs and avoid clobbering anything a future setup step sets. `noop` is already defined at the top of `setup.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bitmapSetup.test.ts`
Expected: PASS (`width > 0` for both families).

- [ ] **Step 5: Commit**

```bash
git add tests/setup.ts tests/bitmapSetup.test.ts
git commit -m "test: install bitmap fonts in test setup"
```

---

### Task 2: Bitmap font module (names, weight mapping, loader)

**Files:**
- Create: `src/ui/kit/bitmapFonts.ts`
- Create: `tests/bitmapFonts.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `export const FONT_REGULAR: string` (`'Roboto Regular'`)
  - `export const FONT_BLACK: string` (`'Roboto Black'`)
  - `export function fontFamilyForWeight(weight?: TextStyleFontWeight): string`
  - `export async function loadBitmapFonts(): Promise<unknown>`

- [ ] **Step 1: Write the failing test**

Create `tests/bitmapFonts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FONT_BLACK, FONT_REGULAR, fontFamilyForWeight } from '../src/ui/kit/bitmapFonts';

describe('fontFamilyForWeight', () => {
  it('maps undefined and normal weights to Roboto Regular', () => {
    expect(fontFamilyForWeight(undefined)).toBe(FONT_REGULAR);
    expect(fontFamilyForWeight('normal')).toBe(FONT_REGULAR);
    expect(fontFamilyForWeight('600')).toBe(FONT_REGULAR);
  });
  it('maps bold and 700+ to Roboto Black', () => {
    expect(fontFamilyForWeight('bold')).toBe(FONT_BLACK);
    expect(fontFamilyForWeight('700')).toBe(FONT_BLACK);
    expect(fontFamilyForWeight('800')).toBe(FONT_BLACK);
    expect(fontFamilyForWeight('900')).toBe(FONT_BLACK);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bitmapFonts.test.ts`
Expected: FAIL (module not found / undefined).

- [ ] **Step 3: Write the module**

Create `src/ui/kit/bitmapFonts.ts`:

```ts
import { Assets, type TextStyleFontWeight } from 'pixi.js';

export const FONT_REGULAR = 'Roboto Regular';
export const FONT_BLACK = 'Roboto Black';

const FONT_BASE = `${import.meta.env.BASE_URL}fonts/`;

export function fontFamilyForWeight(weight?: TextStyleFontWeight): string {
  if (!weight) return FONT_REGULAR;
  if (weight === 'bold') return FONT_BLACK;
  const n = Number(weight);
  if (!Number.isNaN(n) && n >= 700) return FONT_BLACK;
  return FONT_REGULAR;
}

export async function loadBitmapFonts(): Promise<unknown> {
  return Assets.load([`${FONT_BASE}Roboto Regular.fnt`, `${FONT_BASE}Roboto Black.fnt`]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bitmapFonts.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/kit/bitmapFonts.ts tests/bitmapFonts.test.ts
git commit -m "feat: add bitmap font names, weight mapping, and loader"
```

---

### Task 3: Load fonts at boot

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `loadBitmapFonts` from Task 2.
- Produces: fonts registered before any screen/label is built.

- [ ] **Step 1: Wire the loader into boot**

In `src/main.ts`, import the loader and `await` it before `new ScreenManager(app)` (line ~50):

```ts
import { loadBitmapFonts } from './ui/kit/bitmapFonts';
```

Inside `boot()`, right after the existing `document.fonts.load(...)` awaits and before `const app = new Application();`:

```ts
await loadBitmapFonts();
```

(The exact placement is not critical; the requirement is that it completes before any screen constructs labels. Keeping it with the other font loading at the top of `boot()` is cleanest.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: load bitmap fonts at boot"
```

---

### Task 4: `makeLabel` → `BitmapText` (+ dropShadow removal + type annotations)

**Files:**
- Modify: `src/ui/kit/label.ts`
- Modify: `src/ui/hud/HudScore.ts:36-41` (remove `dropShadow`)
- Modify type annotations & imports (`Text` → `BitmapText`) in:
  - `src/ui/screens/StartScreen.ts` (`hint`)
  - `src/ui/screens/SetupScreen.ts` (`tribeTitle`, `enemiesTitle`, `modeTitle`, `difficultyTitle`, `mapSizeTitle`, `tribeItemLabels: Text[]`, `tribeDesc`, `hint`)
  - `src/ui/kit/tooltip.ts` (`title`, `text`)
  - `src/ui/kit/button.ts` (`text`)
  - `src/ui/kit/popup.ts` (`titleText`)
  - `src/ui/kit/textInputOverlay.ts` (`label`)
  - `src/ui/hud/HudScore.ts` (`text`)
  - `src/ui/hud/HudTurn.ts` (`text`)
  - `src/ui/overlays/GameStats.ts` (`(label: Text, ...)` helper param)
- Create: `tests/label.test.ts`

**Interfaces:**
- Consumes: `FONT_REGULAR`, `FONT_BLACK`, `fontFamilyForWeight` from Task 2.
- Produces: `makeLabel(text, opts): BitmapText`. `opts` = `{ fontSize?, fill?, fontWeight?, anchor?, wordWrap?, wordWrapWidth? }` (no `dropShadow`, no `resolution`).

Transformation rule for the annotation files: replace the pixi `Text` import with `BitmapText` and change the affected field/param types from `Text` (or `Text | null`, `Text[]`) to `BitmapText` (or `BitmapText | null`, `BitmapText[]`). The `BitmapText` class exposes the same `text`, `style`, `anchor`, `position`, `alpha`, `zIndex`, `width`, `height`, `destroy` members the callers use, so no call-site body changes are needed.

- [ ] **Step 1: Write the failing test**

Create `tests/label.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BitmapText } from 'pixi.js';
import { makeLabel } from '../src/ui/kit/label';

describe('makeLabel', () => {
  it('returns a BitmapText', () => {
    expect(makeLabel('x')).toBeInstanceOf(BitmapText);
  });
  it('defaults to Roboto Regular', () => {
    expect(makeLabel('x').style.fontFamily).toBe('Roboto Regular');
  });
  it('uses Roboto Black for 700+', () => {
    expect(makeLabel('x', { fontWeight: '700' }).style.fontFamily).toBe('Roboto Black');
    expect(makeLabel('x', { fontWeight: '900' }).style.fontFamily).toBe('Roboto Black');
  });
  it('keeps Roboto Regular for 600', () => {
    expect(makeLabel('x', { fontWeight: '600' }).style.fontFamily).toBe('Roboto Regular');
  });
  it('applies fill', () => {
    expect(makeLabel('x', { fill: 0xff0000 }).style.fill).toBe(0xff0000);
  });
  it('applies word wrap width', () => {
    const label = makeLabel('long text', { wordWrap: true, wordWrapWidth: 50 });
    expect(label.style.wordWrap).toBe(true);
    expect(label.style.wordWrapWidth).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/label.test.ts`
Expected: FAIL (`makeLabel(...)` is not an instance of `BitmapText`).

- [ ] **Step 3: Rewrite `src/ui/kit/label.ts`**

```ts
import { BitmapText, type TextStyleFontWeight, type TextStyleOptions } from 'pixi.js';
import { THEME } from './theme';
import { fontFamilyForWeight } from './bitmapFonts';

export function makeLabel(
  text: string,
  opts: {
    fontSize?: number;
    fill?: number;
    fontWeight?: TextStyleFontWeight;
    anchor?: [number, number];
    wordWrap?: boolean;
    wordWrapWidth?: number;
  } = {},
): BitmapText {
  const style: TextStyleOptions = {
    fontFamily: fontFamilyForWeight(opts.fontWeight),
    fontSize: opts.fontSize ?? 16,
    fill: opts.fill ?? THEME.text,
  };
  if (opts.wordWrap) {
    style.wordWrap = true;
    style.wordWrapWidth = opts.wordWrapWidth ?? 200;
  }
  const label = new BitmapText({ text, style });
  if (opts.anchor) label.anchor.set(opts.anchor[0], opts.anchor[1]);
  return label;
}
```

- [ ] **Step 4: Update `HudScore.ts`**

Remove the `dropShadow` option from the `makeLabel` call at lines 36-41:

```ts
    const text = makeLabel('0', {
      fontSize: 20,
      fill: 0xffffff,
      fontWeight: '800',
    });
```

- [ ] **Step 5: Update the type annotations and imports**

For each file listed above, change the pixi `Text` import to `BitmapText` and update the affected field/param types. Example — `src/ui/hud/HudTurn.ts`:

```ts
import { Container, Graphics, BitmapText } from 'pixi.js';
...
  private text: BitmapText | null = null;
```

Apply the same to `StartScreen.ts`, `SetupScreen.ts`, `tooltip.ts`, `button.ts`, `popup.ts`, `textInputOverlay.ts`, `HudScore.ts`, and `GameStats.ts` (the helper param `label: Text` → `label: BitmapText`).

- [ ] **Step 6: Run the label test**

Run: `npx vitest run tests/label.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If typecheck flags a `Text` annotation you missed, fix it — typecheck is the gate for this mechanical sweep.)

- [ ] **Step 8: Commit**

```bash
git add src/ui/kit/label.ts src/ui/hud/HudScore.ts src/ui/screens/StartScreen.ts src/ui/screens/SetupScreen.ts src/ui/kit/tooltip.ts src/ui/kit/button.ts src/ui/kit/popup.ts src/ui/kit/textInputOverlay.ts src/ui/hud/HudTurn.ts src/ui/overlays/GameStats.ts tests/label.test.ts
git commit -m "feat: makeLabel uses BitmapText, drop shadow removed"
```

---

### Task 5: Map renderer text pool → `BitmapText`

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Consumes: `FONT_REGULAR` from Task 2.
- Produces: `takeText(text: string, style: TextStyleOptions): BitmapText` backed by a `BitmapText` pool. Constructor signature unchanged.

- [ ] **Step 1: Verify the failing baseline (existing tests still pass before the change)**

Run: `npx vitest run tests/mapRenderer.test.ts`
Expected: PASS (baseline).

- [ ] **Step 2: Modify `mapRenderer.ts`**

1. Import `BitmapText` from `pixi.js` (line 2) and drop the now-unused `Text` value import if it becomes unused. Keep `type TextStyleOptions`.
2. `private textPool: BitmapText[] = [];` (line 191)
3. `takeText` (lines 1550-1555):

```ts
  private takeText(text: string, style: TextStyleOptions): BitmapText {
    const t = this.textPool.pop() ?? new BitmapText({ text: '', style });
    t.text = text;
    t.style = style;
    return t;
  }
```

4. `releaseText` (lines 1557-1564): `releaseText(t: BitmapText): void`.
5. `releaseOverlay` (line 1571): `else if (child instanceof BitmapText) this.releaseText(child);`
6. The two inline font families (lines 1650, 1785) `fontFamily: 'Roboto, system-ui, sans-serif'` → `fontFamily: FONT_REGULAR`. Import `FONT_REGULAR` from `./ui/kit/bitmapFonts` (check the relative path from `src/render/`: `../ui/kit/bitmapFonts`).
7. Leave the `textResolution` constructor parameter in place (unused now); do not remove it.

- [ ] **Step 3: Run map renderer tests**

Run: `npx vitest run tests/mapRenderer.test.ts tests/moveAnimation.test.ts tests/combatAnimation.test.ts tests/clientRender.test.ts`
Expected: PASS. If any test asserted on `Text`-specific behavior (e.g. stubbed `Text.prototype.width`), update that test to match `BitmapText` measurement and re-run.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: map renderer text pool uses BitmapText"
```

---

### Task 6: Floating `+N` text → `BitmapText`

**Files:**
- Modify: `src/controller/eventPresenter.ts`

**Interfaces:**
- Consumes: `FONT_BLACK` from Task 2.
- Produces: `spawnFloatText` renders `BitmapText` in `Roboto Black`.

- [ ] **Step 1: Verify the failing baseline**

Run: `npx vitest run tests/presentEventsReveal.test.ts tests/combatAnimation.test.ts tests/moveAnimation.test.ts`
Expected: PASS (baseline).

- [ ] **Step 2: Modify `eventPresenter.ts`**

1. Update the pixi import (line 1): replace `Text` with `BitmapText` (keep `Text` only if still used elsewhere — it is not; the only direct usage is this float label).
2. Add `import { FONT_BLACK } from '../ui/kit/bitmapFonts';`
3. Replace the `new Text` block (lines 923-926):

```ts
    const label = new BitmapText({
      text,
      style: { fontFamily: FONT_BLACK, fontSize: 20, fill: color },
    });
```

- [ ] **Step 3: Run event presenter tests**

Run: `npx vitest run tests/presentEventsReveal.test.ts tests/combatAnimation.test.ts tests/moveAnimation.test.ts tests/bonusNotification.test.ts`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controller/eventPresenter.ts
git commit -m "feat: floating text uses BitmapText"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL PASS. If a test that renders labels fails due to measurement/type assumptions, fix it in place (e.g. update a `Text`-specific stub or an expected width) and re-run.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds (fonts copied to `dist/fonts/` as static assets).

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open the game, and eyeball: UI labels (sizes/wrapping), map unit HP + settlement labels, floating `+N`/HP text, the checkbox `✓`, and the nav hints (`↑/↓ · Enter`) all render with no blanks and look correct.

- [ ] **Step 5: Commit any test fixes**

```bash
git add -A
git commit -m "test: adjust tests for BitmapText rendering"
```

(Only commit if Step 1 produced changes; otherwise skip.)
