# Circle Button Press Fix + Skills/Stats Icon Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop toolbar circle buttons from changing size while pressed (color-based active state instead) and render `Skills`/`Stats` as circle icon buttons using `skills.png`/`stats.png`.

**Architecture:** `IconButton` (`src/ui/kit/iconButton.ts`) currently scales to 0.92 on `pointerdown`. Replace scale with a fill-color change (`THEME.buttonPressed`), tracked against a `_hover` flag, plus an explicit circular `hitArea` so geometry never changes. `HudToolbar.ts` swaps its two permanent text buttons for `IconButton`s.

**Tech Stack:** TypeScript, PixiJS 8 (`Container`, `Graphics`, `Sprite`, `Circle`), Vitest (node env), Vite.

## Global Constraints

- No game-logic changes; only UI kit / toolbar rendering.
- `IconButton` is used only by `HudToolbar` (verified) — changes are contained.
- Text `Button` keeps its existing scale-on-press behavior (out of scope).
- Commit files explicitly; do **not** stage `public/textures/capture.png` or `public/textures/upgrade.png` (user's texture tweaks, unrelated to this work).
- Tests run in node env; `Image` is undefined in node, so stub it as `FakeImage` in `tests/setup.ts`.

---
### Task 1: Add `THEME.buttonPressed`

**Files:**
- Modify: `src/ui/kit/theme.ts:1-12` (THEME object)
- Test: `tests/theme.test.ts`

**Interfaces:**
- Produces: `THEME.buttonPressed: number` — `0x2f3450`, darker than `THEME.buttonHover` (`0x4a5070`).

- [ ] **Step 1: Write the failing test**

Add to `tests/theme.test.ts` inside the existing `describe('theme helpers', ...)` block:

```ts
it('buttonPressed is darker than buttonHover', () => {
  expect(THEME.buttonPressed).toBe(0x2f3450);
  expect(THEME.buttonPressed).toBeLessThan(THEME.buttonHover);
});
```

And change the import at the top of `tests/theme.test.ts` to also bring in `THEME`:

```ts
import { THEME, parseHexColor, colorCss, isLightColor } from '../src/ui/kit/theme';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme.test.ts`
Expected: FAIL — `THEME.buttonPressed` is `undefined`.

- [ ] **Step 3: Implement**

In `src/ui/kit/theme.ts`, add `buttonPressed` between `buttonHover` and `panelBg`:

```ts
export const THEME = {
  bg: 0x1a1a2e,
  button: 0x3a3f5a,
  buttonHover: 0x4a5070,
  buttonPressed: 0x2f3450,
  panelBg: 0x000000,
  panelAlpha: 0.6,
  highlight: 0xffd700,
  radius: 4,
  fontFamily: 'system-ui, sans-serif',
  text: 0xeeeeee,
  white: 0xffffff,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/theme.test.ts`
Expected: PASS (both existing and new tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/kit/theme.ts tests/theme.test.ts
git commit -m "feat: add pressed button theme color"
```

---
### Task 2: Fix `IconButton` pressed state (no size change)

**Files:**
- Modify: `src/ui/kit/iconButton.ts`
- Modify: `tests/setup.ts` (stub `Image`)
- Test: `tests/iconButton.test.ts`

**Interfaces:**
- Consumes: `THEME.buttonPressed` (Task 1).
- Produces: `IconButton` with same public API (`icon`, `onClick`, `size`, `disabled`, `onReady`); press state now changes fill color, never scale.

- [ ] **Step 1: Write the failing test**

Add the `Image` stub to `tests/setup.ts` (used by `makeIcon` when constructing `IconButton`; `Image` is undefined in the node test env):

```ts
class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}
(globalThis as Record<string, unknown>).Image ??= FakeImage;
```

Create `tests/iconButton.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IconButton } from '../src/ui/kit/iconButton';
import { THEME } from '../src/ui/kit/theme';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}

function fillOf(btn: IconButton): number {
  return (btn as unknown as { bg: { context: { fillStyle: { color: number } } } }).bg.context.fillStyle.color;
}

