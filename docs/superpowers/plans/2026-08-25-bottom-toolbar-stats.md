# Bottom Toolbar, Popup Removal, and Stats Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the left-side toast notification system entirely, replace the floating action buttons with a full-width bottom toolbar that the map never renders under, and add a `Stats` action that opens a full-screen player standings overlay.

**Architecture:** Delete the popup pipeline (store field, `popupQueue.ts`, `PopupStack.ts`, all `showPopup` calls). A shared `TOOLBAR_HEIGHT` constant reserves a bottom strip: `gameController` fits/pans/clamps/culls the map against `screen.height - TOOLBAR_HEIGHT`, and the GameScreen controller masks the map layer to that region. `HudToolbar` becomes the full-width bar (Skills + contextual actions left, End Turn + Stats right). A new `GameStats` overlay is gated by a new `statsOpen` store flag.

**Tech Stack:** TypeScript, PixiJS 8, Zustand 5, Vite, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass at the end of every task.
- Do NOT modify `src/game/**`, `src/render/**` (except none needed), or `src/net/**`.
- Keep `src/ui/kit/**` unchanged.
- `gameController`'s public action methods keep their current names/signatures.
- The toolbar must be always visible during the game, including when there are no contextual actions.
- The map must never render under the toolbar.
- No new `.tsx` files; no React imports.

---

### Task 1: Remove the popup notification system

**Files:**
- Delete: `src/ui/popupQueue.ts`, `src/ui/overlays/PopupStack.ts`
- Modify: `src/store/gameStore.ts`, `src/controller/gameController.ts`, `src/ui/overlays/OverlayManager.ts`, `tests/gameStore.test.ts`

**Interfaces:**
- Consumes: current store (`Popup`, `popups`, `pushPopup`, `dismissPopup`), `gameController`'s `showPopup` calls, `OverlayManager`'s `popup` entry.
- Produces: store no longer has any popup API; it gains `statsOpen: boolean` and `setStatsOpen(open: boolean): void` (used in Task 4). Nothing else references popups.

- [ ] **Step 1: Remove popup API from the store and add `statsOpen`**

Edit `src/store/gameStore.ts`:

Remove the `Popup` interface (currently lines ~10–15):

```ts
export interface Popup {
  id: number;
  text: string;
  background: string;
  color?: string;
}
```

Remove these from the `GameStore` interface:

```ts
  popups: Popup[];
```

and

```ts
  pushPopup: (popup: Omit<Popup, 'id'>) => void;
  dismissPopup: (id: number) => void;
```

Add to the `GameStore` interface (near `skillTreeOpen`):

```ts
  statsOpen: boolean;
```

and near `setSkillTreeOpen`:

```ts
  setStatsOpen: (open: boolean) => void;
```

Remove these state/impl pieces:

```ts
let nextPopupId = 1;
```

```ts
  popups: [],
```

```ts
  pushPopup: (popup) =>
    set((state) => ({ popups: [...state.popups, { ...popup, id: nextPopupId++ }] })),
  dismissPopup: (id) =>
    set((state) => ({ popups: state.popups.filter((p) => p.id !== id) })),
```

Add to the initial state (near `skillTreeOpen: false`):

```ts
  statsOpen: false,
```

Add to the action impls (near `setSkillTreeOpen`):

```ts
  setStatsOpen: (open) => set({ statsOpen: open }),
```

- [ ] **Step 2: Update the store test**

Edit `tests/gameStore.test.ts`:

- Remove `Popup` from the import: `import { useGameStore } from '../src/store/gameStore';`
- Remove `popups: [],` from the `beforeEach` `setState` call.
- Remove both `pushPopup adds a popup with an id` and `dismissPopup removes a popup by id` tests.
- Add a test:

```ts
  it('setStatsOpen updates statsOpen', () => {
    useGameStore.getState().setStatsOpen(true);
    expect(useGameStore.getState().statsOpen).toBe(true);
    useGameStore.getState().setStatsOpen(false);
    expect(useGameStore.getState().statsOpen).toBe(false);
  });
```

- [ ] **Step 3: Delete the popup modules**

```bash
rm src/ui/popupQueue.ts src/ui/overlays/PopupStack.ts
```

