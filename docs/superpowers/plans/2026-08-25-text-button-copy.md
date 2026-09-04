# Text Button Styling and Lobby Copy Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all text buttons a unified style with a clear hover/focus ring, and add a Copy button next to the lobby room code.

**Architecture:** A shared `TEXT_BUTTON` style constant in `theme.ts` feeds the `Button` defaults; the hover handler draws a gold ring like `IconButton`. A small `Button.setLabel` method lets the lobby Copy button flip to "Copied!" temporarily, copying via the Clipboard API.

**Tech Stack:** TypeScript, PixiJS 8, Vite, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass at the end of every task.
- Do NOT modify `src/game/**`, `src/net/**`, `src/store/**`.
- No new `.tsx` files; no React imports.

---

### Task 1: Common text-button style + hover/focus ring

**Files:**
- Modify: `src/ui/kit/theme.ts`
- Modify: `src/ui/kit/button.ts`

**Interfaces:**
- Produces: `TEXT_BUTTON` constant in `theme.ts`; `Button` uses it for defaults and draws a `THEME.highlight` ring on hover.

- [ ] **Step 1: Add the shared style constant**

Edit `src/ui/kit/theme.ts` — add after the `THEME` object:

```ts
export const TEXT_BUTTON = {
  fontSize: 16,
  paddingX: 16,
  paddingY: 8,
  minHeight: 34,
} as const;
```

- [ ] **Step 2: Use it for the Button defaults**

Edit `src/ui/kit/button.ts` — add the import:

```ts
import { TEXT_BUTTON, THEME } from './theme';
```

(change `import { THEME } from './theme';` to the line above), then replace the sizing lines in the constructor:

```ts
    const paddingX = opts.paddingX ?? TEXT_BUTTON.paddingX;
    const paddingY = opts.paddingY ?? TEXT_BUTTON.paddingY;
    this.text = makeLabel(opts.label, { fontSize: opts.fontSize ?? TEXT_BUTTON.fontSize });
    this.w = opts.width ?? this.text.width + paddingX * 2;
    this.h = Math.max(this.text.height + paddingY * 2, TEXT_BUTTON.minHeight);
```

- [ ] **Step 3: Add the hover/focus ring**

Edit `src/ui/kit/button.ts` — replace `onOver`:

```ts
  private onOver = (): void => {
    if (this._disabled) return;
    this.bg.clear().roundRect(0, 0, this.w, this.h, THEME.radius).fill(THEME.buttonHover);
    if (this._selected) this.bg.stroke({ width: 3, color: THEME.white });
    else this.bg.stroke({ width: 2, color: THEME.highlight });
  };
```

(`onOut` already restores via `redraw`, which draws no ring unless selected.)

- [ ] **Step 4: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/kit/theme.ts src/ui/kit/button.ts
git commit -m "feat: unify text button style and add hover ring"
```

---

### Task 2: Copy button next to the lobby code

**Files:**
- Modify: `src/ui/kit/button.ts`
- Modify: `src/ui/screens/LobbyScreen.ts`

**Interfaces:**
- Produces: `Button.setLabel(text: string): void`; `LobbyScreen.renderRoom` shows a Copy button next to the code that copies to the clipboard and flips to "Copied!".

- [ ] **Step 1: Add `setLabel` to Button**

Edit `src/ui/kit/button.ts` — add a method after `trigger`:

```ts
  setLabel(text: string): void {
    this.text.text = text;
    this.text.position.set((this.w - this.text.width) / 2, (this.h - this.text.height) / 2);
  }
```

- [ ] **Step 2: Add the copy button in the room view**

Edit `src/ui/screens/LobbyScreen.ts` — in `renderRoom`, replace the code label block:

```ts
    const code = makeLabel(`Code: ${lobby.code}`, { fontSize: 18, fill: 0xffffff });
    code.anchor.set(0.5, 0.5);
    code.position.set(cx, 90);
    this.root!.addChild(code);
```

with:

```ts
    const code = makeLabel(`Code: ${lobby.code}`, { fontSize: 18, fill: 0xffffff });
    code.anchor.set(0.5, 0.5);
    let copyBtn: Button | null = null;
    copyBtn = new Button({
      label: 'Copy',
      width: 80,
      onClick: () => {
        void navigator.clipboard.writeText(lobby.code).catch(() => {});
        copyBtn?.setLabel('Copied!');
        setTimeout(() => {
          if (copyBtn && !copyBtn.destroyed) copyBtn.setLabel('Copy');
        }, 1500);
      },
    });
    const rowW = code.width + 8 + copyBtn.width;
    code.position.set(cx - rowW / 2 + code.width / 2, 90);
    copyBtn.position.set(cx - rowW / 2 + code.width + 8, 90 - copyBtn.height / 2);
    this.root!.addChild(code, copyBtn);
```

- [ ] **Step 3: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/kit/button.ts src/ui/screens/LobbyScreen.ts
git commit -m "feat: add copy button next to lobby room code"
```

---

## Self-review notes

- **Spec coverage:** Section 1 (common style + hover ring) → Task 1; Section 2 (copy button) → Task 2.
- **Type consistency:** `TEXT_BUTTON` defined in Task 1 and used by `Button`. `Button.setLabel` added in Task 2 and used by `LobbyScreen`. `copyBtn` is declared `Button | null` and guarded with `?.` / `destroyed` checks so a re-render destroying the button mid-timeout can't crash.
- **Manual smoke test (final, in a browser):**
  1. Hovering any text button (start, lobby, toolbar) shows the gold ring + hover color; pressing scales down; disabled buttons don't react.
  2. In a hosted lobby, the code row shows a Copy button; clicking it copies the room code to the clipboard and shows "Copied!" for ~1.5s.
