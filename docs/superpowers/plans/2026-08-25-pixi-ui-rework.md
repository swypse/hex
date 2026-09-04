# Pixi UI Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every screen and UI element from React to a single persistent PixiJS app, remove React from the project entirely, and keep the Zustand store unchanged.

**Architecture:** `main.ts` boots one Pixi `Application`. A `ScreenManager` subscribes to `store.screen` and swaps screen controllers (TS classes) into a `screenLayer` container; a global `overlayLayer` hosts popups/dialogs/skill-tree/game-over. `gameController` is refactored to render the map into a container passed at init instead of creating/destroying the app. UI reads the store via `getState()`/`subscribe()`.

**Tech Stack:** TypeScript, PixiJS 8, Zustand 5, Vite, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass at the end of every task.
- Do NOT modify `src/store/gameStore.ts`, `src/ui/popupQueue.ts`, `src/game/**`, `src/render/**`, or `src/net/**`.
- Do NOT create any `.tsx` file and do NOT import `react` anywhere in new code.
- `gameController`'s public action methods keep their current names/signatures.
- Visual fidelity: reproduce the current CSS/JSX layout, colors, fonts, and behavior exactly.
- Font stack: `system-ui, sans-serif`. Panel fill `0x000000` alpha `0.6` (current `rgba(0,0,0,0.6)`). Button fill `0x3a3f5a`, hover `0x4a5070`, radius 4, disabled opacity 0.5, selected = 3px white outline. Highlight `0xffd700`. Text `0xeeeeee`.
- Pixi `Text` objects get `resolution: Math.max(2, window.devicePixelRatio || 2)`.
- Project works best if you read these first: `src/controller/gameController.ts`, `src/store/gameStore.ts`, `src/render/mapRenderer.ts`, `src/config.ts`.

---

### Task 1: Widget kit

**Files:**
- Create: `src/ui/host.ts`
- Create: `src/ui/kit/theme.ts`
- Create: `src/ui/kit/label.ts`
- Create: `src/ui/kit/panel.ts`
- Create: `src/ui/kit/button.ts`
- Create: `src/ui/kit/icon.ts`
- Create: `src/ui/kit/textInputOverlay.ts`
- Test: `tests/theme.test.ts`

**Interfaces:**
- Produces: `UIHost` (`{ app: Application; screenLayer: Container; overlayLayer: Container }`), `ScreenController` (`mount(host: UIHost): void; destroy(): void`), `Widget` (`mount(host: UIHost, root: Container): void; destroy(): void`), `makeLabel(text, opts?)`, `makePanel(w, h, opts?)`, `makeCircle(radius, fill, stroke?)`, `Button` class, `makeIcon(name, size, onReady?)`, `TextInputOverlay` class, `parseHexColor(css)`, `colorCss(n)`, `isLightColor(n)`, `THEME`.

- [ ] **Step 1: Write the tests for the pure helpers**

Create `tests/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseHexColor, colorCss, isLightColor } from '../src/ui/kit/theme';

describe('theme helpers', () => {
  it('parses hex colors', () => {
    expect(parseHexColor('#ff69b4')).toBe(0xff69b4);
    expect(parseHexColor('junk')).toBe(0x1a1a2e);
  });
  it('formats css colors', () => {
    expect(colorCss(0xff69b4)).toBe('#ff69b4');
    expect(colorCss(0x0a0b0c)).toBe('#0a0b0c');
  });
  it('detects light colors', () => {
    expect(isLightColor(0xf2f2f7)).toBe(true);
    expect(isLightColor(0x2f6fb3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- theme`
Expected: FAIL — module `../src/ui/kit/theme` not found.

- [ ] **Step 3: Create the host interface**

Create `src/ui/host.ts`:

```ts
import { Application, Container } from 'pixi.js';

export interface UIHost {
  app: Application;
  screenLayer: Container;
  overlayLayer: Container;
}

export interface ScreenController {
  mount(host: UIHost): void;
  destroy(): void;
}

export interface Widget {
  mount(host: UIHost, root: Container): void;
  destroy(): void;
}
```

- [ ] **Step 4: Create theme.ts**

Create `src/ui/kit/theme.ts`:

```ts
export const THEME = {
  bg: 0x1a1a2e,
  button: 0x3a3f5a,
  buttonHover: 0x4a5070,
  panelBg: 0x000000,
  panelAlpha: 0.6,
  highlight: 0xffd700,
  radius: 4,
  fontFamily: 'system-ui, sans-serif',
  text: 0xeeeeee,
  white: 0xffffff,
} as const;

export function parseHexColor(css: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(css);
  return m ? parseInt(m[1], 16) : THEME.bg;
}

export function colorCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function isLightColor(color: number): boolean {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}
```

- [ ] **Step 5: Create label.ts**

Create `src/ui/kit/label.ts`:

```ts
import { Text, type TextStyleOptions } from 'pixi.js';
import { THEME } from './theme';

export function makeLabel(
  text: string,
  opts: { fontSize?: number; fill?: number; fontWeight?: string; anchor?: [number, number] } = {},
): Text {
  const style: TextStyleOptions = {
    fontFamily: THEME.fontFamily,
    fontSize: opts.fontSize ?? 16,
    fill: opts.fill ?? THEME.text,
  };
  if (opts.fontWeight) style.fontWeight = opts.fontWeight;
  const label = new Text({ text, style, resolution: Math.max(2, window.devicePixelRatio || 2) });
  if (opts.anchor) label.anchor.set(opts.anchor[0], opts.anchor[1]);
  return label;
}
```

- [ ] **Step 6: Create panel.ts**

Create `src/ui/kit/panel.ts`:

```ts
import { Graphics } from 'pixi.js';
import { THEME } from './theme';

export function makePanel(
  width: number,
  height: number,
  opts: { radius?: number; fill?: number; alpha?: number } = {},
): Graphics {
  const g = new Graphics();
  g.roundRect(0, 0, width, height, opts.radius ?? THEME.radius)
    .fill({ color: opts.fill ?? THEME.panelBg, alpha: opts.alpha ?? THEME.panelAlpha });
  return g;
}

export function makeCircle(
  radius: number,
  fill: number,
  stroke?: { width: number; color: number },
): Graphics {
  const g = new Graphics();
  g.circle(0, 0, radius).fill(fill);
  if (stroke) g.stroke({ width: stroke.width, color: stroke.color });
  return g;
}
```

- [ ] **Step 7: Create button.ts**

Create `src/ui/kit/button.ts`:

```ts
import { Container, Graphics, Text } from 'pixi.js';
import { makeLabel } from './label';
import { THEME } from './theme';

export interface ButtonOpts {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  fontSize?: number;
  width?: number;
  paddingX?: number;
  paddingY?: number;
}

export class Button extends Container {
  private readonly bg: Graphics;
  private readonly text: Text;
  private readonly w: number;
  private readonly h: number;
  private readonly onClick: () => void;
  private _disabled = false;
  private _selected = false;

  constructor(opts: ButtonOpts) {
    super();
    this.onClick = opts.onClick;
    const paddingX = opts.paddingX ?? 16;
    const paddingY = opts.paddingY ?? 8;
    this.text = makeLabel(opts.label, { fontSize: opts.fontSize ?? 16 });
    this.w = opts.width ?? this.text.width + paddingX * 2;
    this.h = Math.max(this.text.height + paddingY * 2, 34);
    this.bg = new Graphics();
    this.bg.roundRect(0, 0, this.w, this.h, THEME.radius).fill(THEME.button);
    this.text.position.set((this.w - this.text.width) / 2, (this.h - this.text.height) / 2);
    this.addChild(this.bg, this.text);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', this.onOver);
    this.on('pointerout', this.onOut);
    this.on('pointerdown', this.onDown);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.onUp);
    this.on('pointertap', this.onTap);
    this.disabled = opts.disabled ?? false;
    this.selected = opts.selected ?? false;
  }

  private redraw(): void {
    this.bg.clear().roundRect(0, 0, this.w, this.h, THEME.radius).fill(this._disabled ? THEME.button : THEME.button);
    if (this._selected) this.bg.stroke({ width: 3, color: THEME.white });
  }

  private onOver = (): void => {
    if (this._disabled) return;
    this.bg.clear().roundRect(0, 0, this.w, this.h, THEME.radius).fill(THEME.buttonHover);
    if (this._selected) this.bg.stroke({ width: 3, color: THEME.white });
  };
  private onOut = (): void => {
    this.redraw();
  };
  private onDown = (): void => {
    if (!this._disabled) this.scale.set(0.96);
  };
  private onUp = (): void => {
    this.scale.set(1);
  };
  private onTap = (): void => {
    if (!this._disabled) this.onClick();
  };

  get disabled(): boolean {
    return this._disabled;
  }
  set disabled(v: boolean) {
    this._disabled = v;
    this.alpha = v ? 0.5 : 1;
    this.eventMode = v ? 'none' : 'static';
    this.redraw();
  }

  get selected(): boolean {
    return this._selected;
  }
  set selected(v: boolean) {
    this._selected = v;
    this.redraw();
  }
}
```

- [ ] **Step 8: Create icon.ts**

Create `src/ui/kit/icon.ts`:

```ts
import { Sprite, Texture } from 'pixi.js';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;
const cache = new Map<string, Texture>();

export function makeIcon(name: string, size: number, onReady?: () => void): Sprite {
  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size;
  const cached = cache.get(name);
  if (cached) {
    sprite.texture = cached;
    return sprite;
  }
  const img = new Image();
  img.onload = () => {
    const tex = Texture.from(img);
    cache.set(name, tex);
    sprite.texture = tex;
    sprite.width = size;
    sprite.height = size;
    onReady?.();
  };
  img.src = TEXTURE_BASE + name;
  return sprite;
}
```

- [ ] **Step 9: Create textInputOverlay.ts**

Create `src/ui/kit/textInputOverlay.ts`:

```ts
import { Container, Text } from 'pixi.js';
import { makeLabel } from './label';
import { makePanel } from './panel';

export interface TextInputOpts {
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  onChange: (value: string) => void;
  transform?: (v: string) => string;
}

export class TextInputOverlay {
  private readonly field: Container;
  private readonly label: Text;
  private readonly opts: TextInputOpts;
  private input: HTMLInputElement | null = null;
  private disposed = false;

  constructor(opts: TextInputOpts) {
    this.opts = opts;
    this.field = new Container();
    this.field.position.set(opts.x, opts.y);
    this.field.eventMode = 'static';
    this.field.cursor = 'text';
    this.field.addChild(makePanel(opts.width, opts.height));
    this.label = makeLabel(opts.value, { fontSize: 16 });
    this.field.addChild(this.label);
    this.positionLabel();
    this.field.on('pointertap', () => this.focus());
  }

  get container(): Container {
    return this.field;
  }

  private positionLabel(): void {
    this.label.position.set(
      (this.opts.width - this.label.width) / 2,
      (this.opts.height - this.label.height) / 2,
    );
  }

  focus(): void {
    if (this.disposed) return;
    this.destroyInput();
    const input = document.createElement('input');
    input.value = this.opts.value;
    input.style.position = 'fixed';
    input.style.left = `${this.opts.x}px`;
    input.style.top = `${this.opts.y}px`;
    input.style.width = `${this.opts.width}px`;
    input.style.height = `${this.opts.height}px`;
    input.style.fontSize = '16px';
    input.style.fontFamily = 'system-ui, sans-serif';
    input.style.color = 'transparent';
    input.style.background = 'transparent';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.caretColor = '#eeeeee';
    input.style.textAlign = 'center';
    input.addEventListener('input', () => {
      const v = this.opts.transform ? this.opts.transform(input.value) : input.value;
      this.label.text = v;
      this.positionLabel();
      this.opts.onChange(v);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
        e.stopPropagation();
      }
    });
    input.addEventListener('blur', () => this.destroyInput());
    document.body.appendChild(input);
    this.input = input;
    input.focus();
  }

  private destroyInput(): void {
    if (this.input) {
      this.input.remove();
      this.input = null;
    }
  }

  destroy(): void {
    this.disposed = true;
    this.destroyInput();
    this.field.destroy({ children: true });
  }
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm test -- theme`
Expected: PASS (3 tests).

- [ ] **Step 11: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 12: Commit**

```bash
git add src/ui/host.ts src/ui/kit tests/theme.test.ts
git commit -m "feat: add Pixi UI widget kit"
```

---

### Task 2: Start screen controller

**Files:**
- Create: `src/ui/screens/StartScreen.ts`

**Interfaces:**
- Consumes: `UIHost`, `ScreenController` from `../host`; `Button` from `../kit/button`; `makeLabel` from `../kit/label`; `useGameStore` from `../../store/gameStore`.
- Produces: class `StartScreen` implementing `ScreenController`.