describe('IconButton', () => {
  let btn: IconButton;

  beforeEach(() => {
    (globalThis as { Image?: unknown }).Image = FakeImage;
    btn = new IconButton({ icon: 'x.png', onClick: () => {} });
  });

  afterEach(() => {
    btn.destroy({ children: true });
  });

  it('does not change size on press', () => {
    btn.emit('pointerdown', {} as never);
    expect(btn.scale.x).toBe(1);
    expect(btn.scale.y).toBe(1);
  });

  it('darkens the fill while pressed', () => {
    btn.emit('pointerdown', {} as never);
    expect(fillOf(btn)).toBe(THEME.buttonPressed);
  });

  it('restores the normal fill on release when not hovered', () => {
    btn.emit('pointerdown', {} as never);
    btn.emit('pointerup', {} as never);
    expect(fillOf(btn)).toBe(THEME.button);
  });

  it('restores the hover fill on release when hovered', () => {
    btn.emit('pointerover', {} as never);
    btn.emit('pointerdown', {} as never);
    btn.emit('pointerup', {} as never);
    expect(fillOf(btn)).toBe(THEME.buttonHover);
  });

  it('brightens on hover and restores on out', () => {
    btn.emit('pointerover', {} as never);
    expect(fillOf(btn)).toBe(THEME.buttonHover);
    btn.emit('pointerout', {} as never);
    expect(fillOf(btn)).toBe(THEME.button);
  });

  it('ignores press when disabled', () => {
    btn.disabled = true;
    btn.emit('pointerdown', {} as never);
    expect(btn.scale.x).toBe(1);
    expect(fillOf(btn)).toBe(THEME.button);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/iconButton.test.ts`
Expected: `does not change size on press` FAILS (`0.92 !== 1`). The fill-color assertions may fail or pass depending on order — the size assertion is the gate.

- [ ] **Step 3: Implement**

In `src/ui/kit/iconButton.ts`:

1. Import `Circle` from pixi.js:
   `import { Circle, Container, Graphics, Sprite } from 'pixi.js';`

2. Add a `_hover` field next to `_disabled`:
   ```ts
   private _hover = false;
   ```

3. Set an explicit hit area in the constructor (after `this.eventMode = 'static';`):
   ```ts
   this.hitArea = new Circle(this.size / 2, this.size / 2, this.size / 2);
   ```

4. Replace the hover/press handlers with color-based logic (no `scale`):
   ```ts
   private onOver = (): void => {
     this._hover = true;
     if (!this._disabled) this.redraw(THEME.buttonHover, true);
   };
   private onOut = (): void => {
     this._hover = false;
     if (!this._disabled) this.redraw(THEME.button, false);
   };
   private onDown = (): void => {
     if (!this._disabled) this.redraw(THEME.buttonPressed, true);
   };
   private onUp = (): void => {
     if (this._disabled) {
       this.redraw(THEME.button, false);
     } else {
       this.redraw(this._hover ? THEME.buttonHover : THEME.button, this._hover);
     }
   };
   ```
   Keep `onTap` as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/iconButton.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/kit/iconButton.ts tests/iconButton.test.ts tests/setup.ts
git commit -m "fix: keep circle buttons from resizing when pressed"
```

---
### Task 3: Render `Skills` and `Stats` as circle icon buttons

**Files:**
- Modify: `src/ui/hud/HudToolbar.ts:74-80`
- Assets: `public/textures/skills.png`, `public/textures/stats.png` (already present, currently untracked)

**Interfaces:**
- Consumes: `IconButton` (Task 2), `useGameStore.getState().setSkillTreeOpen` / `.setStatsOpen`.

- [ ] **Step 1: Implement the swap**

In `src/ui/hud/HudToolbar.ts`, `update()`, replace:

```ts
addText('Skills', false, () => useGameStore.getState().setSkillTreeOpen(true), 20);
```

with:

```ts
addIcon('skills.png', false, () => useGameStore.getState().setSkillTreeOpen(true));
```

and replace:

```ts
addText('Stats', false, () => useGameStore.getState().setStatsOpen(true), 20);
```

with:

```ts
addIcon('stats.png', false, () => useGameStore.getState().setStatsOpen(true));
```

No other layout changes (`addIcon` already uses size 48 and `GAP = 12`).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/hud/HudToolbar.ts public/textures/skills.png public/textures/stats.png
git commit -m "feat: show skills and stats as circle icon buttons"
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`
1. Toolbar shows circle icons for Skills (`skills.png`) and Stats (`stats.png`) alongside upgrade/heal/end-turn.
2. Press and hold any circle button: size and position do not change; the circle darkens while held and restores on release (to hover if still hovered, else normal).
3. Hover still brightens + ring; disabled icons (end-turn during AI) stay dim.
4. Skills icon opens the skill tree; Stats icon opens the stats overlay.