- [ ] **Step 4: Remove `showPopup` from gameController**

Edit `src/controller/gameController.ts`:

- Remove the import: `import { showPopup } from '../ui/popupQueue';`
- Remove the `tribeBackground` helper (currently lines ~36–39).
- In `startGame`, remove these two lines (they only fed the popup):

```ts
    const human = players[0];
    showPopup(`${human.name}'s turn!`, { background: tribeBackground(human) });
```

- In `startHostGame`, remove these two lines:

```ts
    const hostPlayer = players[0];
    showPopup(`${hostPlayer.name}'s turn!`, { background: tribeBackground(hostPlayer) });
```

- In `onHostMessage` (`case 'error'`), remove `showPopup(msg.message, { background: '#c0392b' });` (connection state is still surfaced by the lobby screen).
- In `presentEvents`, remove the `showPopup(...)` calls in the `villageUpgraded`, `extracted`, and `aiTurn` cases. The cases become empty bodies:
  - `villageUpgraded` → `break;` only
  - `extracted` → `break;` only
  - `aiTurn` → `break;` only
- In `presentAttack`, remove every `showPopup(...)` call. After removal, `attackerPlayer` and `targetPlayer` are unused — remove their `const` declarations. Keep `attackerTile`, `targetTile`, `attackerVisible`, `targetVisible`, and all `spawnHpText` calls.
- In `presentCaptured`, remove `showPopup(`${capturer.name} captures the village`, ...)` (keep `capturer` — still used by `showCaptureMessage`).
- In `presentTurnStarted`, remove `showPopup(`${player.name}'s turn!`, ...)` (keep the rest of the method).
- In `presentGameOver`, remove `if (winner) showPopup(`${winner.name} wins!`, ...)` (keep `const winner = store.players[winnerIndex];`).

- [ ] **Step 5: Remove the popup entry from OverlayManager**

Edit `src/ui/overlays/OverlayManager.ts`:

- Remove `import { PopupStack } from './PopupStack';`
- Remove the `popup:` line from the `entries` map.
- In `active()`, remove `if (s.popups.length > 0) active.add('popup');`.

- [ ] **Step 6: Verify no popup references remain**

Run: `grep -rn "showPopup\|popupQueue\|pushPopup\|dismissPopup\|\.popups" src tests`
Expected: no matches.

- [ ] **Step 7: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: remove popup notification system, add statsOpen to store"
```

---

### Task 2: Reserve the toolbar strip in the map viewport

**Files:**
- Create: `src/ui/layout.ts`
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Produces: `TOOLBAR_HEIGHT` (constant `64`) from `src/ui/layout.ts`; private method `mapHeight(): number` on `GameController`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Create the shared constant**

Create `src/ui/layout.ts`:

```ts
export const TOOLBAR_HEIGHT = 64;
```

- [ ] **Step 2: Add `mapHeight()` and use it everywhere**

Edit `src/controller/gameController.ts`:

- Add the import at the top: `import { TOOLBAR_HEIGHT } from '../ui/layout';`
- Add a private method (place it right before `applyFitToScreen`):

```ts
  private mapHeight(): number {
    return this.app ? this.app.screen.height - TOOLBAR_HEIGHT : 0;
  }
```

Replace each of these exact expressions with the replacement shown:

| Location (approx line) | Current | Replace with |
|---|---|---|
| `applyFitToScreen` fit | `fitScaleFor(this.app.screen.width, this.app.screen.height, mapW, mapH)` | `fitScaleFor(this.app.screen.width, this.mapHeight(), mapW, mapH)` |
| `applyFitToScreen` maxZoom | `maxZoomFor(this.app.screen.height / this.app.screen.width)` | `maxZoomFor(this.mapHeight() / this.app.screen.width)` |
| `applyFitToScreen` pan | `y: this.app.screen.height / 2,` | `y: this.mapHeight() / 2,` |
| `applyTransform` viewport | `height: this.app.screen.height,` | `height: this.mapHeight(),` |
| `resetView` pan | `this.pan = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 };` | `this.pan = { x: this.app.screen.width / 2, y: this.mapHeight() / 2 };` |
| `onWindowMove` clampPan | `this.app.screen.height,` | `this.mapHeight(),` |
| `applyPinch` clampPan | `this.app.screen.height,` | `this.mapHeight(),` |
| `startInertia` inertiaStep | `this.app!.screen.height,` | `this.mapHeight(),` |
| `isCellVisible` | `sy <= this.app.screen.height + margin` | `sy <= this.mapHeight() + margin` |
| `bringCellIntoView` target | `y: this.app.screen.height / 2 - world.y * scale,` | `y: this.mapHeight() / 2 - world.y * scale,` |
| `animateCameraTo` clampPan | `this.app!.screen.height,` | `this.mapHeight(),` |
| `render` viewport | `height: this.app.screen.height,` | `height: this.mapHeight(),` |

