# Unit Feedback, HP Bar Nudge, and Toolbar Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the unit up-down bounce only on explicit selection (not after moves), shift the HP bar + label up 10px, and make the toolbar buttons larger, centered, with End turn always last.

**Architecture:** The bounce moves from render-time identity tracking to an explicit `MapView.bounceUnit(q, r)` triggered by the click handler's selection branch; `updateSelectedBounce` becomes a stop-only guard. The HP bar group is offset up by a constant in its unscaled local coordinates. `HudToolbar` rebuilds all buttons into a single centered row (Skills → actions → Stats → End turn) with larger sizing.

**Tech Stack:** TypeScript, PixiJS 8, Vite, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass at the end of every task.
- Do NOT modify `src/game/**`, `src/net/**`, `src/store/**`.
- No new `.tsx` files; no React imports.
- `TOOLBAR_HEIGHT` stays 64. The bounce must not play when a unit moves.

---

### Task 1: Up-down bounce only on explicit selection

**Files:**
- Modify: `src/render/mapRenderer.ts`
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Produces: `MapView.bounceUnit(q: number, r: number): void` (starts one 300ms up-down bounce for the unit at that tile), `MapView.stopBounce(): void`, and `updateSelectedBounce` becomes stop-only. `handleMapClick` calls `bounceUnit` when a click selects a local unit.

- [ ] **Step 1: Remove the `bounceSel` field**

Edit `src/render/mapRenderer.ts` — delete the line:

```ts
  private bounceSel: Selection | null = null;
```

- [ ] **Step 2: Replace the bounce methods**

Edit `src/render/mapRenderer.ts` — replace the whole `updateSelectedBounce` method with these three methods:

```ts
  bounceUnit(q: number, r: number): void {
    this.stopBounce();
    if (!this.map) return;
    const tile = this.map.tiles.find((t) => t.q === q && t.r === r);
    if (!tile || !tile.unit) return;
    const sprite = this.tileViews.get(axialKey(tile))?.unitSprite ?? null;
    if (!sprite || sprite.destroyed) return;
    this.bounceSprite = sprite;
    this.bounceBaseY = sprite.position.y;
    const amp = this.hexSize * 0.15;
    const start = performance.now();
    const fn = (): void => {
      if (!this.bounceSprite || this.bounceSprite.destroyed) {
        this.stopBounce();
        return;
      }
      const t = Math.min(1, (performance.now() - start) / 300);
      this.bounceSprite.position.y = this.bounceBaseY - Math.sin(t * Math.PI) * amp;
      if (t >= 1) this.stopBounce();
    };
    this.app.ticker.add(fn);
    this.bounceRemove = () => this.app.ticker.remove(fn);
  }

  private stopBounce(): void {
    if (this.bounceRemove) {
      this.bounceRemove();
      this.bounceRemove = null;
    }
    this.bounceSprite = null;
  }

  private updateSelectedBounce(selection: Selection | null, localPlayerIndex: number): void {
    if (!this.map) return;
    let isLocalUnit = false;
    if (selection && selection.kind === 'unit') {
      const tile = this.map.tiles.find((t) => t.q === selection.q && t.r === selection.r);
      if (tile && tile.unit && tile.unit.owner === localPlayerIndex && isExploredFor(tile, localPlayerIndex)) {
        isLocalUnit = true;
      }
    }
    if (!isLocalUnit) this.stopBounce();
  }
```

- [ ] **Step 3: Update the call site in `update()`**

Edit `src/render/mapRenderer.ts` — change:

```ts
    this.updateSelectedBounce(selection, localPlayerIndex, players);
```

to:

```ts
    this.updateSelectedBounce(selection, localPlayerIndex);
```

- [ ] **Step 4: Update `destroy()`**

Edit `src/render/mapRenderer.ts` — replace:

```ts
    if (this.bounceRemove) {
      this.bounceRemove();
      this.bounceRemove = null;
    }
    this.bounceSprite = null;
    this.bounceSel = null;
```

with:

```ts
    this.stopBounce();
```

- [ ] **Step 5: Bounce on explicit unit selection in the click handler**

Edit `src/controller/gameController.ts` — in `handleMapClick`, replace the selection branch:

```ts
    store.setSelection(cycleSelection(selection, tile));
    this.render();
```

with:

```ts
    const next = cycleSelection(selection, tile);
    store.setSelection(next);
    if (next.kind === 'unit') {
      const u = tileAt(this.sim.map, next.q, next.r)?.unit;
      if (u && u.owner === store.localPlayerIndex) this.mapView?.bounceUnit(next.q, next.r);
    }
    this.render();
```

