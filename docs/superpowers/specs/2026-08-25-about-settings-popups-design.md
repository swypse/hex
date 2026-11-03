# About / Settings Popups Design

Date: 2026-08-25

## Problem

The main (start) screen has no About or Settings access. The player should be
able to open an About popup (game description + author) and a Settings popup
(currently empty), each with a Close button.

## Decisions

1. Add a reusable `Modal` kit component (title, content lines, Close button,
   backdrop + Escape to close).
2. Add bottom-corner **About** (left) and **Settings** (right) buttons on the
   start screen, outside the keyboard-nav menu.

## Section 1 — `Modal` kit component

New file `src/ui/kit/modal.ts`:

```ts
export interface ModalOpts {
  app: Application;        // for screen-size centering
  title: string;
  lines: string[];         // content lines, word-wrapped
  onClose: () => void;
}
export class Modal {
  mount(container: Container): void;
  destroy(): void;         // removes key listener + destroys children
}
```

- A full-screen dim backdrop (`Graphics`, `eventMode 'static'`) — tapping it
  calls `onClose`.
- A centered card: title, wrapped content lines (each a `Text` with
  `wordWrap`/`wordWrapWidth`), and a **Close** `Button` at the bottom.
- **Escape** also calls `onClose` (key listener added on construction, removed
  on destroy).

The About popup uses title `"About"` and lines =
`["Hex is a turn-based strategy game on a hex map. Build and upgrade villages, train warriors, riders, archers, and swordsmen, research skills, and explore a procedurally generated world. Conquer rival tribes by capturing their villages or score the most points by the final turn. Play solo against AI or challenge friends in multiplayer.", "Author: swypse@gmail.com"]`.

The Settings popup uses title `"Settings"` with `lines: []` (just the title and
Close button).

## Section 2 — Start screen buttons + wiring

`src/ui/screens/StartScreen.ts`:

- Add two small utility `Button`s (width ~96, fontSize 14), pinned outside the
  keyboard-nav menu:
  - **About** at `(12, screen.height − height − 12)` (bottom-left).
  - **Settings** at `(screen.width − width − 12, screen.height − height − 12)`
    (bottom-right).
  - Both are positioned in `layout()` so they track window resizes.
- Add `modal: Modal | null` state. Clicking About/Settings builds the
  corresponding `Modal` and mounts it into `this.root` (above the menu).
- While a modal is open, the menu's `onKeyDown` returns early so arrows/Enter
  don't navigate the menu behind the dialog; the modal handles Escape.
- `destroy()` closes any open modal and resets button/modal references.

## Files touched

- Create: `src/ui/kit/modal.ts`.
- Modify: `src/ui/screens/StartScreen.ts`.

## Testing

- `npm run typecheck` and `npm test` must pass.
- Manual (`npm run dev`):
  1. Start screen shows About (bottom-left) and Settings (bottom-right).
  2. About opens a popup with the game description + `Author: swypse@gmail.com`;
     Close button, backdrop tap, and Escape all close it.
  3. Settings opens an empty popup (title + Close only).
  4. While a popup is open, arrow keys don't move the menu behind it; both
     buttons stay in place on window resize.
