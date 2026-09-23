# Bottom Toolbar Action Buttons — Three-Zone Layout

## Goal

Restructure the bottom `HudToolbar` into three fixed zones:

- **Left (screen edge):** an always-visible Skills action button.
- **Right (screen edge):** an always-visible End Turn button.
- **Center:** all other currently-available actions, clipped to the strip between the two
  pinned buttons and **horizontally scrollable** by click-drag and mouse wheel.

Remove the standalone Skills button from its current location under the player score chip
(top-right column). The Achievements button stays where it is.

**General plan of the requested behavior:** "Always visible" means the Skills and End Turn
buttons are pinned for as long as the toolbar itself is shown; the toolbar continues to hide
entirely while another player / the AI is moving (`el.visible = !store.aiActive`), exactly as
it does today. Nothing changes about when the toolbar appears.

## Background / current behavior

- `HudToolbar` (`src/ui/hud/hud-toolbar.ts`) renders a **centered** row of action buttons
  from `toolbarSpecs()` (`src/ui/hud/toolbar-specs.ts`) followed by the End Turn button
  appended to the end of that row. The whole row is scaled down (`row.scale`) when it exceeds
  the available width, centered via `layout()`. Action highlight and End Turn pulse rings are
  added as direct children of `row`, positioned at a button's `position.x`.
- `HudSkills` (`src/ui/hud/hud-skills.ts`) shows the 40px Skills button in the top-right
  column below the score chip (`scoreButtonsPosition(...).skills` in `src/ui/layout.ts`),
  with tutorial pulse logic (`skillPulseStep`).
- `HudAchievements` (`src/ui/hud/hud-achievements.ts`) sits directly below it in the same
  column. `HudPlayers` (in-progress UI) aligns its left-edge chip row with the achievements
  button's Y.
- A vertical scroll-and-drag implementation already exists to mirror:
  `ScreenScroll` in `src/ui/vertical-scroll.ts` (drag via window pointer listeners past a 6px
  threshold, `pointertapcapture` stopPropagation so drags never fire taps, `wheel` handling).
- PixiJS v8 container masks are already used (`this.mapLayer.mask = mask` in
  `src/ui/screens/game-screen.ts`, `this.content.mask = this.clip` in `src/ui/kit/popup.ts`).

## Changes

### 1. `HudToolbar` — three-zone layout

- Position the toolbar row at the bottom-left origin (drop the centering + `row.scale`
  to-fit logic).
- **Left, pinned:** Skills `IconButton` (48px, same `ACTION_BTN` styling as the other action
  buttons) at `SIDE_PADDING` from the left edge. Clicking it calls
  `useGameStore.getState().setOverlay({ kind: 'skill' })`. It is always rendered while the
  toolbar is visible, regardless of selection / available actions.
- **Right, pinned:** End Turn `IconButton` at `screenW - SIDE_PADDING - buttonWidth`. Keeps
  the `LAST_TURN_COLOR` on the last turn and both existing pulse rings (tutorial
  `tutorialHighlightEndTurn`, and the "no action available anywhere" ring).
- **Center:** the `toolbarSpecs()` buttons (icon + text) laid out left-to-right inside a
  clipped sub-container spanning from the skills button's right edge to the end-turn button's
  left edge (minus gaps). If the content is narrower than the strip, it sits at the left of
  the strip; no scrolling is possible in that case.

### 2. Center clipping + horizontal scroll

- Clip the center content with a `Graphics` rectangle mask sized to the strip width (same
  technique as `game-screen.ts` / `popup.ts`).
- Scrolling mirrors `ScreenScroll`, horizontal:
  - `pointerdown` on the center container starts tracking; once the pointer travels more than
    a 6px threshold the gesture becomes a drag and content follows the pointer, clamped to
    `[0, maxScroll]`.
  - `pointertapcapture` stops propagation when the gesture was a drag, so a drag that ends
    over a button never activates it.
  - `wheel` scrolls the strip using `deltaX + deltaY` (so a plain vertical wheel also scrolls
    a horizontal strip).
  - Window-level `pointermove` / `pointerup` / `pointercancel` listeners are attached while a
    drag is active and removed on release.
- Scroll offset resets to `0` on rebuild (each `update()`). On resize, `layout()` recomputes
  the strip width and re-clamps the offset.
- No edge fades / chevrons (explicitly declined).

### 3. Remove `HudSkills`

- Delete the `new HudSkills()` mount in `src/ui/screens/game-screen.ts` and the
  `src/ui/hud/hud-skills.ts` file.
- Move the tutorial skills-button pulse (`skillPulseStep` ring) onto the new left toolbar
  Skills button.
- Update the tutorial text in `src/game/tutorial/tutorial-steps.ts` (the `openForestry` step)
  from "pulsing skills button, bottom right" to "bottom left".
- `scoreButtonsPosition()` in `src/ui/layout.ts` drops the now-unused `skills` field;
  `HudAchievements` and `HudPlayers` keep using `achievements`. `SKILLS_BUTTON_SIZE` stays
  (still used by achievements / players chips).

### 4. Tests

- `tests/hud-toolbar.test.ts`: update child-count / index expectations (the Skills button is
  now always present; action buttons live inside the center container). Add tests:
  - skills button is present and opens the skill overlay on tap;
  - end turn is pinned to the right edge;
  - the center is clipped;
  - dragging scrolls the content;
  - wheel scrolls the content;
  - a drag that ends over a button does not trigger it.
- `tests/hud-skills.test.ts`: becomes achievements-only placement tests (drop the skills
  position cases).

## Behavior notes

- Toolbar visibility unchanged: hidden while `aiActive`; during game over the pinned buttons
  show exactly as today.
- Action tutorial highlight rings move into the center content container so they scroll and
  clip together with their button.
- The Skills button remains clickable whenever the toolbar is visible (same behavior as the
  current `HudSkills`, which has no disabled state).
- **Out of scope:** multiplayer lobby / setup screens, the achievements button, the player
  chip row, save/load, and any other HUD element.

## Open questions

None.