Ports `src/screens/StartScreen.tsx` (menu with two options, ↑/↓ + Enter navigation, white outline on selected).

- [ ] **Step 1: Write the controller**

Create `src/ui/screens/StartScreen.ts`:

```ts
import { Container, Text } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type ScreenController, type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';

export class StartScreen implements ScreenController {
  private root: Container | null = null;
  private host: UIHost | null = null;
  private title: Text | null = null;
  private hint: Text | null = null;
  private buttons: Button[] = [];
  private index = 0;

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    host.screenLayer.addChild(this.root);

    this.title = makeLabel('Hex', { fontSize: 64, fill: 0xffffff, fontWeight: '800' });
    this.title.anchor.set(0.5);

    const single = new Button({
      label: 'Single player',
      width: 240,
      selected: true,
      onClick: () => useGameStore.getState().setScreen('setup'),
    });
    const multi = new Button({
      label: 'Multiplayer',
      width: 240,
      onClick: () => useGameStore.getState().setScreen('lobby'),
    });

    this.hint = makeLabel('↑/↓ navigate · Enter select', { fontSize: 12, fill: 0xeeeeee });
    this.hint.alpha = 0.7;
    this.hint.anchor.set(0.5);

    this.buttons = [single, multi];
    this.root.addChild(this.title, single, multi, this.hint);

    this.layout();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => this.layout();

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.move(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.move(1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.buttons[this.index].emit('pointertap');
    }
  };

  private layout(): void {
    if (!this.root || !this.host) return;
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;
    this.title!.position.set(w / 2, h / 2 - 130);
    this.buttons[0].position.set(w / 2 - 120, h / 2 - 40);
    this.buttons[1].position.set(w / 2 - 120, h / 2 + 24);
    this.hint!.position.set(w / 2, h / 2 + 100);
  }

  private move(dir: number): void {
    this.index = (this.index + dir + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, i) => {
      b.selected = i === this.index;
    });
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    this.root?.destroy({ children: true });
    this.root = null;
    this.title = null;
    this.hint = null;
    this.buttons = [];
    this.host = null;
  }
}
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/StartScreen.ts
git commit -m "feat: port start screen to Pixi"
```

---

### Task 3: Setup screen controller

**Files:**
- Create: `src/ui/screens/SetupScreen.ts`

**Interfaces:**
- Consumes: `gameController.startGame(tribe, enemies, mode)`, `TRIBES`/`Tribe` from `../../game/tribes`, `GAME_MODE_NAMES`/`GameMode` from `../../game/gameMode`, kit pieces, `useGameStore`.
- Produces: class `SetupScreen` implementing `ScreenController`.

Ports `src/screens/SetupScreen.tsx` (3 selectors: tribe, enemies, mode; ↑/↓ switch selector, ←/→ change, Enter start). Selected option shows a gold ring (tribe circle) or gold outline (enemy/mode group).

- [ ] **Step 1: Write the controller**

Create `src/ui/screens/SetupScreen.ts`:

```ts
import { Container, Graphics, Text } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { TRIBES, type Tribe } from '../../game/tribes';
import { GAME_MODE_NAMES, type GameMode } from '../../game/gameMode';
import { type ScreenController, type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';

const ENEMY_OPTIONS = [1, 2, 3];
const MODE_OPTIONS: GameMode[] = ['capture', 'turns30'];
const SELECTOR_COUNT = 3;

export class SetupScreen implements ScreenController {
  private root: Container | null = null;
  private host: UIHost | null = null;
  private selector = 0;
  private tribe: Tribe = TRIBES[0].id;
  private enemies = 3;
  private tribeTitle: Text | null = null;
  private enemiesTitle: Text | null = null;
  private modeTitle: Text | null = null;
  private tribeItems: Container[] = [];
  private tribeCircles: Graphics[] = [];
  private enemyButtons: Button[] = [];
  private modeButtons: Button[] = [];
  private startBtn: Button | null = null;
  private hint: Text | null = null;
  private outlines: Graphics[] = [];

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    host.screenLayer.addChild(this.root);

    this.tribeTitle = makeLabel('Choose your tribe', { fontSize: 24, fill: 0xffffff });
    this.tribeTitle.anchor.set(0.5);
    this.enemiesTitle = makeLabel('Enemies', { fontSize: 24, fill: 0xffffff });
    this.enemiesTitle.anchor.set(0.5);
    this.modeTitle = makeLabel('Mode', { fontSize: 24, fill: 0xffffff });
    this.modeTitle.anchor.set(0.5);

    for (const t of TRIBES) {
      const circle = new Graphics();
      circle.circle(0, 0, 28).fill(t.color);
      const label = makeLabel(t.name, { fontSize: 12, fill: 0xeeeeee });
      label.anchor.set(0.5, 0);
      label.position.set(0, 34);
      const item = new Container();
      item.addChild(circle, label);
      item.eventMode = 'static';
      item.cursor = 'pointer';
      item.on('pointertap', () => {
        this.tribe = t.id;
        this.refresh();
      });
      this.tribeItems.push(item);
      this.tribeCircles.push(circle);
      this.root.addChild(item);
    }

    for (const n of ENEMY_OPTIONS) {
      const b = new Button({
        label: String(n),
        width: 64,
        onClick: () => {
          this.enemies = n;
          this.refresh();
        },
      });
      this.enemyButtons.push(b);
      this.root.addChild(b);
    }

    for (const m of MODE_OPTIONS) {
      const b = new Button({
        label: GAME_MODE_NAMES[m],
        onClick: () => {
          useGameStore.getState().setMode(m);
          this.refresh();
        },
      });
      this.modeButtons.push(b);
      this.root.addChild(b);
    }

    this.startBtn = new Button({
      label: 'Start',
      onClick: () => gameController.startGame(this.tribe, this.enemies, useGameStore.getState().mode),
    });
    this.hint = makeLabel('↑/↓ switch · ←/→ change · Enter start', { fontSize: 12, fill: 0xeeeeee });
    this.hint.alpha = 0.7;
    this.hint.anchor.set(0.5);

    for (let i = 0; i < SELECTOR_COUNT; i++) {
      const g = new Graphics();
      g.visible = false;
      this.outlines.push(g);
      this.root.addChild(g);
    }

    this.root.addChild(this.tribeTitle, this.enemiesTitle, this.modeTitle, this.startBtn, this.hint);
    this.refresh();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => this.layout();

  private onKeyDown = (e: KeyboardEvent): void => {
    const store = useGameStore.getState();
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selector = (this.selector - 1 + SELECTOR_COUNT) % SELECTOR_COUNT;
      this.refresh();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selector = (this.selector + 1) % SELECTOR_COUNT;
      this.refresh();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.change(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.change(1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      gameController.startGame(this.tribe, this.enemies, store.mode);
    }
  };

  private change(dir: number): void {
    if (this.selector === 0) {
      const i = TRIBES.findIndex((t) => t.id === this.tribe);
      this.tribe = TRIBES[(i + dir + TRIBES.length) % TRIBES.length].id;
    } else if (this.selector === 1) {
      const i = ENEMY_OPTIONS.indexOf(this.enemies);
      this.enemies = ENEMY_OPTIONS[(i + dir + ENEMY_OPTIONS.length) % ENEMY_OPTIONS.length];
    } else {
      const store = useGameStore.getState();
      const i = MODE_OPTIONS.indexOf(store.mode);
      useGameStore.getState().setMode(MODE_OPTIONS[(i + dir + MODE_OPTIONS.length) % MODE_OPTIONS.length]);
    }
    this.refresh();
  }

  private refresh(): void {
    if (!this.root) return;
    const tribeIndex = TRIBES.findIndex((t) => t.id === this.tribe);
    const enemiesIndex = ENEMY_OPTIONS.indexOf(this.enemies);
    const modeIndex = MODE_OPTIONS.indexOf(useGameStore.getState().mode);
    this.tribeCircles.forEach((c, i) => {
      c.clear().circle(0, 0, 28).fill(TRIBES[i].color);
      if (i === tribeIndex) c.stroke({ width: 3, color: 0xffd700 });
    });
    this.enemyButtons.forEach((b, i) => {
      b.selected = i === enemiesIndex;
    });
    this.modeButtons.forEach((b, i) => {
      b.selected = i === modeIndex;
    });
    this.layout();
  }

  private layout(): void {
    if (!this.root || !this.host) return;
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;
    let y = h / 2 - 240;
    this.tribeTitle!.position.set(w / 2, y);
    this.tribeItems.forEach((item, i) => {
      item.position.set(w / 2 - (this.tribeItems.length / 2) * 92 + i * 92, y + 44);
    });
    this.enemiesTitle!.position.set(w / 2, y + 130);
    this.enemyButtons.forEach((b, i) => {
      b.position.set(w / 2 - 80 + i * 80, y + 180);
    });
    this.modeTitle!.position.set(w / 2, y + 250);
    this.modeButtons.forEach((b, i) => {
      b.position.set(w / 2 - 150 + i * 160, y + 300);
    });
    this.startBtn!.position.set(w / 2 - 60, y + 400);
    this.hint!.position.set(w / 2, y + 470);

    for (let i = 0; i < SELECTOR_COUNT; i++) {
      const g = this.outlines[i];
      g.clear();
      g.visible = i === this.selector;
      if (!g.visible) continue;
      if (i === 0) g.roundRect(w / 2 - (this.tribeItems.length / 2) * 92 - 10, y + 44 - 38, this.tribeItems.length * 92 + 20, 80, 4);
      if (i === 1) g.roundRect(w / 2 - 140, y + 180 - 30, 280, 60, 4);
      if (i === 2) g.roundRect(w / 2 - 200, y + 300 - 30, 400, 60, 4);
      g.stroke({ width: 2, color: 0xffd700 });
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    this.root?.destroy({ children: true });
    this.root = null;
    this.host = null;
    this.tribeItems = [];
    this.tribeCircles = [];
    this.enemyButtons = [];
    this.modeButtons = [];
    this.outlines = [];
    this.tribeTitle = null;
    this.enemiesTitle = null;
    this.modeTitle = null;
    this.startBtn = null;
    this.hint = null;
  }
}
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/SetupScreen.ts
git commit -m "feat: port setup screen to Pixi"
```

---

### Task 4: Lobby screen controller

**Files:**
- Create: `src/ui/screens/LobbyScreen.ts`

**Interfaces:**
- Consumes: `gameController.hostGame({mode,totalPlayers,aiCount,name,tribe})`, `gameController.joinGame(code,name)`, `gameController.pickHostTribe(tribe)`, `gameController.pickClientTribe(tribe)`, `gameController.readyUp()`, `gameController.startHostGame()`, `useGameStore`.
- Produces: class `LobbyScreen` implementing `ScreenController`.

Ports `src/screens/LobbyScreen.tsx` (menu / host form / join form / room view). Re-renders on `lobby`, `connection`, `myPeerId` store changes. Keystrokes in the text fields update only the relevant button's disabled state (never rebuild the whole screen, so the DOM input stays focused).

- [ ] **Step 1: Write the controller**

Create `src/ui/screens/LobbyScreen.ts`:

```ts
import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { TRIBES, type Tribe } from '../../game/tribes';
import { GAME_MODE_NAMES, type GameMode } from '../../game/gameMode';
import { type ScreenController, type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { TextInputOverlay } from '../kit/textInputOverlay';

type View = 'menu' | 'host' | 'join';

export class LobbyScreen implements ScreenController {
  private root: Container | null = null;
  private host: UIHost | null = null;
  private view: View = 'menu';
  private mode: GameMode = 'capture';
  private humans = 2;
  private aiCount = 1;
  private tribe: Tribe = TRIBES[0].id;
  private name = 'Player';
  private code = '';
  private inputs: TextInputOverlay[] = [];
  private createBtn: Button | null = null;
  private joinBtn: Button | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    host.screenLayer.addChild(this.root);
    this.render();
    this.unsub = useGameStore.subscribe(() => this.render());
    this.onResize = () => this.render();
    window.addEventListener('resize', this.onResize);
  }

  private render(): void {
    if (!this.root) return;
    for (const i of this.inputs) i.destroy();
    this.inputs = [];
    this.createBtn = null;
    this.joinBtn = null;
    while (this.root.children.length > 0) {
      this.root.removeChildAt(0).destroy({ children: true });
    }
    const s = useGameStore.getState();
    if (this.view === 'menu' && !s.lobby) this.renderMenu();
    else if (this.view === 'host' && !s.lobby) this.renderHost();
    else if (this.view === 'join' && !s.lobby) this.renderJoin();
    else this.renderRoom();
  }

  private title(text: string): void {
    const t = makeLabel(text, { fontSize: 24, fill: 0xffffff });
    t.anchor.set(0.5);
    t.position.set(this.host!.app.screen.width / 2, 48);
    this.root!.addChild(t);
  }

  private renderMenu(): void {
    this.title('Multiplayer');
    const cx = this.host!.app.screen.width / 2;
    const hostBtn = new Button({ label: 'Host game', width: 240, onClick: () => { this.view = 'host'; this.render(); } });
    const joinBtn = new Button({ label: 'Join game', width: 240, onClick: () => { this.view = 'join'; this.render(); } });
    const back = new Button({ label: 'Back', width: 240, onClick: () => useGameStore.getState().setScreen('start') });
    hostBtn.position.set(cx - 120, 160);
    joinBtn.position.set(cx - 120, 230);
    back.position.set(cx - 120, 300);
    this.root!.addChild(hostBtn, joinBtn, back);
  }

  private updateCreate(): void {
    if (this.createBtn) {
      this.createBtn.disabled = !(this.name.trim().length > 0 && this.humans + this.aiCount >= 2);
    }
  }

  private renderHost(): void {
    const cx = this.host!.app.screen.width / 2;
    this.title('Host game');
    let y = 110;

    const nameInput = new TextInputOverlay({
      x: cx - 100, y, width: 200, height: 34, value: this.name,
      onChange: (v) => { this.name = v; this.updateCreate(); },
    });
    this.inputs.push(nameInput);
    this.root!.addChild(nameInput.container);
    y += 60;

    const tribeLabel = makeLabel('Tribe', { fontSize: 16, fill: 0xffffff });
    tribeLabel.anchor.set(0.5);
    tribeLabel.position.set(cx, y);
    this.root!.addChild(tribeLabel);
    y += 46;
    TRIBES.forEach((t, i) => {
      const b = new Button({ label: t.name, width: 120, onClick: () => { this.tribe = t.id; this.render(); } });
      b.position.set(cx - 210 + i * 140, y);
      this.root!.addChild(b);
    });

    const humansLabel = makeLabel('Human players', { fontSize: 16, fill: 0xffffff });
    humansLabel.anchor.set(0.5);
    humansLabel.position.set(cx, y + 50);
    this.root!.addChild(humansLabel);
    [1, 2, 3, 4].forEach((n, i) => {
      const b = new Button({ label: String(n), width: 56, onClick: () => { this.humans = n; this.aiCount = Math.min(this.aiCount, 5 - n); this.render(); } });
      b.position.set(cx - 90 + i * 60, y + 100);
      this.root!.addChild(b);
    });

    const aiLabel = makeLabel('AI opponents', { fontSize: 16, fill: 0xffffff });
    aiLabel.anchor.set(0.5);
    aiLabel.position.set(cx, y + 150);
    this.root!.addChild(aiLabel);
    const maxAi = 5 - this.humans;
    Array.from({ length: maxAi }, (_, i) => i).forEach((n, i) => {
      const b = new Button({ label: String(n), width: 56, onClick: () => { this.aiCount = n; this.render(); } });
      b.position.set(cx - ((maxAi - 1) / 2) * 60 + i * 60, y + 200);
      this.root!.addChild(b);
    });

    const total = makeLabel(
      `Total: ${this.humans + this.aiCount} players (${this.humans} human${this.humans > 1 ? 's' : ''} + ${this.aiCount} AI)`,
      { fontSize: 14, fill: 0xeeeeee },
    );
    total.anchor.set(0.5);
    total.position.set(cx, y + 250);
    this.root!.addChild(total);

    const modeLabel = makeLabel('Mode', { fontSize: 16, fill: 0xffffff });
    modeLabel.anchor.set(0.5);
    modeLabel.position.set(cx, y + 300);
    this.root!.addChild(modeLabel);
    (['capture', 'turns30'] as GameMode[]).forEach((m, i) => {
      const b = new Button({ label: GAME_MODE_NAMES[m], width: 200, onClick: () => { this.mode = m; this.render(); } });
      b.position.set(cx - 220 + i * 240, y + 350);
      this.root!.addChild(b);
    });

    this.createBtn = new Button({
      label: 'Create room', width: 240,
      onClick: () => gameController.hostGame({ mode: this.mode, totalPlayers: this.humans + this.aiCount, aiCount: this.aiCount, name: this.name.trim(), tribe: this.tribe }),
    });
    const back = new Button({ label: 'Back', width: 240, onClick: () => { this.view = 'menu'; this.render(); } });
    this.createBtn.position.set(cx - 260, y + 420);
    back.position.set(cx + 20, y + 420);
    this.root!.addChild(this.createBtn, back);
    this.updateCreate();
  }

  private updateJoin(): void {
    if (this.joinBtn) {
      this.joinBtn.disabled = !(this.code.trim().length === 6 && this.name.trim().length > 0);
    }
  }

  private renderJoin(): void {
    const cx = this.host!.app.screen.width / 2;
    const s = useGameStore.getState();
    this.title('Join game');
    let y = 130;

    const codeInput = new TextInputOverlay({
      x: cx - 100, y, width: 200, height: 34, value: this.code,
      transform: (v) => v.toUpperCase(),
      onChange: (v) => { this.code = v; this.updateJoin(); },
    });
    this.inputs.push(codeInput);
    this.root!.addChild(codeInput.container);
    y += 60;

    const nameInput = new TextInputOverlay({
      x: cx - 100, y, width: 200, height: 34, value: this.name,
      onChange: (v) => { this.name = v; this.updateJoin(); },
    });
    this.inputs.push(nameInput);
    this.root!.addChild(nameInput.container);
    y += 60;

    this.joinBtn = new Button({ label: 'Join', width: 200, onClick: () => gameController.joinGame(this.code.trim(), this.name.trim()) });
    this.joinBtn.position.set(cx - 100, y);
    this.root!.addChild(this.joinBtn);
    this.updateJoin();
    y += 60;

    if (s.connection === 'connecting') {
      const c = makeLabel('Connecting...', { fontSize: 16, fill: 0xeeeeee });
      c.anchor.set(0.5);
      c.position.set(cx, y);
      this.root!.addChild(c);
      y += 30;
    } else if (s.connection === 'error') {
      const e = makeLabel('Connection failed', { fontSize: 16, fill: 0xc0392b });
      e.anchor.set(0.5);
      e.position.set(cx, y);
      this.root!.addChild(e);
      y += 30;
    }

    const back = new Button({ label: 'Back', width: 200, onClick: () => { this.view = 'menu'; this.render(); } });
    back.position.set(cx - 100, y);
    this.root!.addChild(back);
  }

  private renderRoom(): void {
    const s = useGameStore.getState();
    const lobby = s.lobby!;
    const cx = this.host!.app.screen.width / 2;
    const isHost = lobby.role === 'host';
    const joined = lobby.players;
    const humanSlots = Math.max(1, lobby.totalPlayers - lobby.aiCount);
    const canStart = joined.length === humanSlots && joined.every((p) => p.ready && p.tribeId !== null);
    const me = joined.find((p) => p.peerId === s.myPeerId);
    const taken = new Set(joined.map((p) => p.tribeId).filter((t): t is Tribe => t !== null));

    this.title(isHost ? 'Your room' : 'Room');
    const code = makeLabel(`Code: ${lobby.code}`, { fontSize: 18, fill: 0xffffff });
    code.anchor.set(0.5);
    code.position.set(cx, 90);
    this.root!.addChild(code);

    let y = 150;
    for (const p of joined) {
      const tribeName = p.tribeId !== null ? (TRIBES.find((t) => t.id === p.tribeId)?.name ?? '') : '';
      const row = makeLabel(
        `${p.name || '...'}${tribeName ? ` - ${tribeName}` : ''}${p.isHost ? ' (host)' : ''}${p.ready ? ' ✓ ready' : ''}`,
        { fontSize: 16, fill: 0xeeeeee },
      );
      row.anchor.set(0.5);
      row.position.set(cx, y);
      this.root!.addChild(row);
      y += 34;
    }
    y += 20;

    const tribeLabel = makeLabel('Your tribe', { fontSize: 16, fill: 0xffffff });
    tribeLabel.anchor.set(0.5);
    tribeLabel.position.set(cx, y);
    this.root!.addChild(tribeLabel);
    y += 50;
    const hostTribeId = joined.find((p) => p.isHost)?.tribeId ?? -1;
    const available = TRIBES.filter((t) => !taken.has(t.id) || t.id === hostTribeId);
    available.forEach((t, i) => {
      const b = new Button({
        label: t.name, width: 120,
        selected: t.id === hostTribeId,
        onClick: () => {
          if (isHost) gameController.pickHostTribe(t.id);
          else gameController.pickClientTribe(t.id);
        },
      });
      b.position.set(cx - ((available.length - 1) / 2) * 140 + i * 140, y);
      this.root!.addChild(b);
    });
    y += 70;

    if (isHost) {
      const start = new Button({ label: 'Start game', width: 240, disabled: !canStart, onClick: () => { void gameController.startHostGame(); } });
      start.position.set(cx - 120, y);
      this.root!.addChild(start);
      y += 60;
      if (!canStart) {
        const wait = makeLabel('Waiting for all players to be ready...', { fontSize: 14, fill: 0x888888 });
        wait.anchor.set(0.5);
        wait.position.set(cx, y);
        this.root!.addChild(wait);
      }
    } else {
      const isReady = me?.ready ?? false;
      const ready = new Button({ label: isReady ? 'Ready!' : "I'm ready", width: 240, disabled: !me || me.tribeId === null || isReady, onClick: () => gameController.readyUp() });
      ready.position.set(cx - 120, y);
      this.root!.addChild(ready);
      y += 60;
      if (me && me.tribeId === null) {
        const hint = makeLabel('Pick a tribe to become ready.', { fontSize: 14, fill: 0x888888 });
        hint.anchor.set(0.5);
        hint.position.set(cx, y);
        this.root!.addChild(hint);
      }
    }
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    for (const i of this.inputs) i.destroy();
    this.inputs = [];
    this.root?.destroy({ children: true });
    this.root = null;
    this.host = null;
  }
}
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/LobbyScreen.ts
git commit -m "feat: port lobby screen to Pixi"
```

---

### Task 5: Game screen controller + core HUD widgets

**Files:**
- Create: `src/ui/screens/GameScreen.ts`
- Create: `src/ui/hud/HudScore.ts`
- Create: `src/ui/hud/HudSkills.ts`
- Create: `src/ui/hud/HudTurn.ts`
- Create: `src/ui/hud/HudMoney.ts`
- Create: `src/ui/hud/HudPlayers.ts`

**Interfaces:**
- Consumes: `gameController.getMap()`, `totalScore` from `../../game/score`, `villageIncomeTotal` from `../../game/capture`, `buildingIncome` from `../../game/buildings`, `TRIBES`, `GAME_MODE_NAMES`, kit pieces, `useGameStore`, `UIHost`, `Widget`.
- Produces: class `GameScreen` implementing `ScreenController` (HUD part; map integration arrives in Task 10), and the five `Widget` classes.

- [ ] **Step 1: Write the GameScreen controller**

Create `src/ui/screens/GameScreen.ts`:

```ts
import { Container } from 'pixi.js';
import { type ScreenController, type UIHost, type Widget } from '../host';
import { HudScore } from '../hud/HudScore';
import { HudSkills } from '../hud/HudSkills';
import { HudTurn } from '../hud/HudTurn';
import { HudMoney } from '../hud/HudMoney';
import { HudPlayers } from '../hud/HudPlayers';

export class GameScreen implements ScreenController {
  private root: Container | null = null;
  private mapLayer: Container | null = null;
  private hud: Container | null = null;
  private widgets: Widget[] = [];
  private host: UIHost | null = null;

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    this.mapLayer = new Container();
    this.hud = new Container();
    this.root.addChild(this.mapLayer, this.hud);
    host.screenLayer.addChild(this.root);

    const widgets: Widget[] = [
      new HudScore(),
      new HudSkills(),
      new HudTurn(),
      new HudMoney(),
      new HudPlayers(),
    ];
    for (const w of widgets) w.mount(host, this.hud);
    this.widgets = widgets;
  }

  destroy(): void {
    for (const w of this.widgets) w.destroy();
    this.widgets = [];
    this.root?.destroy({ children: true });
    this.root = null;
    this.mapLayer = null;
    this.hud = null;
    this.host = null;
  }
}
```

- [ ] **Step 2: Write HudScore**

Create `src/ui/hud/HudScore.ts`:

