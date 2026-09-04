# HP Bar Position and Resource Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the unit HP bar/label 20px and add a hover/click tooltip to the money-panel resource icons.

**Architecture:** A one-line offset change in `mapRenderer`; a pure data module `resourceTooltips.ts`; a reusable `Tooltip` kit class owning its own timers (500ms show on hover, immediate show on click, 500ms hide on mouse-out, immediate hide on outside click); `HudMoney` wires the four icons to one shared `Tooltip`.

**Tech Stack:** TypeScript, PixiJS 8 (`Container`, `Graphics`, `Text`), Vitest (node env, `vi.useFakeTimers()`), Vite.

## Global Constraints

- No game-logic changes.
- Reuse existing kit helpers: `makeLabel`, `makePanel`.
- Tooltip box: `radius 6`, fill `#000000` alpha `0.8`; triangle `#000000` alpha `0.8` on the top edge, tip pointing up at the icon (tooltip appears below the icon).
- In node tests, Pixi text measurement needs a canvas: override `Text.prototype.width`/`height` getters to fixed values before exercising layout.
- Do not stage unrelated files.
- `tests/setup.ts` already stubs `Image` (from `FakeImage`) and `window`.

---
### Task 1: Raise the unit HP bar and label 20px

**Files:**
- Modify: `src/render/mapRenderer.ts:569`

- [ ] **Step 1: Implement**

In `addHpBar`, change:

```ts
    const up = -10;
```

to:

```ts
    const up = -30;
```

This shifts the HP bar, fill, `hp/maxHp` label + background, and the can-act dot together.

- [ ] **Step 2: Typecheck and run the full suite**

Run: `npm run typecheck` — no errors.
Run: `npm test` — all pass.

- [ ] **Step 3: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: raise unit hp bar and label 20px"
```

---
### Task 2: Resource tooltip content data

**Files:**
- Create: `src/ui/hud/resourceTooltips.ts`
- Test: `tests/resourceTooltips.test.ts`

**Interfaces:**
- Produces: `RESOURCE_TOOLTIPS: Record<'money' | 'wood' | 'stone' | 'ore', { name: string; requiredFor: string }>`. Task 4 consumes this; the rendered tooltip line is `Required for ${requiredFor}`.

- [ ] **Step 1: Write the failing test**

Create `tests/resourceTooltips.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RESOURCE_TOOLTIPS } from '../src/ui/hud/resourceTooltips';

