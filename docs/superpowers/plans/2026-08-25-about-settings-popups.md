# About / Settings Popups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an About popup (game description + author) and an empty Settings popup on the start screen, each opened from bottom-corner buttons and closable via Close button, backdrop tap, or Escape.

**Architecture:** A reusable `Modal` kit component (dim backdrop + centered card + title + word-wrapped lines + Close button, Escape handling). `StartScreen` adds bottom-left About and bottom-right Settings buttons outside the menu, tracks an open modal, and gates the menu keyboard handler while a modal is open.

**Tech Stack:** TypeScript, PixiJS 8, Vite, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass at the end of every task.
- Do NOT modify `src/game/**`, `src/net/**`, `src/store/**`, `src/controller/**`.
- No new `.tsx` files; no React imports.

---

### Task 1: `Modal` kit component

**Files:**
- Create: `src/ui/kit/modal.ts`

**Interfaces:**
- Produces: `ModalOpts` (`{ app: Application; title: string; lines: string[]; onClose: () => void }`) and `class Modal` with `mount(container: Container): void` and `destroy(): void`.

- [ ] **Step 1: Write the component**

Create `src/ui/kit/modal.ts`:

```ts
import { Application, Container, Graphics, Text } from 'pixi.js';
import { Button } from './button';
import { makeLabel } from './label';
import { THEME } from './theme';

export interface ModalOpts {
  app: Application;
  title: string;
  lines: string[];
  onClose: () => void;
}

export class Modal {
  private el: Container | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(opts: ModalOpts) {
    const cardW = 440;
    const gap = 14;
    const el = new Container();

    const backdrop = new Graphics();
    backdrop.rect(0, 0, opts.app.screen.width, opts.app.screen.height).fill({ color: 0x000000, alpha: 0.6 });
    backdrop.eventMode = 'static';
    backdrop.on('pointertap', opts.onClose);
    el.addChild(backdrop);

    const title = makeLabel(opts.title, { fontSize: 24, fill: 0xffffff, fontWeight: '700' });

    const content: Text[] = opts.lines.map((line) => new Text({
      text: line,
      style: {
        fontFamily: THEME.fontFamily,
        fontSize: 15,
        fill: 0xcccccc,
        wordWrap: true,
        wordWrapWidth: cardW - 48,
      },
      resolution: Math.max(2, window.devicePixelRatio || 2),
    }));

    const close = new Button({ label: 'Close', width: 140, onClick: opts.onClose });

    let y = 24 + 40 + gap;
    for (const t of content) {
      t.position.set(24, y);
      y += t.height + gap;
    }
    const cardH = y + 34 + 16;

    const card = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, cardH, 8).fill(0x111111);
    card.addChild(bg);

    title.position.set(cardW / 2 - title.width / 2, 24);
    card.addChild(title);
    for (const t of content) card.addChild(t);

    close.position.set(cardW / 2 - 70, y);
    card.addChild(close);

    card.position.set(opts.app.screen.width / 2 - cardW / 2, opts.app.screen.height / 2 - cardH / 2);
    el.addChild(card);

    this.el = el;
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        opts.onClose();
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  mount(container: Container): void {
    if (this.el) container.addChild(this.el);
  }

  destroy(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.el?.destroy({ children: true });
    this.el = null;
  }
}
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/kit/modal.ts
git commit -m "feat: add reusable modal kit component"
```

---

### Task 2: Start screen About/Settings buttons + popups

**Files:**
- Modify: `src/ui/screens/StartScreen.ts`

**Interfaces:**
- Consumes: `Modal` from `../kit/modal`.
- Produces: bottom-left **About** and bottom-right **Settings** buttons; `modal: Modal | null` state; `openModal('about' | 'settings')` / `closeModal()`; menu keyboard handler gated while a modal is open.

- [ ] **Step 1: Add imports and the About text**

Edit `src/ui/screens/StartScreen.ts` — add the import:

```ts
import { Modal } from '../kit/modal';
```

and add a module-level constant after the imports:

```ts
const ABOUT_TEXT =
  'Hex is a turn-based strategy game on a hex map. Build and upgrade villages, train warriors, riders, archers, and swordsmen, research skills, and explore a procedurally generated world. Conquer rival tribes by capturing their villages or score the most points by the final turn. Play solo against AI or challenge friends in multiplayer.';
```

- [ ] **Step 2: Add fields and build the buttons**

Edit `src/ui/screens/StartScreen.ts` — add fields after `private index = 0;`:

```ts
  private aboutBtn: Button | null = null;
  private settingsBtn: Button | null = null;
  private modal: Modal | null = null;
```

In `mount`, after the hint is added to the root, add:

```ts
    this.aboutBtn = new Button({ label: 'About', width: 96, fontSize: 14, onClick: () => this.openModal('about') });
    this.settingsBtn = new Button({ label: 'Settings', width: 110, fontSize: 14, onClick: () => this.openModal('settings') });
    this.root.addChild(this.aboutBtn, this.settingsBtn);
```

- [ ] **Step 3: Gate the menu keyboard handler while a modal is open**

Edit `src/ui/screens/StartScreen.ts` — at the top of `onKeyDown`, add:

```ts
  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.modal) return;
    if (e.key === 'ArrowUp') {
```

- [ ] **Step 4: Add the modal open/close methods and About text**

Edit `src/ui/screens/StartScreen.ts` — add these methods (place them after `move`):

```ts
  private openModal(kind: 'about' | 'settings'): void {
    if (this.modal || !this.host) return;
    const opts = kind === 'about'
      ? { title: 'About', lines: [ABOUT_TEXT, 'Author: swypse@gmail.com'] }
      : { title: 'Settings', lines: [] };
    const modal = new Modal({ app: this.host.app, ...opts, onClose: () => this.closeModal() });
    modal.mount(this.root!);
    this.modal = modal;
  }

  private closeModal(): void {
    if (!this.modal) return;
    this.modal.destroy();
    this.modal = null;
  }
```

- [ ] **Step 5: Position the corner buttons in `layout`**

Edit `src/ui/screens/StartScreen.ts` — in `layout`, after the hint position line, add:

```ts
    if (this.aboutBtn) this.aboutBtn.position.set(12, h - this.aboutBtn.height - 12);
    if (this.settingsBtn) this.settingsBtn.position.set(w - this.settingsBtn.width - 12, h - this.settingsBtn.height - 12);
```

- [ ] **Step 6: Clean up in `destroy`**

Edit `src/ui/screens/StartScreen.ts` — in `destroy`, at the top add:

```ts
    if (this.modal) {
      this.modal.destroy();
      this.modal = null;
    }
```

and near the end add:

```ts
    this.aboutBtn = null;
    this.settingsBtn = null;
```

- [ ] **Step 7: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens/StartScreen.ts
git commit -m "feat: add About and Settings popups to the start screen"
```

---

## Self-review notes

- **Spec coverage:** Section 1 (`Modal` kit component) → Task 1; Section 2 (start screen buttons + wiring) → Task 2.
- **Type consistency:** `Modal`/`ModalOpts` defined in Task 1 and used in Task 2. `modal`, `aboutBtn`, `settingsBtn`, `openModal`, `closeModal` are all introduced in Task 2 and referenced only within `StartScreen`.
- **Manual smoke test (final, in a browser):**
  1. Start screen shows About (bottom-left) and Settings (bottom-right).
  2. About opens a popup with the description + `Author: swypse@gmail.com`; Close, backdrop tap, and Escape all close it.
  3. Settings opens an empty popup (title + Close only).
  4. While a popup is open, arrow keys don't move the menu behind it; the corner buttons stay in place on resize.