```ts
import { Container, Graphics, Text } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { totalScore } from '../../game/score';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';

export class HudScore implements Widget {
  private el: Container | null = null;
  private text: Text | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private lastScore = 0;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const size = 64;
    const pad = 8;
    const bg = new Graphics();
    bg.circle(0, 0, size / 2).fill(0xd4a017);
    const hi = new Graphics();
    hi.circle(-size * 0.12, -size * 0.12, size * 0.42).fill(0xffe98a);
    hi.alpha = 0.55;
    const text = makeLabel('0', { fontSize: 24, fill: 0x1a1a2e, fontWeight: '800' });
    text.anchor.set(0.5);
    el.addChild(bg, hi, text);
    root.addChild(el);
    this.el = el;
    this.text = text;
    this.lastScore = this.readScore();
    this.layout();
    window.addEventListener('resize', this.layout);
    this.unsub = useGameStore.subscribe(() => this.update());
    this.update();
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const size = 64;
    const pad = 8;
    this.el.position.set(this.host.app.screen.width - pad - size / 2, pad + size / 2);
  };

  private readScore(): number {
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const human = s.players[s.localPlayerIndex];
    if (!human) return 0;
    return map ? totalScore(map, human) : human.score;
  }

  private update(): void {
    if (!this.text || !this.el) return;
    const score = this.readScore();
    if (score === this.lastScore) return;
    this.lastScore = score;
    this.text.text = String(score);
    this.bounce();
  }

  private bounce(): void {
    if (!this.host || !this.el) return;
    const start = performance.now();
    const fn = (): void => {
      const t = Math.min(1, (performance.now() - start) / 300);
      const s = 1 + 0.2 * Math.sin(t * Math.PI);
      this.el!.scale.set(s, s);
      if (t >= 1) {
        this.el!.scale.set(1, 1);
        this.host!.app.ticker.remove(fn);
      }
    };
    this.host.app.ticker.add(fn);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    window.removeEventListener('resize', this.layout);
    this.unsub = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.text = null;
    this.host = null;
  }
}
```

- [ ] **Step 3: Write HudSkills**

Create `src/ui/hud/HudSkills.ts`:

```ts
import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { Button } from '../kit/button';

export class HudSkills implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const btn = new Button({
      label: 'Skills',
      onClick: () => useGameStore.getState().setSkillTreeOpen(true),
    });
    this.el = btn;
    root.addChild(btn);
    this.layout();
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout(): void {
    if (!this.el || !this.host) return;
    const right = this.host.app.screen.width <= 600 ? 8 : 84;
    const top = this.host.app.screen.width <= 600 ? 58 : 22;
    this.el.position.set(this.host.app.screen.width - right - this.el.width, top);
  }

  destroy(): void {
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 4: Write HudTurn**

Create `src/ui/hud/HudTurn.ts`:

```ts
import { Container, Graphics, Text } from 'pixi.js';
import { GAME_MODE_NAMES } from '../../game/gameMode';
import { TRIBES } from '../../game/tribes';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';

export class HudTurn implements Widget {
  private el: Container | null = null;
  private text: Text | null = null;
  private panel: Graphics | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const panel = new Graphics();
    const text = makeLabel('', { fontSize: 13 });
    text.anchor.set(0, 0.5);
    el.addChild(panel, text);
    root.addChild(el);
    this.el = el;
    this.panel = panel;
    this.text = text;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const top = this.host.app.screen.width <= 600 ? 4 : 8;
    this.el.position.set(8, top);
  };

  private update(): void {
    if (!this.el || !this.text || !this.panel) return;
    const s = useGameStore.getState();
    const player = s.players[s.currentPlayerIndex];
    if (!player) {
      this.el.visible = false;
      return;
    }
    this.el.visible = true;
    const human = s.players[s.localPlayerIndex];
    const tribeName = human ? (TRIBES.find((t) => t.id === human.tribe)?.name ?? '') : '';
    const name = tribeName || player.name;
    const strike = player.isActive ? '' : '\u0336';
    this.text.text = `${GAME_MODE_NAMES[s.mode]}. Turn ${s.turn} — ${strike}${name}${strike}`;
    const padX = 12;
    const padY = 8;
    const w = this.text.width + padX * 2;
    const h = Math.max(this.text.height + padY * 2, 30);
    this.panel.clear().roundRect(0, 0, w, h, 4).fill({ color: 0x000000, alpha: 0.6 });
    this.text.position.set(padX, h / 2);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.text = null;
    this.panel = null;
    this.host = null;
  }
}
```

- [ ] **Step 5: Write HudMoney**

Create `src/ui/hud/HudMoney.ts`:

```ts
import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { villageIncomeTotal } from '../../game/capture';
import { buildingIncome } from '../../game/buildings';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';
import { makePanel } from '../kit/panel';