describe('RESOURCE_TOOLTIPS', () => {
  it('defines a name and required-for text for every resource', () => {
    expect(RESOURCE_TOOLTIPS.money.name).toBe('Money');
    expect(RESOURCE_TOOLTIPS.wood.name).toBe('Wood');
    expect(RESOURCE_TOOLTIPS.stone.name).toBe('Stone');
    expect(RESOURCE_TOOLTIPS.ore.name).toBe('Ore');
    for (const key of ['money', 'wood', 'stone', 'ore'] as const) {
      expect(RESOURCE_TOOLTIPS[key].requiredFor.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resourceTooltips.test.ts`
Expected: FAIL — module `resourceTooltips` does not exist.

- [ ] **Step 3: Implement**

Create `src/ui/hud/resourceTooltips.ts`:

```ts
export interface ResourceTooltipInfo {
  name: string;
  requiredFor: string;
}

export const RESOURCE_TOOLTIPS: Record<'money' | 'wood' | 'stone' | 'ore', ResourceTooltipInfo> = {
  money: { name: 'Money', requiredFor: 'spawning units, upgrading villages, building factories, mines and ports, opening skills, and upgrading ships.' },
  wood: { name: 'Wood', requiredFor: 'upgrading villages, building ports and roads, and upgrading ships.' },
  stone: { name: 'Stone', requiredFor: 'upgrading villages and building roads.' },
  ore: { name: 'Ore', requiredFor: 'spawning swordsmen, building ports, and upgrading ships to level 3.' },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/resourceTooltips.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/hud/resourceTooltips.ts tests/resourceTooltips.test.ts
git commit -m "feat: add resource tooltip content data"
```

---
### Task 3: `Tooltip` kit component

**Files:**
- Create: `src/ui/kit/tooltip.ts`
- Test: `tests/tooltip.test.ts`

**Interfaces:**
- Produces:
  - `new Tooltip(stage: Container)`
  - `el: Container` (visible=false until shown)
  - `showFor(target: Container, title: string, text: string): void` — show immediately
  - `showForAfter(target: Container, title: string, text: string, ms: number): void` — show after `ms`
  - `hideAfter(ms: number): void` — hide after `ms`, cancelled by re-entry
  - `hide(): void`
  - `destroy(): void`
- Consumes: `makeLabel` from `../label`.

- [ ] **Step 1: Write the failing test**

Create `tests/tooltip.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Text } from 'pixi.js';
import { Tooltip } from '../src/ui/kit/tooltip';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}

describe('Tooltip', () => {
  let stage: Container;
  let parent: Container;
  let icon: Container;

  beforeEach(() => {
    (globalThis as { Image?: unknown }).Image = FakeImage;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 16 });
    stage = new Container();
    parent = new Container();
    icon = new Container();
    icon.position.set(100, 50);
    parent.addChild(icon);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows after the hover delay', () => {
    const tip = new Tooltip(stage);
    parent.addChild(tip.el);
    tip.showForAfter(icon, 'Money', 'spawning units.', 500);
    expect(tip.el.visible).toBe(false);
    vi.advanceTimersByTime(500);
    expect(tip.el.visible).toBe(true);
    tip.destroy();
  });

  it('shows immediately on click', () => {
    const tip = new Tooltip(stage);
    parent.addChild(tip.el);
    tip.showFor(icon, 'Money', 'spawning units.');
    expect(tip.el.visible).toBe(true);
    tip.destroy();
  });

  it('hides 500ms after pointerout', () => {
    const tip = new Tooltip(stage);
    parent.addChild(tip.el);
    tip.showFor(icon, 'Money', 'spawning units.');
    tip.hideAfter(500);
    expect(tip.el.visible).toBe(true);
    vi.advanceTimersByTime(500);
    expect(tip.el.visible).toBe(false);
    tip.destroy();
  });

  it('re-showing cancels a pending hide', () => {
    const tip = new Tooltip(stage);
    parent.addChild(tip.el);
    tip.showFor(icon, 'Money', 'spawning units.');
    tip.hideAfter(500);
    vi.advanceTimersByTime(250);
    tip.showFor(icon, 'Money', 'spawning units.');
    vi.advanceTimersByTime(500);
    expect(tip.el.visible).toBe(true);
    tip.destroy();
  });

  it('hides when clicking outside the icon and tooltip', () => {
    const tip = new Tooltip(stage);
    parent.addChild(tip.el);
    tip.showFor(icon, 'Money', 'spawning units.');
    const other = new Container();
    stage.emit('pointerdown', { target: other } as never);
    expect(tip.el.visible).toBe(false);
    tip.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tooltip.test.ts`
Expected: FAIL — module `tooltip` does not exist.

- [ ] **Step 3: Implement**

Create `src/ui/kit/tooltip.ts`:

```ts
import { Container, Graphics, Text } from 'pixi.js';
import { makeLabel } from './label';

const TRIANGLE_H = 8;
const TRIANGLE_W = 14;
const RADIUS = 6;
const PAD_X = 10;
const PAD_Y = 8;

function isInside(node: Container | null, root: Container): boolean {
  let cur: Container | null = node;
  while (cur) {
    if (cur === root) return true;
    cur = cur.parent;
  }
  return false;
}

export class Tooltip {
  readonly el: Container;
  private readonly bg: Graphics;
  private readonly title: Text;
  private readonly text: Text;
  private readonly stage: Container;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private target: Container | null = null;

  constructor(stage: Container) {
    this.stage = stage;
    this.el = new Container();
    this.el.visible = false;
    this.el.eventMode = 'static';
    this.bg = new Graphics();
    this.title = makeLabel('', { fontSize: 14, fill: 0xffffff, fontWeight: '700' });
    this.text = makeLabel('', { fontSize: 13, fill: 0xeeeeee });
    this.el.addChild(this.bg, this.title, this.text);
    this.el.on('pointerover', () => this.cancelHide());
    this.el.on('pointerout', () => this.hideAfter(500));
    this.stage.on('pointerdown', this.onStageDown);
  }

  private onStageDown = (event: { target: Container }): void => {
    if (!this.el.visible || !this.target) return;
    if (event.target === this.target) return;
    if (isInside(event.target, this.el)) return;
    this.hide();
  };

  showFor(target: Container, title: string, text: string): void {
    this.cancelTimers();
    this.setContent(target, title, text);
    this.el.visible = true;
  }

  showForAfter(target: Container, title: string, text: string, ms: number): void {
    this.cancelTimers();
    this.setContent(target, title, text);
    this.el.visible = false;
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.el.visible = true;
    }, ms);
  }

  hideAfter(ms: number): void {
    this.cancelShow();
    if (!this.el.visible) return;
    if (this.hideTimer !== null) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.hide();
    }, ms);
  }

  hide(): void {
    this.cancelTimers();
    this.el.visible = false;
  }

  destroy(): void {
    this.cancelTimers();
    this.stage.off('pointerdown', this.onStageDown);
    this.el.destroy({ children: true });
  }

  private setContent(target: Container, title: string, text: string): void {
    this.target = target;
    this.title.text = title;
    this.text.text = `Required for ${text}`;
    const boxW = Math.max(this.title.width, this.text.width) + PAD_X * 2;
    const boxH = this.title.height + 4 + this.text.height + PAD_Y * 2;
    const cx = boxW / 2;
    this.bg.clear()
      .roundRect(0, 0, boxW, boxH, RADIUS).fill({ color: 0x000000, alpha: 0.8 })
      .moveTo(cx, -TRIANGLE_H).lineTo(cx - TRIANGLE_W / 2, 0).lineTo(cx + TRIANGLE_W / 2, 0).closePath()
      .fill({ color: 0x000000, alpha: 0.8 });
    this.title.position.set(PAD_X, PAD_Y);
    this.text.position.set(PAD_X, PAD_Y + this.title.height + 4);
    const iconCenterX = target.position.x;
    const iconTop = target.position.y - target.height / 2;
    this.el.position.set(iconCenterX - cx, iconTop - TRIANGLE_H);
  }

  private cancelShow(): void {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private cancelHide(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private cancelTimers(): void {
    this.cancelShow();
    this.cancelHide();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tooltip.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/kit/tooltip.ts tests/tooltip.test.ts
git commit -m "feat: add tooltip kit component"
```

---
### Task 4: Wire resource tooltips into `HudMoney`

**Files:**
- Modify: `src/ui/hud/HudMoney.ts`

**Interfaces:**
- Consumes: `Tooltip` (Task 3), `RESOURCE_TOOLTIPS` (Task 2), `UIHost.app.stage`.

- [ ] **Step 1: Implement**

In `src/ui/hud/HudMoney.ts`:

1. Add imports:

```ts
import { Tooltip } from '../kit/tooltip';
import { RESOURCE_TOOLTIPS } from './resourceTooltips';
```

2. Add a field next to `lastKey`:

```ts
  private tooltip: Tooltip | null = null;
```

3. In `mount`, after `this.el = el;`, construct the tooltip:

```ts
    this.tooltip = new Tooltip(host.app.stage);
    this.el.addChild(this.tooltip.el);
```

4. In `update()`, after `this.el.removeChildren();`, hide the tooltip so it is re-laid out:

```ts
    this.tooltip?.hide();
```

5. Add a `key` to each row in the `rows` array (so the tooltip content can be looked up):

```ts
    const rows = [
      { key: 'money', icon: 'coin.png', text: `${r.money}${r.moneyIncome > 0 ? ` (+${r.moneyIncome})` : ''}` },
      { key: 'wood', icon: 'wood.png', text: `${r.wood}${r.building.wood > 0 ? ` (+${r.building.wood})` : ''}` },
      { key: 'stone', icon: 'stone.png', text: `${r.stone}${r.building.stone > 0 ? ` (+${r.building.stone})` : ''}` },
      { key: 'ore', icon: 'ore.png', text: `${r.ore}${r.building.ore > 0 ? ` (+${r.building.ore})` : ''}` },
    ];
```

6. In the row loop, make the icon interactive and wire the tooltip (replace the current icon creation block):

```ts
      const icon = makeIcon(row.icon, iconSize);
      icon.eventMode = 'static';
      icon.position.set(x + iconSize / 2 + 8, 20);
      const info = RESOURCE_TOOLTIPS[row.key as keyof typeof RESOURCE_TOOLTIPS];
      if (info && this.tooltip) {
        icon.on('pointerover', () => this.tooltip!.showForAfter(icon, info.name, info.requiredFor, 500));
        icon.on('pointerout', () => this.tooltip!.hideAfter(500));
        icon.on('pointerdown', () => this.tooltip!.showFor(icon, info.name, info.requiredFor));
      }
```

7. After `this.el.addChildAt(bg, 0);`, re-add the tooltip container so it stays on top across rebuilds:

```ts
    if (this.tooltip) this.el.addChild(this.tooltip.el);
```

8. In `destroy()`, destroy the tooltip:

```ts
    this.tooltip?.destroy();
    this.tooltip = null;
```

- [ ] **Step 2: Typecheck and run the full suite**

Run: `npm run typecheck` — no errors.
Run: `npm test` — all pass.

- [ ] **Step 3: Build**

Run: `npm run build` — succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/hud/HudMoney.ts
git commit -m "feat: show resource tooltips in the money panel"
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`
1. Unit HP bar, label, and action dot render 20px higher.
2. Hover a money/wood/stone/ore icon: tooltip appears after 500ms below the icon, with a black rounded box, a top triangle pointing at the icon, the resource name, and `Required for …`.
3. Click an icon: tooltip appears immediately.
4. Move the cursor from the icon onto the tooltip: it stays; moving off either hides after 500ms.
5. Click elsewhere on the map: tooltip hides immediately.