After this task the map is fit, centered, and clamped in the area above a 64px bottom strip (blank for now).

- [ ] **Step 3: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/layout.ts src/controller/gameController.ts
git commit -m "feat: fit map into viewport above the toolbar strip"
```

---

### Task 3: Full-width bottom toolbar

**Files:**
- Rewrite: `src/ui/hud/HudToolbar.ts`
- Delete: `src/ui/hud/HudEndTurn.ts`, `src/ui/hud/HudSkills.ts`
- Modify: `src/ui/screens/GameScreen.ts`, `src/ui/hud/HudSelected.ts`

**Interfaces:**
- Consumes: `TOOLBAR_HEIGHT` from `../layout`, `toolbarSpecs()` from `./toolbarSpecs`, `gameController.endTurn()`, store `setSkillTreeOpen` / `setStatsOpen` / `aiActive`.
- Produces: `HudToolbar` — a full-width bar with a background at child index 0; left group = Skills + action buttons; right group = End Turn + Stats. GameScreen masks the map layer to the area above `TOOLBAR_HEIGHT`.

- [ ] **Step 1: Rewrite HudToolbar**

Replace the entire contents of `src/ui/hud/HudToolbar.ts` with:

```ts
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { Button } from '../kit/button';
import { TOOLBAR_HEIGHT } from '../layout';
import { toolbarSpecs } from './toolbarSpecs';

export class HudToolbar implements Widget {
  private el: Container | null = null;
  private bg: Graphics | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const bg = new Graphics();
    el.addChild(bg);
    root.addChild(el);
    this.el = el;
    this.bg = bg;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.bg || !this.host) return;
    this.bg.clear().rect(0, 0, this.host.app.screen.width, TOOLBAR_HEIGHT).fill({ color: 0x000000, alpha: 0.7 });
    this.bg.eventMode = 'static';
    this.el.position.set(0, this.host.app.screen.height - TOOLBAR_HEIGHT);
  };

  private update(): void {
    if (!this.el || !this.host) return;
    while (this.el.children.length > 1) {
      this.el.removeChildAt(1).destroy({ children: true });
    }

    const store = useGameStore.getState();
    const actions = toolbarSpecs();
    const barY = (TOOLBAR_HEIGHT - 34) / 2;

    let x = 12;
    const skills = new Button({ label: 'Skills', onClick: () => useGameStore.getState().setSkillTreeOpen(true), paddingX: 12, paddingY: 6, fontSize: 14 });
    skills.position.set(x, barY);
    this.el.addChild(skills);
    x += skills.width + 8;

    for (const spec of actions) {
      const btn = new Button({ label: spec.label, disabled: spec.disabled, onClick: spec.onClick, paddingX: 10, paddingY: 6, fontSize: 14 });
      btn.position.set(x, barY);
      this.el.addChild(btn);
      x += btn.width + 8;
    }

    const w = this.host.app.screen.width;
    const stats = new Button({ label: 'Stats', onClick: () => useGameStore.getState().setStatsOpen(true), paddingX: 12, paddingY: 6, fontSize: 14 });
    const endTurn = new Button({ label: 'End turn', disabled: store.aiActive, onClick: () => gameController.endTurn(), paddingX: 12, paddingY: 6, fontSize: 14 });
    endTurn.position.set(w - 12 - stats.width - 8 - endTurn.width, barY);
    stats.position.set(w - 12 - stats.width, barY);
    this.el.addChild(endTurn, stats);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.bg = null;
    this.host = null;
  }
}
```

- [ ] **Step 2: Delete the folded-in widgets**

```bash
rm src/ui/hud/HudEndTurn.ts src/ui/hud/HudSkills.ts
```

- [ ] **Step 3: Update GameScreen**

Edit `src/ui/screens/GameScreen.ts`:

- Change the import to add `Graphics`:

```ts
import { Container, Graphics } from 'pixi.js';
```

- Add imports; remove `HudSkills` and `HudEndTurn`:

```ts
import { TOOLBAR_HEIGHT } from '../layout';
```

(and delete the `HudSkills` / `HudEndTurn` import lines and their widget entries.)

Replace the class body with:

```ts
export class GameScreen implements ScreenController {
  private root: Container | null = null;
  private mapLayer: Container | null = null;
  private mapMask: Graphics | null = null;
  private hud: Container | null = null;
  private widgets: Widget[] = [];
  private host: UIHost | null = null;

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    this.mapLayer = new Container();
    const mask = new Graphics();
    mask.eventMode = 'none';
    this.mapLayer.mask = mask;
    this.mapLayer.addChild(mask);
    this.mapMask = mask;
    this.hud = new Container();
    this.root.addChild(this.mapLayer, this.hud);
    host.screenLayer.addChild(this.root);
    gameController.init(host.app, this.mapLayer!);