export class HudMoney implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private lastKey = '';
  private measured = 0;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const cx = this.host.app.screen.width / 2;
    const top = this.host.app.screen.width <= 600 ? 40 : 44;
    this.el.position.set(cx - this.measured / 2, top);
  };

  private resources(): { money: number; wood: number; stone: number; ore: number; moneyIncome: number; building: { wood: number; stone: number; ore: number } } {
    const s = useGameStore.getState();
    const human = s.players[s.localPlayerIndex];
    const map = gameController.getMap();
    const zero = { wood: 0, stone: 0, ore: 0 };
    if (!human) return { money: 0, wood: 0, stone: 0, ore: 0, moneyIncome: 0, building: zero };
    const moneyIncome = map ? villageIncomeTotal(map, human.index) : 0;
    const building = map ? buildingIncome(map, human) : zero;
    return { money: human.resources.money, wood: human.resources.wood, stone: human.resources.stone, ore: human.resources.ore, moneyIncome, building };
  }

  private update(): void {
    if (!this.el || !this.host) return;
    const r = this.resources();
    const key = [r.money, r.wood, r.stone, r.ore].join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.el.removeChildren();

    const iconSize = this.host.app.screen.width <= 600 ? 22 : 27;
    const fontSize = this.host.app.screen.width <= 600 ? 12 : 16;
    const rows = [
      { icon: 'coin.png', text: `${r.money}${r.moneyIncome > 0 ? ` (+${r.moneyIncome})` : ''}` },
      { icon: 'wood.png', text: `${r.wood}${r.building.wood > 0 ? ` (+${r.building.wood})` : ''}` },
      { icon: 'stone.png', text: `${r.stone}${r.building.stone > 0 ? ` (+${r.building.stone})` : ''}` },
      { icon: 'ore.png', text: `${r.ore}${r.building.ore > 0 ? ` (+${r.building.ore})` : ''}` },
    ];

    let x = 0;
    let maxH = 40;
    for (const row of rows) {
      const icon = makeIcon(row.icon, iconSize);
      icon.position.set(x + iconSize / 2 + 8, 20);
      const t = makeLabel(row.text, { fontSize });
      t.position.set(x + iconSize + 16, 20 - t.height / 2);
      this.el.addChild(icon, t);
      x += iconSize + 16 + t.width + 8;
      maxH = Math.max(maxH, t.height + 16);
    }
    this.measured = x;

    const bg = makePanel(x, maxH);
    bg.position.set(0, 0);
    this.el.addChildAt(bg, 0);
    this.layout();
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 6: Write HudPlayers**

Create `src/ui/hud/HudPlayers.ts`:

```ts
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { totalScore } from '../../game/score';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { makePanel } from '../kit/panel';

export class HudPlayers implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const top = this.host.app.screen.width <= 600 ? 44 : 52;
    this.el.position.set(8, top);
  };

  private update(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const ranked = [...s.players]
      .map((p) => ({ p, score: map ? totalScore(map, p) : p.score }))
      .sort((a, b) => b.score - a.score);

    this.el.removeChildren();
    let w = 0;
    let h = 0;
    const lineH = this.host.app.screen.width <= 600 ? 16 : 20;
    for (let i = 0; i < ranked.length; i++) {
      const { p, score } = ranked[i];
      const tribe = TRIBES.find((t) => t.id === p.tribe)!;
      const role = p.index === s.localPlayerIndex ? ' (you)' : p.isHuman ? '' : ' (AI)';
      const text = `${p.name} (${tribe.name})${role}: ${score} pts`;
      const t = makeLabel(text, { fontSize: this.host!.app.screen.width <= 600 ? 12 : 14, fill: tribe.color });
      if (!p.isActive) {
        const line = new Graphics();
        line.rect(0, -1, t.width, 2).fill(0x000000);
        line.alpha = 0.6;
        line.position.set(0, t.height / 2);
        t.addChild(line);
      }
      t.position.set(10, i * lineH);
      this.el.addChild(t);
      w = Math.max(w, t.width);
      h = (i + 1) * lineH;
    }
    w += 20;
    const bg = makePanel(w, h);
    bg.position.set(0, 0);
    this.el.addChildAt(bg, 0);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 7: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens/GameScreen.ts src/ui/hud/HudScore.ts src/ui/hud/HudSkills.ts src/ui/hud/HudTurn.ts src/ui/hud/HudMoney.ts src/ui/hud/HudPlayers.ts
git commit -m "feat: add game screen controller with core HUD widgets"
```

---

### Task 6: Selection, action toolbar, and end-turn HUD widgets

**Files:**
- Create: `src/ui/hud/HudSelected.ts`
- Create: `src/ui/hud/HudToolbar.ts`
- Create: `src/ui/hud/HudEndTurn.ts`
- Modify: `src/ui/screens/GameScreen.ts` (add the three widgets)

**Interfaces:**
- Consumes: `gameController` (`captureSelectedVillage`, `upgradeSelectedVillageFromToolbar`, `buildSelectedBuilding`, `buildSelectedRoad`, `healSelectedUnit`, `extractSelectedForest`, `upgradeSelectedShip`, `endTurn`, `getMap`), `tileAt`, `canAfford`, `UPGRADE_COST`, `canBuildFactory/Mine/Port`, `BUILDING_COSTS`, `canHeal`, `UNIT_TYPES`, `SHIP_UPGRADE_COST`, `canUpgradeShip`, `isForestType`, `EXTRACT_FOREST_COST`, `EXTRACT_FOREST_WOOD`, `unitsInVillage`, `villageCapacity`, `canBuildRoad`, `ROAD_COST`, `UNIT_TYPE_NAMES`, `attackDamage`, `unitCanAct`, `isExploredFor`, `TILE_TYPE_COLORS`/`TILE_TYPE_NAMES`, `BUILDING_NAMES`, `buildingYield`, `isLightColor`, `makePanel`, `makeLabel`, `useGameStore`, `Widget`, `UIHost`.

- [ ] **Step 1: Write the toolbar spec computation**

The toolbar button computation is pure logic. Create `src/ui/hud/toolbarSpecs.ts`:

```ts
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { tileAt } from '../../game/selection';
import { canAfford, UPGRADE_COST } from '../../game/resources';
import { canBuildFactory, canBuildMine, canBuildPort, BUILDING_COSTS } from '../../game/buildings';
import { canHeal, UNIT_TYPES } from '../../game/units';
import { SHIP_UPGRADE_COST, canUpgradeShip } from '../../game/ship';
import { isForestType } from '../../game/tileTypes';
import { EXTRACT_FOREST_COST, EXTRACT_FOREST_WOOD } from '../../game/extract';
import { unitsInVillage, villageCapacity } from '../../game/village';
import { canBuildRoad, ROAD_COST } from '../../game/roads';

export interface ToolbarSpec {
  key: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}

export function toolbarSpecs(): ToolbarSpec[] {
  const store = useGameStore.getState();
  const selection = store.selection;
  const map = gameController.getMap();
  if (!selection || !map) return [];
  const tile = tileAt(map, selection.q, selection.r);
  const player = store.players[store.localPlayerIndex];
  if (!tile || !player) return [];

  const out: ToolbarSpec[] = [];
  const unit = tile.unit;
  const settlement = tile.settlement;

  if (settlement) {
    const isOwned = settlement.owner === store.localPlayerIndex;
    const isCapturable = !isOwned && unit !== null && unit.owner === store.localPlayerIndex && settlement.captureReady;
    if (isCapturable) {
      out.push({ key: 'capture', label: 'Capture village!', disabled: false, onClick: () => gameController.captureSelectedVillage() });
    }
    if (isOwned) {
      const minPrice = Math.min(...Object.values(UNIT_TYPES).map((t) => t.price));
      const spawnDisabled = !!tile.unit || unitsInVillage(map, tile) >= villageCapacity(settlement.level) || player.resources.money < minPrice;
      if (!spawnDisabled) {
        out.push({ key: 'spawn', label: 'Spawn', disabled: false, onClick: () => useGameStore.getState().setSpawnDialogOpen(true) });
      }
      const upgradeDisabled = !canAfford(player.resources, UPGRADE_COST);
      if (!upgradeDisabled) {
        out.push({ key: 'upgrade', label: 'Upgrade village', disabled: false, onClick: () => gameController.upgradeSelectedVillageFromToolbar() });
      }
    }
  }

  if (settlement === null) {
    const kinds: Array<{ kind: 'factory' | 'mine' | 'port'; label: string }> = [
      { kind: 'factory', label: 'Build factory (10)' },
      { kind: 'mine', label: 'Build mine (15)' },
      { kind: 'port', label: 'Build port (10w, 30, 2 ore)' },
    ];
    for (const { kind, label } of kinds) {
      const ok = kind === 'factory'
        ? canBuildFactory(map, tile, player)
        : kind === 'mine'
          ? canBuildMine(map, tile, player)
          : canBuildPort(map, tile, player);
      if (!ok) continue;
      out.push({ key: kind, label, disabled: !canAfford(player.resources, BUILDING_COSTS[kind]), onClick: () => gameController.buildSelectedBuilding(kind) });
    }
    if (canBuildRoad(map, tile, player)) {
      out.push({ key: 'road', label: 'Build a road (2w, 1s)', disabled: !canAfford(player.resources, ROAD_COST), onClick: () => gameController.buildSelectedRoad() });
    }
  }

  if (unit && unit.owner === store.localPlayerIndex) {
    if (canHeal(unit)) {
      out.push({ key: 'heal', label: 'Heal +2 HP', disabled: false, onClick: () => gameController.healSelectedUnit() });
    }
    if (isForestType(tile.terrain) && tile.ownedBy === store.localPlayerIndex) {
      const affordable = canAfford(player.resources, { wood: 0, stone: 0, money: EXTRACT_FOREST_COST, ore: 0 });
      out.push({ key: 'extract', label: `Extract forest (${EXTRACT_FOREST_COST} money → ${EXTRACT_FOREST_WOOD} wood)`, disabled: !affordable, onClick: () => gameController.extractSelectedForest() });
    }
    if (unit.shipLevel !== undefined && unit.shipLevel < 3) {
      const cost = SHIP_UPGRADE_COST[(unit.shipLevel + 1) as 2 | 3];
      const upgradable = canUpgradeShip(unit, tile, player);
      const oreText = cost.ore > 0 ? ` + ${cost.ore} ore` : '';
      out.push({ key: 'upgrade-ship', label: `Upgrade ship (${cost.money} money + ${cost.wood} wood${oreText})`, disabled: !upgradable, onClick: () => gameController.upgradeSelectedShip() });
    }
  }

  return out;
}
```

- [ ] **Step 2: Write HudSelected**

Create `src/ui/hud/HudSelected.ts`:

```ts
import { Container, Text } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { TILE_TYPE_COLORS, TILE_TYPE_NAMES } from '../../game/tileTypes';
import { UNIT_TYPE_NAMES, UNIT_TYPES } from '../../game/units';
import { unitCanAct } from '../../game/unitActions';
import { tileAt } from '../../game/selection';
import { attackDamage } from '../../game/combat';
import { villageCapacity, unitsInVillage } from '../../game/village';
import { buildingYield, BUILDING_NAMES } from '../../game/buildings';
import { isExploredFor } from '../../game/explore';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { makePanel } from '../kit/panel';
import { isLightColor } from '../kit/theme';

export class HudSelected implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private measured = 0;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const bottom = this.host.app.screen.width <= 600 ? 76 : 16;
    this.el.position.set(16, this.host.app.screen.height - bottom - this.measured);
  };

  private update(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const selection = s.selection;
    const map = gameController.getMap();
    if (!selection || !map) {
      this.el.visible = false;
      return;
    }
    const tile = tileAt(map, selection.q, selection.r);
    const human = s.players[s.localPlayerIndex];
    if (!tile || !human || !isExploredFor(tile, human.index)) {
      this.el.visible = false;
      return;
    }
    this.el.visible = true;

    this.el.removeChildren();

    const terrainColor = TILE_TYPE_COLORS[tile.terrain];
    const darkText = isLightColor(terrainColor);
    const lines: string[] = [TILE_TYPE_NAMES[tile.terrain]];
    const bolds: boolean[] = [false];

    if (tile.unit) {
      const unit = tile.unit;
      const player = s.players[unit.owner];
      const tribe = TRIBES.find((t) => t.id === player.tribe)!;
      const villageName = unit.spawnVillage
        ? tileAt(map, unit.spawnVillage.q, unit.spawnVillage.r)?.settlement?.name ?? '—'
        : '—';
      const maxHp = UNIT_TYPES[unit.type].maxHp;
      const canAct = unitCanAct(map, tile, unit, player);
      lines.push(`${UNIT_TYPE_NAMES[unit.type]} (${tribe.name})`);
      bolds.push(true);
      lines.push(`HP: ${unit.hp}/${maxHp}${canAct ? ' •' : ''}`);
      bolds.push(false);
      lines.push(`Damage: ${attackDamage(unit)}`);
      bolds.push(false);
      lines.push(`Village: ${villageName}`);
      bolds.push(false);
    }

    if (tile.settlement) {
      const settlement = tile.settlement;
      const ownerName = settlement.owner !== null ? s.players[settlement.owner].name : 'Free';
      lines.push(`${settlement.name ?? 'Settlement'}`);
      bolds.push(true);
      lines.push(`Level: ${settlement.level}`);
      bolds.push(false);
      lines.push(`Population: ${unitsInVillage(map, tile)}/${villageCapacity(settlement.level)}`);
      bolds.push(false);
      lines.push(`Owner: ${ownerName}`);
      bolds.push(false);
    }

    if (tile.building) {
      const b = tile.building;
      const owner = tile.ownedBy !== null ? s.players[tile.ownedBy] : null;
      const y = buildingYield(map, tile, owner);
      lines.push(`${BUILDING_NAMES[b.kind]} (level ${b.level})`);
      bolds.push(true);
      if (y.wood > 0 || y.stone > 0 || y.ore > 0) {
        lines.push(`Produces: wood ${y.wood}, stone ${y.stone}, ore ${y.ore}`);
        bolds.push(false);
      }
    }

    let maxW = 0;
    const lineH = 18;
    for (let i = 0; i < lines.length; i++) {
      const t = makeLabel(lines[i], { fontSize: 13, fill: darkText ? 0x111111 : 0xeeeeee, fontWeight: bolds[i] ? '700' : undefined });
      t.position.set(10, 8 + i * lineH);
      this.el.addChild(t);
      maxW = Math.max(maxW, t.width);
    }
    this.measured = 8 + lines.length * lineH + 8;

    const bg = makePanel(maxW + 20, this.measured, { fill: terrainColor, alpha: 0.75 });
    bg.position.set(0, 0);
    this.el.addChildAt(bg, 0);
    this.layout();
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 3: Write HudToolbar**

Create `src/ui/hud/HudToolbar.ts`:

```ts
import { Container } from 'pixi.js';
import { type UIHost, type Widget } from '../host';
import { Button } from '../kit/button';
import { toolbarSpecs } from './toolbarSpecs';

export class HudToolbar implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const bottom = this.host.app.screen.width <= 600 ? 8 : 16;
    this.el.position.set(
      this.host.app.screen.width / 2 - this.el.width / 2,
      this.host.app.screen.height - bottom - this.el.height,
    );
  };

  private update(): void {
    if (!this.el) return;
    this.el.removeChildren();
    const specs = toolbarSpecs();
    if (specs.length === 0) {
      this.el.visible = false;
      return;
    }
    this.el.visible = true;
    let x = 0;
    for (const spec of specs) {
      const btn = new Button({ label: spec.label, disabled: spec.disabled, onClick: spec.onClick, paddingX: 10, paddingY: 6, fontSize: 14 });
      btn.position.set(x, 0);
      this.el.addChild(btn);
      x += btn.width + 8;
    }
    this.layout();
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 4: Write HudEndTurn**

Create `src/ui/hud/HudEndTurn.ts`:

```ts
import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { Button } from '../kit/button';

export class HudEndTurn implements Widget {
  private btn: Button | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const btn = new Button({ label: 'End turn', onClick: () => gameController.endTurn() });
    root.addChild(btn);
    this.btn = btn;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.btn || !this.host) return;
    const bottom = this.host.app.screen.width <= 600 ? 8 : 16;
    this.btn.position.set(this.host.app.screen.width - this.btn.width - bottom, this.host.app.screen.height - this.btn.height - bottom);
  };

  private update(): void {
    if (!this.btn) return;
    this.btn.disabled = useGameStore.getState().aiActive;
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.btn?.destroy({ children: true });
    this.btn = null;
    this.host = null;
  }
}
```

- [ ] **Step 5: Wire the three widgets into GameScreen**

Edit `src/ui/screens/GameScreen.ts` — add imports:

```ts
import { HudSelected } from '../hud/HudSelected';
import { HudToolbar } from '../hud/HudToolbar';
import { HudEndTurn } from '../hud/HudEndTurn';
```

and add to the `widgets` array:

```ts
      new HudSelected(),
      new HudToolbar(),
      new HudEndTurn(),
```

- [ ] **Step 6: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/hud/toolbarSpecs.ts src/ui/hud/HudSelected.ts src/ui/hud/HudToolbar.ts src/ui/hud/HudEndTurn.ts src/ui/screens/GameScreen.ts
git commit -m "feat: add selection, toolbar and end-turn HUD widgets"
```

---

### Task 7: Overlay manager + popup/dialog overlays

**Files:**
- Create: `src/ui/overlays/OverlayManager.ts`
- Create: `src/ui/overlays/PopupStack.ts`
- Create: `src/ui/overlays/CenterMessage.ts`
- Create: `src/ui/overlays/ConfirmDialog.ts`
- Create: `src/ui/overlays/ShipLandingDialog.ts`
- Create: `src/ui/overlays/SpawnDialog.ts`

**Interfaces:**
- Consumes: `dismissPopup` from `../../ui/popupQueue`, `gameController` (`confirmAttack`, `cancelAttack`, `confirmShipLanding`, `cancelShipLanding`, `spawnSelectedVillage`, `getMap`), `UNIT_TYPES`, `UNIT_TYPE_NAMES`, `UNIT_IMAGE_FILES`, `tileAt`, `hasSkill`, `TRIBES`, `makeIcon`, kit pieces, `useGameStore`, `UIHost`.
- Produces: class `OverlayManager` (constructor `(host: UIHost)`), classes `PopupStack`, `CenterMessage`, `ConfirmDialog`, `ShipLandingDialog`, `SpawnDialog` each with `mount(host, root)` / `destroy()`.

OverlayManager refreshes all overlay visibility on any store change; game-scoped overlays are only shown while `store.screen === 'game'`.

- [ ] **Step 1: Write the overlay manager**

Create `src/ui/overlays/OverlayManager.ts`:

```ts
import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { PopupStack } from './PopupStack';
import { CenterMessage } from './CenterMessage';
import { ConfirmDialog } from './ConfirmDialog';
import { ShipLandingDialog } from './ShipLandingDialog';
import { SpawnDialog } from './SpawnDialog';
import { SkillTree } from './SkillTree';
import { GameOver } from './GameOver';

interface Overlay {
  mount(host: UIHost, root: Container): void;
  destroy(): void;
}

interface Entry {
  make: () => Overlay;
  mounted: Overlay | null;
}

export class OverlayManager {
  private readonly host: UIHost;
  private readonly root: Container;
  private readonly entries: Record<string, Entry> = {
    popup: { make: () => new PopupStack(), mounted: null },
    center: { make: () => new CenterMessage(), mounted: null },
    confirm: { make: () => new ConfirmDialog(), mounted: null },
    ship: { make: () => new ShipLandingDialog(), mounted: null },
    spawn: { make: () => new SpawnDialog(), mounted: null },
    skill: { make: () => new SkillTree(), mounted: null },
    gameover: { make: () => new GameOver(), mounted: null },
  };
  private unsub: (() => void) | null = null;

  constructor(host: UIHost) {
    this.host = host;
    this.root = new Container();
    host.overlayLayer.addChild(this.root);
    this.unsub = useGameStore.subscribe(() => this.refresh());
    this.refresh();
  }

  private active(): Set<string> {
    const s = useGameStore.getState();
    const inGame = s.screen === 'game';
    const active = new Set<string>();
    if (s.popups.length > 0) active.add('popup');
    if (s.centerMessage !== null) active.add('center');
    if (inGame && s.pendingAttack !== null) active.add('confirm');
    if (inGame && s.pendingShipLanding !== null) active.add('ship');
    if (inGame && s.spawnDialogOpen) active.add('spawn');
    if (inGame && s.skillTreeOpen) active.add('skill');
    if (inGame && s.gameOver && s.winnerIndex !== null) active.add('gameover');
    return active;
  }

  refresh(): void {
    const active = this.active();
    for (const key of Object.keys(this.entries)) {
      const entry = this.entries[key];
      const shouldShow = active.has(key);
      if (shouldShow && !entry.mounted) {
        entry.mounted = entry.make();
        entry.mounted.mount(this.host, this.root);
      } else if (!shouldShow && entry.mounted) {
        entry.mounted.destroy();
        entry.mounted = null;
      }
    }
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    for (const key of Object.keys(this.entries)) {
      if (this.entries[key].mounted) {
        this.entries[key].mounted!.destroy();
        this.entries[key].mounted = null;
      }
    }
    this.root.destroy({ children: true });
  }
}
```

> Note: `OverlayManager` references `SkillTree` and `GameOver`, which are created as stubs in Step 7 below so typecheck passes; Task 8 and Task 9 replace those stubs with real implementations.

- [ ] **Step 2: Write PopupStack**

Create `src/ui/overlays/PopupStack.ts`:

```ts
import { Container, Graphics } from 'pixi.js';
import { dismissPopup } from '../popupQueue';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { makeLabel } from '../kit/label';
import { parseHexColor } from '../kit/theme';

export class PopupStack {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.render();
    this.unsub = useGameStore.subscribe(() => this.render());
  }

  private render(): void {
    if (!this.el || !this.host) return;
    const popups = useGameStore.getState().popups;
    this.el.removeChildren();
    const gap = 16;
    let y = 0;
    for (const p of popups) {
      const row = new Container();
      const text = makeLabel(p.text, { fontSize: 12, fill: 0xffffff });
      const close = makeLabel('\u2715', { fontSize: 14, fill: 0xffffff });
      const w = 10 + text.width + 6 + close.width + 10;
      const h = Math.max(text.height + 10, 26);
      const bg = new Graphics();
      bg.roundRect(0, 0, w, h, 4).fill(parseHexColor(p.background));
      bg.eventMode = 'static';
      bg.cursor = 'pointer';
      bg.on('pointertap', () => dismissPopup(p.id));
      close.eventMode = 'static';
      close.cursor = 'pointer';
      close.on('pointertap', () => dismissPopup(p.id));
      text.position.set(10, h / 2 - text.height / 2);
      close.position.set(10 + text.width + 6, h / 2 - close.height / 2);
      row.addChild(bg, text, close);
      row.position.set(0, y);
      this.el.addChild(row);
      y += h + gap;
    }
    this.el.position.set(10, this.host.app.screen.height / 2 - y / 2);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 3: Write CenterMessage**

Create `src/ui/overlays/CenterMessage.ts`:

```ts
import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { makeLabel } from '../kit/label';
import { makePanel } from '../kit/panel';

const MESSAGE_MS = 1000;

export class CenterMessage {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const message = useGameStore.getState().centerMessage;
    if (message === null) return;
    const el = new Container();
    const text = makeLabel(message, { fontSize: 28, fill: 0xffffff });
    const w = text.width + 64;
    const h = text.height + 32;
    const bg = makePanel(w, h, { fill: 0x000000, alpha: 0.85 });
    bg.position.set(-w / 2, -h / 2);
    text.anchor.set(0.5);
    el.addChild(bg, text);
    el.position.set(host.app.screen.width / 2, host.app.screen.height / 2);
    root.addChild(el);
    this.el = el;
    this.timer = setTimeout(() => {
      useGameStore.getState().setCenterMessage(null);
    }, MESSAGE_MS);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 4: Write ConfirmDialog**

Create `src/ui/overlays/ConfirmDialog.ts`:

```ts
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { UNIT_TYPE_NAMES } from '../../game/units';
import { tileAt } from '../../game/selection';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';

export class ConfirmDialog {
  private el: Container | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    if (!map || !s.pendingAttack) return;
    const tile = tileAt(map, s.pendingAttack.q, s.pendingAttack.r);
    if (!tile || !tile.unit) return;
    const enemy = tile.unit;
    const owner = s.players[enemy.owner];
    const tribe = TRIBES.find((t) => t.id === owner.tribe)!;

    const el = new Container();
    const backdrop = new Graphics();
    backdrop.rect(0, 0, host.app.screen.width, host.app.screen.height).fill({ color: 0x000000, alpha: 0.5 });
    backdrop.eventMode = 'static';

    const card = new Container();
    const title = makeLabel(`Attack ${owner.name}'s ${UNIT_TYPE_NAMES[enemy.type]}?`, { fontSize: 16, fill: 0xffffff });
    const confirm = new Button({ label: 'Confirm', onClick: () => gameController.confirmAttack() });
    const cancel = new Button({ label: 'Cancel', onClick: () => gameController.cancelAttack() });
    const w = Math.max(title.width, confirm.width + cancel.width + 8) + 32;
    const h = 16 + title.height + 12 + 34 + 16;
    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 8).fill(0x000000);
    title.position.set(w / 2 - title.width / 2, 16);
    confirm.position.set(w / 2 - confirm.width - 4, 16 + title.height + 12);
    cancel.position.set(w / 2 + 4, 16 + title.height + 12);
    card.addChild(bg, title, confirm, cancel);
    card.position.set(host.app.screen.width / 2 - w / 2, host.app.screen.height / 2 - h / 2);

    el.addChild(backdrop, card);
    root.addChild(el);
    this.el = el;
  }

  destroy(): void {
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 5: Write ShipLandingDialog**

Create `src/ui/overlays/ShipLandingDialog.ts`:

```ts
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { UNIT_TYPE_NAMES } from '../../game/units';
import { tileAt } from '../../game/selection';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';

export class ShipLandingDialog {
  private el: Container | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const selection = s.selection;
    if (!map || !s.pendingShipLanding || !selection) return;
    const tile = tileAt(map, selection.q, selection.r);
    if (!tile || !tile.unit) return;

    const el = new Container();
    const backdrop = new Graphics();
    backdrop.rect(0, 0, host.app.screen.width, host.app.screen.height).fill({ color: 0x000000, alpha: 0.5 });
    backdrop.eventMode = 'static';

    const card = new Container();
    const title = makeLabel(`Move to land and become a ${UNIT_TYPE_NAMES[tile.unit.type]} again?`, { fontSize: 16, fill: 0xffffff });
    const confirm = new Button({ label: 'Confirm', onClick: () => gameController.confirmShipLanding() });
    const cancel = new Button({ label: 'Cancel', onClick: () => gameController.cancelShipLanding() });
    const w = Math.max(title.width, confirm.width + cancel.width + 8) + 32;
    const h = 16 + title.height + 12 + 34 + 16;
    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 8).fill(0x000000);
    title.position.set(w / 2 - title.width / 2, 16);
    confirm.position.set(w / 2 - confirm.width - 4, 16 + title.height + 12);
    cancel.position.set(w / 2 + 4, 16 + title.height + 12);
    card.addChild(bg, title, confirm, cancel);
    card.position.set(host.app.screen.width / 2 - w / 2, host.app.screen.height / 2 - h / 2);

    el.addChild(backdrop, card);
    root.addChild(el);
    this.el = el;
  }

  destroy(): void {
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 6: Write SpawnDialog**

Create `src/ui/overlays/SpawnDialog.ts`:

```ts
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { hasSkill } from '../../game/skills';
import { tileAt } from '../../game/selection';
import { UNIT_IMAGE_FILES, UNIT_TYPES, UNIT_TYPE_NAMES, type UnitType } from '../../game/units';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';

export class SpawnDialog {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private reasonFor: UnitType | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.reasonFor = null;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const selection = s.selection;
    if (!map || !selection) return;
    const village = tileAt(map, selection.q, selection.r);
    const player = s.players[s.localPlayerIndex];
    if (!village || !village.settlement || !player) return;

    const el = new Container();
    const backdrop = new Graphics();
    backdrop.rect(0, 0, host.app.screen.width, host.app.screen.height).fill({ color: 0x000000, alpha: 0.5 });
    backdrop.eventMode = 'static';
    backdrop.on('pointertap', () => useGameStore.getState().setSpawnDialogOpen(false));

    el.addChild(backdrop);
    el.addChild(this.drawCard(s));
    root.addChild(el);
    this.el = el;
  }

  private reasons(type: UnitType): string[] {
    const s = useGameStore.getState();
    const player = s.players[s.localPlayerIndex];
    const info = UNIT_TYPES[type];
    const out: string[] = [];
    if (!player) return out;
    if (player.resources.money < info.price) out.push(`Not enough money — need ${info.price}, have ${player.resources.money}`);
    if (info.priceOre > 0 && player.resources.ore < info.priceOre) out.push(`Not enough ore — need ${info.priceOre}, have ${player.resources.ore}`);
    if (type === 'swordsman' && !hasSkill(player, 'swordsman')) out.push('Requires the Swordsman skill');
    return out;
  }

  private drawCard(s: ReturnType<typeof useGameStore.getState>): Container {
    const host = this.host!;
    const card = new Container();
    card.eventMode = 'static';
    card.on('pointertap', () => {});

    const types = Object.keys(UNIT_TYPES) as UnitType[];
    const cellW = 92;
    const cellH = 112;
    const cols = Math.min(types.length, host.app.screen.width <= 600 ? 2 : 4);
    const rows = Math.ceil(types.length / cols);
    const cardW = cols * cellW + 32;
    const cardH = 16 + 24 + 12 + rows * cellH + 16;
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, cardH, 8).fill(0x000000);
    card.addChild(bg);

    const title = makeLabel('Spawn a unit', { fontSize: 16, fill: 0xffffff });
    title.position.set(16, 12);
    card.addChild(title);

    const close = makeLabel('\u2715', { fontSize: 16, fill: 0xffffff });
    close.position.set(cardW - 28, 10);
    close.eventMode = 'static';
    close.cursor = 'pointer';
    close.on('pointertap', () => useGameStore.getState().setSpawnDialogOpen(false));
    card.addChild(close);

    types.forEach((type, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const item = new Container();
      item.position.set(16 + col * cellW, 52 + row * cellH);
      item.eventMode = 'static';
      item.cursor = 'pointer';

      const circle = new Graphics();
      circle.circle(30, 30, 30).fill(0x333333).stroke({ width: 2, color: 0x888888 });
      item.addChild(circle);

      const icon = makeIcon(UNIT_IMAGE_FILES[type], 56);
      icon.position.set(30, 30);
      item.addChild(icon);

      const name = makeLabel(UNIT_TYPE_NAMES[type], { fontSize: 12, fill: 0xeeeeee });
      name.position.set(30 - name.width / 2, 66);
      item.addChild(name);

      const info = UNIT_TYPES[type];
      const oreText = info.priceOre > 0 ? ` + ${info.priceOre} ore` : '';
      const price = makeLabel(`${info.price}${oreText}`, { fontSize: 12, fill: 0xeeeeee });
      price.position.set(30 - price.width / 2, 84);
      item.addChild(price);

      const reasons = this.reasons(type);
      const disabled = reasons.length > 0;
      item.alpha = disabled ? 0.4 : 1;
      item.on('pointertap', () => {
        if (disabled) {
          this.reasonFor = type;
          this.rebuildCard();
        } else {
          gameController.spawnSelectedVillage(type);
        }
      });
      card.addChild(item);
    });

    if (this.reasonFor !== null) {
      const r = this.reasons(this.reasonFor);
      const modal = new Container();
      modal.eventMode = 'static';
      modal.on('pointertap', () => {});
      const modalW = 340;
      const modalH = 24 + r.length * 22 + 12 + 34 + 16;
      const mbg = new Graphics();
      mbg.roundRect(0, 0, modalW, modalH, 8).fill(0x111111);
      modal.addChild(mbg);
      const name = makeLabel(UNIT_TYPE_NAMES[this.reasonFor], { fontSize: 16, fill: 0xffffff, fontWeight: '700' });
      name.position.set(16, 12);
      modal.addChild(name);
      r.forEach((reason, i) => {
        const t = makeLabel(reason, { fontSize: 14, fill: 0xcccccc });
        t.position.set(16, 40 + i * 22);
        modal.addChild(t);
      });
      const ok = new Button({ label: 'OK', width: 120, onClick: () => { this.reasonFor = null; this.rebuildCard(); } });
      ok.position.set(modalW / 2 - 60, 24 + r.length * 22 + 12);
      modal.addChild(ok);
      modal.position.set(host.app.screen.width / 2 - modalW / 2, host.app.screen.height / 2 - modalH / 2);
      card.addChild(modal);
      return card;
    }

    card.position.set(host.app.screen.width / 2 - cardW / 2, host.app.screen.height / 2 - cardH / 2);
    return card;
  }

  private rebuildCard(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    while (this.el.children.length > 1) {
      this.el.removeChildAt(1).destroy({ children: true });
    }
    this.el.addChild(this.drawCard(s));
  }

  destroy(): void {
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
    this.reasonFor = null;
  }
}
```

- [ ] **Step 7: Create stub SkillTree and GameOver so OverlayManager compiles**

Create `src/ui/overlays/SkillTree.ts`:

```ts
import { Container } from 'pixi.js';
import { type UIHost } from '../host';

