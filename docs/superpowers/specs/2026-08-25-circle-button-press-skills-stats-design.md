# Circle Button Press Fix and Skills/Stats Icon Buttons Design

Date: 2026-08-25

## Problem

1. The toolbar's circular `IconButton`s change size while pressed: `pointerdown`
   scales the button to 0.92 (pivot at the top-left), so the button visibly
   shrinks and jumps while held. The pressed state should not alter geometry.
2. The permanent `Skills` and `Stats` toolbar actions are text `Button`s. They
   should be circular icon buttons using the new `skills.png` and `stats.png`
   textures, matching the existing `upgrade.png` / `heal.png` / `end-turn.png`
   circle buttons.

## Decisions

1. Replace the `IconButton` scale-down press animation with a color-based active
   state that never changes the button's size or hit area.
2. Turn `Skills` and `Stats` into permanent circle icon buttons
   (`skills.png` / `stats.png`) in the toolbar.
3. The text `Button` keeps its existing scale-down press behavior (out of scope
   per request — only circle buttons were raised).

## Section 1 — `IconButton` pressed state (`src/ui/kit/iconButton.ts`)

- Remove the `pointerdown` / `pointerup` / `pointerupoutside` `scale` changes.
- Add `THEME.buttonPressed` (darker than `buttonHover`) in
  `src/ui/kit/theme.ts`.
- Track a `_hover` boolean set on `pointerover` / `pointerout` so the fill can be
  restored correctly after release.
- `pointerdown`: fill circle with `buttonPressed` (size unchanged).
- `pointerup` / `pointerupoutside`: fill with `buttonHover` + highlight ring if
  `_hover`, else `button` (no ring).
- Add an explicit `hitArea` covering the full circle so the pressed state never
  shrinks the click target.
- Disabled behavior unchanged (alpha 0.5, `eventMode 'none'`, no reactions).

## Section 2 — Skills/Stats circle buttons (`src/ui/hud/HudToolbar.ts`)

In `update()`:

- Replace `addText('Skills', …)` with `addIcon('skills.png', false, () =>
  useGameStore.getState().setSkillTreeOpen(true))`.
- Replace `addText('Stats', …)` with `addIcon('stats.png', false, () =>
  useGameStore.getState().setStatsOpen(true))`.
- Keep the existing 48px icon size, `GAP = 12`, and centered row layout.

## Files touched

- Modify: `src/ui/kit/iconButton.ts`, `src/ui/kit/theme.ts`,
  `src/ui/hud/HudToolbar.ts`.
- Assets already present: `public/textures/skills.png`, `stats.png`.

## Testing

- `npm run typecheck` and `npm test` must pass (no game-logic changes).
- Manual (`npm run dev`):
  1. Press and hold each circle button (upgrade, heal, end-turn, skills, stats):
     the button does not change size or position; the circle darkens while held
     and restores on release.
  2. Hover still brightens the circle + ring.
  3. `Skills` icon opens the skill tree; `Stats` icon opens the stats overlay.
  4. Disabled icons (e.g. end-turn during AI) stay dim and unresponsive.