- [ ] **Step 6: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/render/mapRenderer.ts src/controller/gameController.ts
git commit -m "fix: bounce unit only on explicit selection, not after moves"
```

---

### Task 2: Move HP bar and text up 10px

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Produces: `addHpBar` content offset up by 10 screen px (bar, fill, label, label background, action dot).

- [ ] **Step 1: Offset the HP bar group up**

Edit `src/render/mapRenderer.ts` — in `addHpBar`, add `const up = -10;` right after the `maxHp` line, then apply `+ up` to the bar/fill y, the label y, and the dot y:

```ts
    const maxHp = UNIT_TYPES[unit.type].maxHp;
    const up = -10;

    const background = this.takeGraphics();
    background.rect(-barWidth / 2, -barHeight / 2 + up, barWidth, barHeight).fill(0xff0000);
    el.addChild(background);

    const ratio = Math.max(0, Math.min(1, unit.hp / maxHp));
    if (ratio > 0) {
      const fill = this.takeGraphics();
      fill.rect(-barWidth / 2, -barHeight / 2 + up, barWidth * ratio, barHeight).fill(0x00ff00);
      el.addChild(fill);
    }

    const label = this.takeText(`${unit.hp}/${maxHp}`, { fontSize: 13, fill: 0xffffff });
    label.anchor.set(0.5, 1);
    label.position.set(0, -barHeight / 2 - 2 + up);

    const labelBg = this.takeGraphics();
    labelBg
      .rect(label.x - label.width / 2 - 2, label.y - label.height, label.width + 4, label.height)
      .fill({ color: tribeColor, alpha: 0.85 });
    el.addChild(labelBg);
    el.addChild(label);

    if (canAct && unit.owner === localPlayerIndex) {
      const dot = this.takeGraphics();
      dot.circle(barWidth / 2 + 9, -4 + up, 4).fill(0xff0000);
      el.addChild(dot);
    }
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: move unit HP bar and label up 10px"
```

---

### Task 3: Toolbar buttons bigger, centered, End turn last

**Files:**
- Modify: `src/ui/hud/HudToolbar.ts`

**Interfaces:**
- Produces: a single centered row `Container` of buttons ordered Skills → contextual actions → Stats → End turn; text buttons `fontSize 20`, `paddingY 10`; action text paddingX 16, Skills/Stats paddingX 20; `IconButton` size 48; gap 12; `layout()` re-centers the row.

- [ ] **Step 1: Add the row field**

Edit `src/ui/hud/HudToolbar.ts` — add after `private bg: Graphics | null = null;`:

```ts
  private row: Container | null = null;
```

- [ ] **Step 2: Create the row in `mount`**

Edit `src/ui/hud/HudToolbar.ts` — in `mount`, replace:

```ts
    const el = new Container();
    const bg = new Graphics();
    el.addChild(bg);
    root.addChild(el);
    this.el = el;
    this.bg = bg;
```

with:

```ts
    const el = new Container();
    const bg = new Graphics();
    const row = new Container();
    el.addChild(bg, row);
    root.addChild(el);
    this.el = el;
    this.bg = bg;
    this.row = row;
```

- [ ] **Step 3: Rewrite `layout` to center the row**

Edit `src/ui/hud/HudToolbar.ts` — replace `layout`:

```ts
  private layout = (): void => {
    if (!this.el || !this.bg || !this.host) return;
    this.bg.clear().rect(0, 0, this.host.app.screen.width, TOOLBAR_HEIGHT).fill({ color: 0x000000, alpha: 0.7 });
    this.bg.eventMode = 'static';
    this.el.position.set(0, this.host.app.screen.height - TOOLBAR_HEIGHT);
    if (this.row) {
      const barY = (TOOLBAR_HEIGHT - 48) / 2;
      this.row.position.set((this.host.app.screen.width - this.row.width) / 2, barY);
    }
  };
```

- [ ] **Step 4: Rewrite `update` to build the centered row**

Edit `src/ui/hud/HudToolbar.ts` — replace `update`:

```ts
  private update(): void {
    if (!this.el || !this.row || !this.host) return;
    while (this.row.children.length > 0) {
      this.row.removeChildAt(0).destroy({ children: true });
    }
    const store = useGameStore.getState();
    const actions = toolbarSpecs();
    const GAP = 12;
    let x = 0;

    const addText = (label: string, disabled: boolean, onClick: () => void, paddingX: number): void => {
      const btn = new Button({ label, disabled, onClick, paddingX, paddingY: 10, fontSize: 20 });
      btn.position.set(x, 0);
      this.row!.addChild(btn);
      x += btn.width + GAP;
    };
    const addIcon = (icon: string, disabled: boolean, onClick: () => void): void => {
      const btn = new IconButton({ icon, disabled, onClick, size: 48 });
      btn.position.set(x, 0);
      this.row!.addChild(btn);
      x += btn.width + GAP;
    };

    addText('Skills', false, () => useGameStore.getState().setSkillTreeOpen(true), 20);
    for (const spec of actions) {
      const iconFile = ICON_ACTIONS[spec.key];
      if (iconFile) addIcon(iconFile, spec.disabled, spec.onClick);
      else addText(spec.label, spec.disabled, spec.onClick, 16);
    }
    addText('Stats', false, () => useGameStore.getState().setStatsOpen(true), 20);
    addIcon('end-turn.png', store.aiActive, () => gameController.endTurn());

    this.layout();
  }
```

- [ ] **Step 5: Reset the row in `destroy`**

Edit `src/ui/hud/HudToolbar.ts` — in `destroy`, add after `this.bg = null;`:

```ts
    this.row = null;
```

- [ ] **Step 6: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/hud/HudToolbar.ts
git commit -m "feat: enlarge and center toolbar buttons with end-turn last"
```

---

## Self-review notes

- **Spec coverage:** Section 1 (bounce only on explicit selection) → Task 1; Section 2 (HP bar + text up 10px) → Task 2; Section 3 (bigger/centered/end-turn-last toolbar) → Task 3.
- **Type consistency:** `bounceUnit(q, r)` / `stopBounce()` are defined in Task 1 and used by `handleMapClick` (Task 1) and internally. `updateSelectedBounce` signature drops `players` (Task 1 Step 3 updates its only call site). `HudToolbar.row` is created in `mount`, filled in `update`, positioned in `layout`, and nulled in `destroy` (all Task 3).
- **Manual smoke test (final, in a browser):**
  1. Clicking your unit bounces it once; moving it shows only the cell-to-cell move animation; enemy/village/terrain selections don't bounce.
  2. HP bars and their labels sit 10px higher and track on zoom.
  3. Toolbar buttons are larger, the whole row is centered, End turn is the rightmost button, and the row re-centers on resize.