export class SkillTree {
  private el: Container | null = null;

  mount(host: UIHost, root: Container): void {
    void host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
  }

  destroy(): void {
    this.el?.destroy({ children: true });
    this.el = null;
  }
}
```

Create `src/ui/overlays/GameOver.ts`:

```ts
import { Container } from 'pixi.js';
import { type UIHost } from '../host';

export class GameOver {
  private el: Container | null = null;

  mount(host: UIHost, root: Container): void {
    void host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
  }

  destroy(): void {
    this.el?.destroy({ children: true });
    this.el = null;
  }
}
```

- [ ] **Step 8: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add src/ui/overlays
git commit -m "feat: add overlay manager and popup/dialog overlays"
```

---

### Task 8: Skill tree overlay (replace stub)

**Files:**
- Modify: `src/ui/overlays/SkillTree.ts` (replace the stub with the full implementation)

**Interfaces:**
- Consumes: `SKILLS`, `hasSkill`, `canOpenSkill`, `skillCost`, `SkillId` from `../../game/skills`, `type Player` from `../../game/players`, `TRIBES`, `gameController.openSkill(id)`, `useGameStore`, kit pieces, `UIHost`.
- Produces: full `SkillTree` class.

Ports `src/screens/SkillTreeScreen.tsx` (ring layout, node click → detail modal, Escape back/close, resources line). Ring math (ringOrder/skillPosition/POS) is reused verbatim.