    const widgets: Widget[] = [
      new HudScore(),
      new HudTurn(),
      new HudMoney(),
      new HudPlayers(),
      new HudSelected(),
      new HudToolbar(),
    ];
    for (const w of widgets) w.mount(host, this.hud);
    this.widgets = widgets;

    this.layoutMask();
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => this.layoutMask();

  private layoutMask(): void {
    if (!this.mapMask || !this.host) return;
    this.mapMask.clear().rect(0, 0, this.host.app.screen.width, this.host.app.screen.height - TOOLBAR_HEIGHT).fill(0xffffff);
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    for (const w of this.widgets) w.destroy();
    this.widgets = [];
    this.root?.destroy({ children: true });
    this.root = null;
    this.mapLayer = null;
    this.mapMask = null;
    this.hud = null;
    this.host = null;
  }
}
```

> Note: `GameScreen.ts` imports `HudScore`, `HudTurn`, `HudMoney`, `HudPlayers`, `HudSelected`, `HudToolbar` — keep those imports; only remove `HudSkills` and `HudEndTurn` and add the new ones shown.

- [ ] **Step 4: Lift SelectedInfo above the toolbar**

Edit `src/ui/hud/HudSelected.ts`:

- Add the import: `import { TOOLBAR_HEIGHT } from '../layout';`
- In `layout`, replace the bottom offset:

```ts
  private layout = (): void => {
    if (!this.el || !this.host) return;
    const bottom = TOOLBAR_HEIGHT + 8;
    this.el.position.set(16, this.host.app.screen.height - bottom - this.measured);
  };
```

- [ ] **Step 5: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: full-width bottom toolbar with skills, actions, end turn, stats"
```

---

### Task 4: GameStats overlay

**Files:**
- Create: `src/ui/overlays/GameStats.ts`
- Modify: `src/ui/overlays/OverlayManager.ts`

**Interfaces:**
- Consumes: `TOOLBAR_HEIGHT` not needed here; `gameController.getMap()`, `totalScore` from `../../game/score`, `TRIBES`, `useGameStore` (`players`, `localPlayerIndex`, `statsOpen`, `setStatsOpen`), `UIHost`, kit pieces.
- Produces: class `GameStats` with `mount(host: UIHost, root: Container): void` / `destroy(): void`; `OverlayManager` gates it on `inGame && statsOpen`.

- [ ] **Step 1: Write the overlay**

Create `src/ui/overlays/GameStats.ts`:

