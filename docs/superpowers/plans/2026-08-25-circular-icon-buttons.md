# Circular Icon Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the upgrade, heal, and end-turn toolbar controls as circular icon buttons using `upgrade.png` / `heal.png` / `end-turn.png`, with hover and press effects.

**Architecture:** A new reusable `IconButton` kit component (circle background + texture sprite) mirrors the existing `Button` interactions (hover brighten + ring, press scale, disabled). `HudToolbar` uses it for the `upgrade` and `heal` actions and for `End turn`; all other controls stay text `Button`s.

**Tech Stack:** TypeScript, PixiJS 8, Vite, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass at the end of every task.
- Do NOT modify `src/game/**`, `src/net/**`, `src/store/**`.
- Assets `public/textures/upgrade.png`, `heal.png`, `end-turn.png` are already present — do not modify.
- No new `.tsx` files; no React imports.

---

### Task 1: `IconButton` kit component

**Files:**
- Create: `src/ui/kit/iconButton.ts`

**Interfaces:**
- Consumes: `makeIcon` from `./icon`, `THEME` from `./theme`.
- Produces: `IconButtonOpts` (`{ icon: string; onClick: () => void; size?: number; disabled?: boolean; onReady?: () => void }`) and `class IconButton extends Container` with `disabled` getter/setter. `.width`/`.height` derive from the drawn circle bounds (equal to `size`).

- [ ] **Step 1: Write the component**

Create `src/ui/kit/iconButton.ts`:

```ts
import { Container, Graphics, Sprite } from 'pixi.js';
import { makeIcon } from './icon';
import { THEME } from './theme';

export interface IconButtonOpts {
  icon: string;
  onClick: () => void;
  size?: number;
  disabled?: boolean;
  onReady?: () => void;
}

export class IconButton extends Container {
  private readonly bg: Graphics;
  private readonly sprite: Sprite;
  private readonly size: number;
  private readonly onClick: () => void;
  private _disabled = false;

  constructor(opts: IconButtonOpts) {
    super();
    this.onClick = opts.onClick;
    this.size = opts.size ?? 36;
    this.bg = new Graphics();
    this.bg.circle(this.size / 2, this.size / 2, this.size / 2).fill(THEME.button);
    const iconSize = this.size * 0.6;
    this.sprite = makeIcon(opts.icon, iconSize, () => opts.onReady?.());
    this.sprite.position.set(this.size / 2, this.size / 2);
    this.addChild(this.bg, this.sprite);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', this.onOver);
    this.on('pointerout', this.onOut);
    this.on('pointerdown', this.onDown);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.onUp);
    this.on('pointertap', this.onTap);
    this.disabled = opts.disabled ?? false;
  }

  private redraw(fill: number, ring: boolean): void {
    this.bg.clear().circle(this.size / 2, this.size / 2, this.size / 2).fill(fill);
    if (ring) this.bg.stroke({ width: 2, color: THEME.highlight });
  }

  private onOver = (): void => {
    if (!this._disabled) this.redraw(THEME.buttonHover, true);
  };
  private onOut = (): void => {
    if (!this._disabled) this.redraw(THEME.button, false);
  };
  private onDown = (): void => {
    if (!this._disabled) this.scale.set(0.92);
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
    if (v) this.redraw(THEME.button, false);
  }
}
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/kit/iconButton.ts
git commit -m "feat: add circular icon button kit component"
```

---

### Task 2: Toolbar integration

**Files:**
- Modify: `src/ui/hud/HudToolbar.ts`

**Interfaces:**
- Consumes: `IconButton` from `../kit/iconButton`, `toolbarSpecs()`, `gameController.endTurn`, store `aiActive`.
- Produces: upgrade/heal rendered as `IconButton`s in the left group; end-turn rendered as an `IconButton` in the right group; all other controls unchanged.

- [ ] **Step 1: Import the component and add the icon map**

Edit `src/ui/hud/HudToolbar.ts`:

- Add the import:

```ts
import { IconButton } from '../kit/iconButton';
```

- Add a module-level map after the imports:

```ts
const ICON_ACTIONS: Record<string, string> = {
  upgrade: 'upgrade.png',
  heal: 'heal.png',
};
```

- [ ] **Step 2: Render upgrade/heal as icon buttons**

Edit `src/ui/hud/HudToolbar.ts` — replace the action loop in `update()`:

```ts
    for (const spec of actions) {
      const btn = new Button({ label: spec.label, disabled: spec.disabled, onClick: spec.onClick, paddingX: 10, paddingY: 6, fontSize: 14 });
      btn.position.set(x, barY);
      this.el.addChild(btn);
      x += btn.width + 8;
    }
```

with:

```ts
    for (const spec of actions) {
      const iconFile = ICON_ACTIONS[spec.key];
      if (iconFile) {
        const btn = new IconButton({ icon: iconFile, disabled: spec.disabled, onClick: spec.onClick });
        btn.position.set(x, barY);
        this.el.addChild(btn);
        x += btn.width + 8;
      } else {
        const btn = new Button({ label: spec.label, disabled: spec.disabled, onClick: spec.onClick, paddingX: 10, paddingY: 6, fontSize: 14 });
        btn.position.set(x, barY);
        this.el.addChild(btn);
        x += btn.width + 8;
      }
    }
```

- [ ] **Step 3: Render End turn as an icon button**

Edit `src/ui/hud/HudToolbar.ts` — replace the right-group construction:

```ts
    const stats = new Button({ label: 'Stats', onClick: () => useGameStore.getState().setStatsOpen(true), paddingX: 12, paddingY: 6, fontSize: 14 });
    const endTurn = new Button({ label: 'End turn', disabled: store.aiActive, onClick: () => gameController.endTurn(), paddingX: 12, paddingY: 6, fontSize: 14 });
    endTurn.position.set(w - 12 - stats.width - 8 - endTurn.width, barY);
    stats.position.set(w - 12 - stats.width, barY);
    this.el.addChild(endTurn, stats);
```

with:

```ts
    const stats = new Button({ label: 'Stats', onClick: () => useGameStore.getState().setStatsOpen(true), paddingX: 12, paddingY: 6, fontSize: 14 });
    const endTurn = new IconButton({ icon: 'end-turn.png', disabled: store.aiActive, onClick: () => gameController.endTurn() });
    endTurn.position.set(w - 12 - stats.width - 8 - endTurn.width, barY);
    stats.position.set(w - 12 - stats.width, barY);
    this.el.addChild(endTurn, stats);
```

- [ ] **Step 4: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/hud/HudToolbar.ts
git commit -m "feat: render upgrade, heal, and end-turn as circular icon buttons"
```

---

## Self-review notes

- **Spec coverage:** Section 1 (`IconButton` component) → Task 1; Section 2 (toolbar integration for upgrade/heal/end-turn) → Task 2.
- **Type consistency:** `IconButton` is defined in Task 1 (`src/ui/kit/iconButton.ts`, exports `IconButton` and `IconButtonOpts`) and consumed in Task 2. The icon map keys match the action keys emitted by `toolbarSpecs()` (`upgrade`, `heal`).
- **Manual smoke test (final, in a browser):**
  1. Selecting an owned village shows a circular upgrade icon; selecting a damaged unit shows a circular heal icon.
  2. End turn is a circular icon, dimmed during AI turns.
  3. Hover brightens the circle + gold ring; press scales to 0.92; disabled icons don't react.
  4. Icons sit in the same row as the text buttons.