- [ ] **Step 1: Write the full skill tree**

Replace the entire contents of `src/ui/overlays/SkillTree.ts` with:

```ts
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { SKILLS, hasSkill, canOpenSkill, skillCost, type SkillId } from '../../game/skills';
import { type Player } from '../../game/players';
import { TRIBES } from '../../game/tribes';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';

const RING_SPACING = 110;
const CX = 400;
const CY = 340;
const MAX_LEVEL = Math.max(...Object.values(SKILLS).map((s) => s.level));

function ringOrder(level: number): SkillId[] {
  if (level === 1) {
    return (Object.keys(SKILLS) as SkillId[]).filter((id) => SKILLS[id].level === 1);
  }
  const prev = ringOrder(level - 1);
  const out: SkillId[] = [];
  for (const p of prev) {
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      if (SKILLS[id].level === level && SKILLS[id].parent === p) out.push(id);
    }
  }
  return out;
}

function skillPosition(id: SkillId): { x: number; y: number } {
  const level = SKILLS[id].level;
  const order = ringOrder(level);
  const index = order.indexOf(id);
  const count = order.length;
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  const r = level * RING_SPACING;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

const POS = Object.fromEntries(
  (Object.keys(SKILLS) as SkillId[]).map((id) => [id, skillPosition(id)]),
) as Record<SkillId, { x: number; y: number }>;

export class SkillTree {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private selected: SkillId | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, host.app.screen.width, host.app.screen.height).fill(0x1a1a2e);
    el.addChild(bg);
    root.addChild(el);
    this.el = el;
    this.selected = null;
    this.build();
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (this.selected !== null) {
      this.selected = null;
      this.build();
    } else {
      useGameStore.getState().setSkillTreeOpen(false);
    }
  };

  private build(): void {
    if (!this.el || !this.host) return;
    const host = this.host;
    while (this.el.children.length > 1) {
      this.el.removeChildAt(1).destroy({ children: true });
    }
    const human = useGameStore.getState().players[useGameStore.getState().localPlayerIndex];
    if (!human) {
      this.el.visible = false;
      return;
    }
    this.el.visible = true;
    const tribe = TRIBES.find((t) => t.id === human.tribe)!;

    const title = makeLabel('Skill tree', { fontSize: 24, fill: 0xffffff, fontWeight: '700' });
    title.anchor.set(0.5);
    title.position.set(host.app.screen.width / 2, 24);
    this.el.addChild(title);

    const res = makeLabel(
      `Money: ${human.resources.money}  Wood: ${human.resources.wood}  Stone: ${human.resources.stone}  Ore: ${human.resources.ore}`,
      { fontSize: 14, fill: 0xffd700 },
    );
    res.anchor.set(0.5);
    res.position.set(host.app.screen.width / 2, 60);
    this.el.addChild(res);

    const scale = Math.min(host.app.screen.width / 900, host.app.screen.height / 760, 1);
    const ring = new Container();
    ring.scale.set(scale);
    ring.position.set(host.app.screen.width / 2 - CX * scale, host.app.screen.height / 2 - CY * scale);
    this.el.addChild(ring);

    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const opened = hasSkill(human, id);
      const parent = SKILLS[id].parent;
      const p = parent ? POS[parent] : { x: CX, y: CY };
      const c = POS[id];
      const line = new Graphics();
      line.moveTo(p.x, p.y).lineTo(c.x, c.y).stroke({ width: opened ? 4 : 2, color: opened ? 0xff8c00 : 0x555555 });
      ring.addChild(line);
    }

    const rootCircle = new Graphics();
    rootCircle.circle(CX, CY, 34).fill(tribe.color).stroke({ width: 3, color: 0xffffff });
    ring.addChild(rootCircle);
    const rootName = makeLabel(tribe.name, { fontSize: 12, fill: 0xffffff });
    rootName.anchor.set(0.5);
    rootName.position.set(CX, CY);
    ring.addChild(rootName);

    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const pos = POS[id];
      const opened = hasSkill(human, id);
      const node = new Container();
      node.eventMode = 'static';
      node.cursor = 'pointer';
      node.on('pointertap', () => {
        this.selected = id;
        this.build();
      });
      const circle = new Graphics();
      circle.circle(pos.x, pos.y, 28).fill(opened ? 0xff8c00 : 0x555555).stroke({ width: opened ? 5 : 2, color: opened ? 0xff8c00 : 0x333333 });
      node.addChild(circle);
      const l = makeLabel(opened ? '\u2713' : String(skillCost(id)), { fontSize: 12, fill: 0xffffff });
      l.anchor.set(0.5);
      l.position.set(pos.x, pos.y);
      node.addChild(l);
      const name = makeLabel(SKILLS[id].name, { fontSize: 13, fill: 0xeeeeee });
      name.anchor.set(0.5);
      name.position.set(pos.x, pos.y + 50);
      node.addChild(name);
      ring.addChild(node);
    }

    const close = new Button({ label: 'Close', onClick: () => useGameStore.getState().setSkillTreeOpen(false) });
    close.position.set(host.app.screen.width / 2 - close.width / 2, host.app.screen.height - 60);
    this.el.addChild(close);

    if (this.selected !== null) this.drawDetail(human);
  }

  private drawDetail(human: Player): void {
    if (!this.el || !this.host || this.selected === null) return;
    const host = this.host;
    const id = this.selected;
    const info = SKILLS[id];
    const opened = hasSkill(human, id);
    const parent = info.parent;
    const parentName = parent ? SKILLS[parent].name : null;

    const lines: string[] = [];
    if (opened) {
      lines.push('Opened');
    } else {
      lines.push(`Cost: ${skillCost(id)} money`);
      if (parentName && !hasSkill(human, parent!)) lines.push(`Requires: ${parentName}`);
    }

    const modalW = 340;
    const modalH = 12 + 30 + lines.length * 20 + 12 + 40 + 16;
    const modal = new Container();
    modal.eventMode = 'static';
    modal.on('pointertap', () => {});

    const bg = new Graphics();
    bg.roundRect(0, 0, modalW, modalH, 8).fill(0x000000);
    modal.addChild(bg);

    const name = makeLabel(info.name, { fontSize: 18, fill: 0xff8c00, fontWeight: '700' });
    name.position.set(16, 12);
    modal.addChild(name);

    const desc = makeLabel(info.description, { fontSize: 14, fill: 0xcccccc });
    desc.position.set(16, 46);
    modal.addChild(desc);

    let y = 66 + Math.max(0, Math.ceil(desc.width / (modalW - 32)) - 1) * 18;
    for (const line of lines) {
      const t = makeLabel(line, { fontSize: 14, fill: 0xcccccc });
      t.position.set(16, y);
      modal.addChild(t);
      y += 20;
    }
    const close = new Button({ label: 'Close', onClick: () => { this.selected = null; this.build(); } });
    if (!opened) {
      const open = new Button({ label: 'Open', disabled: !canOpenSkill(human, id), onClick: () => { gameController.openSkill(id); this.selected = null; this.build(); } });
      open.position.set(16, y);
      modal.addChild(open);
      close.position.set(modalW - close.width - 16, y);
    } else {
      close.position.set(modalW / 2 - close.width / 2, y);
    }
    modal.addChild(close);
    modal.position.set(host.app.screen.width / 2 - modalW / 2, host.app.screen.height / 2 - modalH / 2);
    this.el.addChild(modal);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
    this.selected = null;
  }
}
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/overlays/SkillTree.ts
git commit -m "feat: add skill tree overlay"
```

---

### Task 9: Game over overlay (replace stub)

**Files:**
- Modify: `src/ui/overlays/GameOver.ts` (replace the stub with the full implementation)

**Interfaces:**
- Consumes: `gameController.getMap()`, `totalScore` from `../../game/score`, `TRIBES`, `GAME_MODE_NAMES`, `useGameStore`, kit pieces, `UIHost`.
- Produces: full `GameOver` class.

Ports `src/screens/GameOverScreen.tsx` (winner banner, mode, bonus, ranked scores, Play again / Main menu).

- [ ] **Step 1: Write the game over overlay**

Replace the entire contents of `src/ui/overlays/GameOver.ts` with:

```ts
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { totalScore } from '../../game/score';
import { GAME_MODE_NAMES } from '../../game/gameMode';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';

export class GameOver {
  private el: Container | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    if (s.winnerIndex === null) return;
    const map = gameController.getMap();
    const winner = s.players[s.winnerIndex];
    if (!winner) return;
    const tribe = TRIBES.find((t) => t.id === winner.tribe)!;

    const el = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, host.app.screen.width, host.app.screen.height).fill({ color: 0x0a0a14, alpha: 0.92 });
    el.addChild(bg);

    const ranked = [...s.players]
      .map((p) => ({ p, score: map ? totalScore(map, p) : p.score }))
      .sort((a, b) => b.score - a.score);

    let y = host.app.screen.height / 2 - (ranked.length / 2) * 34 - 60;

    const banner = makeLabel(`${winner.name} (${tribe.name}) wins!`, { fontSize: 32, fill: tribe.color, fontWeight: '800' });
    banner.anchor.set(0.5);
    banner.position.set(host.app.screen.width / 2, y);
    el.addChild(banner);
    y += 44;

    const mode = makeLabel(`Mode: ${GAME_MODE_NAMES[s.mode]}`, { fontSize: 16, fill: 0xcccccc });
    mode.anchor.set(0.5);
    mode.position.set(host.app.screen.width / 2, y);
    el.addChild(mode);
    y += 30;

    if (s.bonusAwarded) {
      const bonus = makeLabel('Fast-win bonus awarded!', { fontSize: 16, fill: 0xffd700 });
      bonus.anchor.set(0.5);
      bonus.position.set(host.app.screen.width / 2, y);
      el.addChild(bonus);
      y += 30;
    }

    const scores = new Container();
    ranked.forEach(({ p, score }, i) => {
      const rowTribe = TRIBES.find((t) => t.id === p.tribe)!;
      const t = makeLabel(`${p.name}: ${score} pts (kills: ${p.kills})`, { fontSize: 16, fill: rowTribe.color });
      t.position.set(0, i * 34);
      scores.addChild(t);
    });
    scores.position.set(host.app.screen.width / 2, y);
    scores.children.forEach((c) => {
      const child = c as { width: number; position: { x: number; y: number } };
      child.position.set(-child.width / 2, child.position.y);
    });
    el.addChild(scores);

    const again = new Button({ label: 'Play again', width: 180, onClick: () => useGameStore.getState().setScreen('setup') });
    const menu = new Button({ label: 'Main menu', width: 180, onClick: () => useGameStore.getState().setScreen('start') });
    again.position.set(host.app.screen.width / 2 - 190, y + ranked.length * 34 + 20);
    menu.position.set(host.app.screen.width / 2 + 10, y + ranked.length * 34 + 20);
    el.addChild(again, menu);

    root.addChild(el);
    this.el = el;
  }

  destroy(): void {
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/overlays/GameOver.ts
git commit -m "feat: add game over overlay"
```

---

### Task 10: gameController refactor + interim React wiring