```ts
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { totalScore } from '../../game/score';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';

export class GameStats {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private rows: Container | null = null;
  private closeBtn: Button | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();

    const bg = new Graphics();
    bg.rect(0, 0, host.app.screen.width, host.app.screen.height).fill({ color: 0x000000, alpha: 0.85 });
    bg.eventMode = 'static';
    el.addChild(bg);

    const title = makeLabel('Stats', { fontSize: 28, fill: 0xffffff, fontWeight: '700' });
    title.anchor.set(0.5, 0);
    title.position.set(host.app.screen.width / 2, 32);
    el.addChild(title);

    const close = new Button({ label: 'Close', onClick: () => useGameStore.getState().setStatsOpen(false) });
    el.addChild(close);

    const rows = new Container();
    el.addChild(rows);

    root.addChild(el);
    this.el = el;
    this.closeBtn = close;
    this.rows = rows;

    this.layout();
    this.render();
    this.unsub = useGameStore.subscribe(() => this.render());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        useGameStore.getState().setStatsOpen(false);
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  private layout = (): void => {
    if (!this.el || !this.host || !this.closeBtn) return;
    this.closeBtn.position.set(this.host.app.screen.width / 2 - this.closeBtn.width / 2, this.host.app.screen.height - 48);
  };

  private render(): void {
    if (!this.el || !this.host || !this.rows) return;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const ranked = [...s.players]
      .map((p) => ({ p, score: map ? totalScore(map, p) : p.score }))
      .sort((a, b) => b.score - a.score);

    this.rows.removeChildren();
    const lineH = 36;
    ranked.forEach(({ p, score }, i) => {
      const tribe = TRIBES.find((t) => t.id === p.tribe)!;
      const role = p.index === s.localPlayerIndex ? ' (you)' : p.isHuman ? '' : ' (AI)';
      const t = makeLabel(`${p.name} (${tribe.name})${role}: ${score} pts (kills: ${p.kills})`, { fontSize: 18, fill: tribe.color });
      t.position.set(0, i * lineH);
      this.rows!.addChild(t);
    });
    this.rows.position.set(this.host.app.screen.width / 2, this.host.app.screen.height / 2 - (ranked.length * lineH) / 2);
    this.rows.children.forEach((c) => {
      const child = c as { width: number; position: { set(x: number, y: number): void; y: number } };
      child.position.set(-child.width / 2, child.position.y);
    });
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.unsub = null;
    this.onResize = null;
    this.onKey = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.rows = null;
    this.closeBtn = null;
    this.host = null;
  }
}
```

- [ ] **Step 2: Register the overlay**

Edit `src/ui/overlays/OverlayManager.ts`:

- Add the import: `import { GameStats } from './GameStats';`
- Add to the `entries` map:

```ts
    stats: { make: () => new GameStats(), mounted: null },
```

- Add to `active()`:

```ts
    if (inGame && s.statsOpen) active.add('stats');
```

- [ ] **Step 3: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/overlays/GameStats.ts src/ui/overlays/OverlayManager.ts
git commit -m "feat: add GameStats overlay listing players by score"
```

---

## Self-review notes

- **Spec coverage:** Section 1 (popup removal) → Task 1; Section 2 (full-width toolbar, fold-in Skills/EndTurn, SelectedInfo offset) → Task 3; Section 3 (map shifted up, `TOOLBAR_HEIGHT`, `mapHeight`, mask) → Tasks 2 + 3; Section 4 (GameStats, `statsOpen`, OverlayManager gate, Close + Escape) → Tasks 1 + 4; Section 5 (testing) → each task's verification + final manual smoke test below.
- **Type consistency:** `TOOLBAR_HEIGHT` defined once in `src/ui/layout.ts` (Task 2) and consumed by `gameController`, `GameScreen`, `HudToolbar`, `HudSelected`. `statsOpen` / `setStatsOpen` added to the store in Task 1, used by `HudToolbar` (Stats button) in Task 3 and gated in `OverlayManager` in Task 4. `GameStats` implements the same `mount(host, root)` / `destroy()` shape as the other overlays.
- **Manual smoke test (final, in a browser):**
  1. No left-side toasts anywhere — start game, attack, capture, end turn: only floating hp text and the centered "Your turn!" appear.
  2. Bottom bar is full-width; the map never renders beneath it; zoom/pan keeps the map inside the area above the bar; window resize behaves.
  3. Bar shows Skills + contextual actions on the left, End Turn (disabled during AI) + Stats on the right; actions appear/disappear correctly on selection.
  4. Stats opens the overlay: players sorted by score desc with name/tribe/score/kills, live-updates on score change, Close + Escape work, and the game resumes underneath.
