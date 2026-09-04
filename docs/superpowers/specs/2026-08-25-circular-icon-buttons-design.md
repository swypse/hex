# Circular Icon Buttons Design

Date: 2026-08-25

## Problem

The bottom toolbar renders every control as a text button. The upgrade, heal, and
end-turn actions should be circular icon buttons using the provided textures
(`upgrade.png`, `heal.png`, `end-turn.png` in `public/textures/`), with hover and
active (press) effects.

## Decisions

1. Add a reusable circular `IconButton` kit component.
2. Use it in the toolbar for the `upgrade`, `heal`, and `end turn` actions;
   every other action stays a text `Button`.

## Section 1 — `IconButton` kit component

New file `src/ui/kit/iconButton.ts`:

```ts
export interface IconButtonOpts {
  icon: string;               // texture file name, e.g. 'upgrade.png'
  onClick: () => void;
  size?: number;              // circle diameter, default 36
  disabled?: boolean;
  onReady?: () => void;       // fired after the texture loads (for re-layout)
}
export class IconButton extends Container {
  set disabled(v: boolean);
  get disabled(): boolean;
}
```

- **Normal**: a `Graphics` circle filled `THEME.button` (`#3a3f5a`), plus a
  texture `Sprite` via the existing `makeIcon` sized to ~60% of the diameter
  (aspect preserved), centered.
- **Hover**: `pointerover` refills the circle with `THEME.buttonHover`
  (`#4a5070`) and adds a `THEME.highlight` ring; `pointerout` restores.
  `cursor: pointer`.
- **Active**: `pointerdown` scales the button to 0.92; `pointerup` /
  `pointerupoutside` restore scale 1.
- **Disabled**: opacity 0.5, `eventMode 'none'`, no hover/active reactions;
  `onClick` never fires while disabled.
- `.width` / `.height` equal the diameter, so the toolbar lays it out alongside
  text buttons.

## Section 2 — Toolbar integration

`src/ui/hud/HudToolbar.ts`:

- Left group: keep `Skills` and all non-icon actions as text `Button`s. For the
  action keys `upgrade` and `heal`, build an `IconButton` (`upgrade.png` /
  `heal.png`) with the spec's `disabled` and `onClick`, placed in the same row.
- Right group: `End turn` becomes an `IconButton` (`end-turn.png`, disabled while
  `store.aiActive`); `Stats` stays a text `Button`.
- Icon buttons are 36px, vertically centered like the rest of the row; mixed
  text/icon buttons share the same left-to-right layout with the existing 8px
  gaps.

## Files touched

- Create: `src/ui/kit/iconButton.ts`.
- Modify: `src/ui/hud/HudToolbar.ts`.
- Assets already present: `public/textures/upgrade.png`, `heal.png`,
  `end-turn.png`.

## Testing

- `npm run typecheck` and `npm test` must pass (no game-logic changes).
- Manual (`npm run dev`):
  1. Selecting an owned village shows a circular **upgrade** icon; selecting a
     damaged unit shows a circular **heal** icon.
  2. The **end-turn** control is a circular icon, dimmed during AI turns.
  3. Hover brightens the circle + ring; press scales down; disabled icons don't
     react.
  4. Icons sit in the same row as the text buttons.