**Files:**
- Modify: `src/controller/gameController.ts`
- Modify: `src/screens/GameScreen.tsx`
- Modify: `src/ui/screens/GameScreen.ts`
- Modify: `tests/lifecycle.test.ts`

**Interfaces:**
- Consumes: existing `gameController` internals (unchanged sim/events/camera logic).
- Produces: `gameController.init(app: Application, root: Container): void`, `gameController.shutdown(): void`. React `GameScreen.tsx` still works (creates the app itself), and the Pixi `GameScreen` controller mounts the map via `gameController.init(host.app, this.mapLayer)`.

Goal: `gameController` no longer creates/destroys the `Application`; it renders into a passed Pixi `Container`.

- [ ] **Step 1: Add the `mapRoot` field**

Edit `src/controller/gameController.ts` — after `private app: Application | null = null;` add:

```ts
  private mapRoot: Container | null = null;
```

- [ ] **Step 2: Replace `init`**

Edit `src/controller/gameController.ts` — replace the whole `init(container: HTMLElement): void` method with:

```ts
  init(app: Application, root: Container): void {
    if (this.mapRoot) return;
    this.app = app;
    this.mapRoot = root;
    const token = ++this.initToken;
    const pending = useGameStore.getState().pendingSnapshot;
    if (pending) {
      useGameStore.getState().setPendingSnapshot(null);
      if (!this.sim) {
        this.sim = Simulator.fromSnapshot(pending);
        this.sim.drainEvents();
      }
    }
    if (this.sim) {
      this.applyFitToScreen();
      void createTextures(app, this.sim.map, HEX_SIZE * this.qualityFactor).then((textures) => {
        if (token !== this.initToken || !this.mapRoot) return;
        this.textures = textures;
        this.render();
        this.presentPendingClientEvents();
      });
    }
  }
```

- [ ] **Step 3: Replace `destroy` with `shutdown`**

Edit `src/controller/gameController.ts` — replace the whole `destroy(): void` method with:

```ts
  shutdown(): void {
    this.stopCameraAnimation();
    this.initToken++;
    this.stopInertia();
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    window.removeEventListener('pointerup', this.onWindowUpPointer);
    window.removeEventListener('pointercancel', this.onWindowUpPointer);
    this.pointers.clear();
    this.pinchActive = false;
    if (this.mapView) {
      this.mapView.destroy();
      this.mapView = null;
    }
    this.overlayItems = [];
    this.mapRoot = null;
    this.app = null;
  }
```

- [ ] **Step 4: Render the map into `mapRoot`**

Edit `src/controller/gameController.ts` — in `render()`, replace:

```ts
      this.app.stage.addChild(this.mapView.container);
      this.app.stage.addChild(this.mapView.overlay);
```

with:

```ts
      this.mapRoot!.addChild(this.mapView.container);
      this.mapRoot!.addChild(this.mapView.overlay);
```

- [ ] **Step 5: Attach transient effects to `mapRoot`**

Edit `src/controller/gameController.ts` — replace each of the three `this.app.stage.addChild(el)` occurrences (in `spawnScoreFly`, `spawnFloatText`, `spawnFogReveal`) with `this.mapRoot!.addChild(el);`, and each of the three `this.app?.stage.removeChild(el)` occurrences with `this.mapRoot?.removeChild(el);`.

- [ ] **Step 6: Guard `presentPendingClientEvents`**

Edit `src/controller/gameController.ts` — change the first line of `presentPendingClientEvents` from `if (!this.app) return;` to `if (!this.app || !this.mapRoot) return;`.

- [ ] **Step 7: Update the React GameScreen to own the app**

Edit `src/screens/GameScreen.tsx`:
- Add at the top: `import { Application } from 'pixi.js';`
- Replace the `useEffect` body with:

```tsx
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const a = new Application();
      await a.init({
        resizeTo: window,
        background: '#1a1a2e',
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
      });
      if (cancelled) {
        a.destroy(true);
        return;
      }
      if (containerRef.current) containerRef.current.appendChild(a.canvas);
      gameController.init(a, a.stage);
    })();
    return () => {
      cancelled = true;
      gameController.shutdown();
    };
  }, []);
```

- [ ] **Step 8: Wire the map into the Pixi GameScreen controller**

Edit `src/ui/screens/GameScreen.ts` — in `mount`, after `host.screenLayer.addChild(this.root);`, add:

```ts
    gameController.init(host.app, this.mapLayer!);
```

- [ ] **Step 9: Update the lifecycle test**

Edit `tests/lifecycle.test.ts` — update the second test:

```ts
  it('shutdown preserves the simulator so init can re-render after a remount', () => {
    gameController.startGame(TRIBES[0].id, 1, 'capture');
    const sim = gameController.getSim();
    expect(sim).not.toBeNull();

    gameController.shutdown();
    expect(gameController.getSim()).toBe(sim);
  });
```

- [ ] **Step 10: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 11: Manual smoke test (React still booting)**

Run: `npm run dev` — start a single-player game and confirm the map still renders, pans, zooms, and units move exactly as before (confirms the refactor didn't regress the live path).

- [ ] **Step 12: Commit**

```bash
git add src/controller/gameController.ts src/screens/GameScreen.tsx src/ui/screens/GameScreen.ts tests/lifecycle.test.ts
git commit -m "refactor: gameController renders into a passed container"
```

---

### Task 11: ScreenManager boot, remove React, config cleanup

**Files:**
- Create: `src/ui/ScreenManager.ts`
- Create: `src/main.ts`
- Delete: `src/main.tsx`, `src/App.tsx`
- Delete: all files under `src/screens/` (`GameOverScreen.tsx`, `GameScreen.tsx`, `LobbyScreen.tsx`, `SetupScreen.tsx`, `SkillTreeScreen.tsx`, `StartScreen.tsx`, `src/screens/hud/*`)
- Delete: all files under `src/ui/` except `popupQueue.ts` (`CenterMessage.tsx`, `ConfirmDialog.tsx`, `PopupStack.tsx`, `ShipLandingDialog.tsx`, `SpawnDialog.tsx`)
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`

**Interfaces:**
- Consumes: all controllers/overlays from Tasks 1–10.
- Produces: `main.ts` boot → `ScreenManager`. After this task the app boots entirely from Pixi; React is gone.

- [ ] **Step 1: Write ScreenManager**

Create `src/ui/ScreenManager.ts`:

```ts
import { Application, Container } from 'pixi.js';
import { useGameStore, type Screen } from '../store/gameStore';
import { type ScreenController, type UIHost } from './host';
import { StartScreen } from './screens/StartScreen';
import { SetupScreen } from './screens/SetupScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { OverlayManager } from './overlays/OverlayManager';

const SCREENS: Record<Screen, new () => ScreenController> = {
  start: StartScreen,
  setup: SetupScreen,
  lobby: LobbyScreen,
  game: GameScreen,
};

export class ScreenManager implements UIHost {
  readonly app: Application;
  readonly screenLayer: Container;
  readonly overlayLayer: Container;
  private current: ScreenController | null = null;
  private readonly unsub: () => void;
  private readonly overlays: OverlayManager;

  constructor(app: Application) {
    this.app = app;
    app.stage.sortableChildren = true;
    this.screenLayer = new Container();
    this.screenLayer.zIndex = 1;
    this.overlayLayer = new Container();
    this.overlayLayer.zIndex = 2;
    app.stage.addChild(this.screenLayer);
    app.stage.addChild(this.overlayLayer);
    this.overlays = new OverlayManager(this);
    this.unsub = useGameStore.subscribe((state, prev) => {
      if (state.screen !== prev.screen) this.switchTo(state.screen);
    });
    this.switchTo(useGameStore.getState().screen);
  }

  private switchTo(screen: Screen): void {
    if (this.current) {
      this.current.destroy();
      this.screenLayer.removeChildren();
    }
    const ctor = SCREENS[screen];
    this.current = new ctor();
    this.current.mount(this);
  }

  destroy(): void {
    this.unsub();
    this.current?.destroy();
    this.overlays.destroy();
  }
}
```

- [ ] **Step 2: Write main.ts**

Create `src/main.ts`:

```ts
import { Application } from 'pixi.js';
import { ScreenManager } from './ui/ScreenManager';

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#1a1a2e',
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  });
  document.getElementById('root')!.appendChild(app.canvas);
  new ScreenManager(app);
}

void boot();
```

- [ ] **Step 3: Remove React dependencies**

Edit `package.json`:
- `dependencies`: remove `react` and `react-dom`.
- `devDependencies`: remove `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`.

- [ ] **Step 4: Remove the React plugin from vite config**

Replace the entire `vite.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/hex/',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
```

- [ ] **Step 5: Drop the jsx option from tsconfig**

Edit `tsconfig.json` — remove the `"jsx": "react-jsx"` line.

- [ ] **Step 6: Point index.html at main.ts**

Edit `index.html` — replace `<script type="module" src="/src/main.tsx"></script>` with `<script type="module" src="/src/main.ts"></script>`.

- [ ] **Step 7: Delete the React files**

```bash
rm src/main.tsx src/App.tsx
rm src/screens/GameOverScreen.tsx src/screens/GameScreen.tsx src/screens/LobbyScreen.tsx src/screens/SetupScreen.tsx src/screens/SkillTreeScreen.tsx src/screens/StartScreen.tsx
rm src/screens/hud/ActionToolbar.tsx src/screens/hud/EndTurnButton.tsx src/screens/hud/MoneyInfo.tsx src/screens/hud/PlayersList.tsx src/screens/hud/ScoreInfo.tsx src/screens/hud/SelectedInfo.tsx src/screens/hud/TurnInfo.tsx
rm src/ui/CenterMessage.tsx src/ui/ConfirmDialog.tsx src/ui/PopupStack.tsx src/ui/ShipLandingDialog.tsx src/ui/SpawnDialog.tsx
rmdir src/screens/hud src/screens 2>/dev/null || true
```

- [ ] **Step 8: Install deps and verify**

Run: `npm install && npm run typecheck && npm test`
Expected: typecheck and all tests pass; `react` no longer appears in `package.json`.

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: production build succeeds with no React references.

- [ ] **Step 10: Full manual smoke test**

Run: `npm run dev` and verify every flow:
1. Start screen: ↑/↓ + Enter and mouse click both advance to Setup and Lobby.
2. Setup: switch tribe/enemies/mode with keyboard and mouse; Enter starts a game.
3. In-game HUD: score badge, skills button, turn info, money row, players list, selected info, action toolbar, end-turn button all render and update.
4. Popups appear/dismiss; center "Your turn!" shows; attack confirm and ship-landing dialogs work; spawn dialog spawns units and shows the reason modal for unaffordable units.
5. Skill tree opens, node detail modal opens, skill opens when affordable; Escape/Close work.
6. End turn → AI plays → your turn notification.
7. Win/lose → game over screen → Play again (setup) and Main menu (start).
8. Multiplayer: host lobby (type name, pick tribe/humans/AI/mode, create room), room view updates; join flow with code.
9. Resize the window and verify HUD elements reposition; check a mobile-sized viewport (≤600px) for the responsive positions.
10. Client-join mid-session path: start a game before the host sends state (`pendingSnapshot`) still works.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: boot from Pixi, remove React UI"
```

---

## Self-review notes

- **Spec coverage:** Task 1 = widget kit + theme; Task 2–4 = Start/Setup/Lobby screens; Task 5–6 = GameScreen HUD (score/skills/turn/money/players/selected/toolbar/end-turn); Task 7–9 = popups, center message, confirm/ship/spawn dialogs, skill tree, game over; Task 10 = `gameController` refactor (init/shutdown, mapRoot) + lifecycle test update; Task 11 = ScreenManager + main.ts boot, React removal, config cleanup. Every spec section maps to a task.
- **Type consistency:** `UIHost`, `ScreenController`, `Widget` are defined once in `src/ui/host.ts` (Task 1) and consumed everywhere. `gameController.init(app, root)` / `shutdown()` are introduced in Task 10 and used by both the React interim (`GameScreen.tsx`) and the Pixi `GameScreen`. Overlay classes consistently expose `mount(host, root)` / `destroy()`. Task 7 creates stub `SkillTree`/`GameOver` (referenced by `OverlayManager`); Tasks 8–9 replace the stubs in place, so imports never break.
- **Known intentional simplifications (within "faithful port" scope):** `HudTurn` uses a Unicode combining-strikethrough (`\u0336`) instead of CSS `line-through`; mobile breakpoint positions (≤600px) are applied in the HUD widgets; the skill-tree detail modal renders over the tree without a separate dimmed backdrop; the confirm/ship dialogs ignore backdrop clicks (matching the original JSX, where only buttons react). All verified manually in Task 11.
