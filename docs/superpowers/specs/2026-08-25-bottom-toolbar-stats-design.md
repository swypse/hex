# Bottom Toolbar, Popup Removal, and Stats Screen Design

Date: 2026-08-25

## Problem

The in-game UI has three issues:

1. Left-side toast notifications (`PopupStack`) clutter the screen and are no
   longer wanted.
2. Action buttons float bottom-center and End Turn sits bottom-right separately;
   there is no single home for game actions.
3. There is no way to view player standings mid-game.

## Decisions

1. **Remove the popup notification system entirely** (UI, plumbing, and call
   sites), not just hide it.
2. **Replace the floating action buttons with a full-width bottom toolbar** that
   the map never renders under.
3. **Add a `Stats` action** on the toolbar opening a full-screen `GameStats`
   overlay listing all players sorted by total score descending.

## Section 1 — Popup system removal

Delete the whole left-notification pipeline:

- Delete `src/ui/overlays/PopupStack.ts` and `src/ui/popupQueue.ts`.
- Store (`src/store/gameStore.ts`): remove the `Popup` interface, the `popups`
  field, `pushPopup`, `dismissPopup`, and `nextPopupId`. The `centerMessage`
  field and its actions stay (that is the centered "Your turn!" notice, not a
  left notification).
- `src/controller/gameController.ts`: remove the `showPopup` import, all 16
  `showPopup` call sites, and the now-unused `tribeBackground()` helper. In-world
  feedback remains: floating `-N` hp text, the capture triangle, center messages.
  The lobby `error` message handler (`onHostMessage` case `'error'`) loses its
  toast; connection state is still surfaced by the lobby screen itself.
- `src/ui/overlays/OverlayManager.ts`: remove the `popup` entry, the
  `PopupStack` import, and the `popups.length` check in `active()`.
- `tests/gameStore.test.ts`: remove the `pushPopup` / `dismissPopup` tests and
  the `popups: []` line in `beforeEach`.

## Section 2 — Full-width bottom toolbar

- **`HudToolbar` rework**: a persistent full-width bar, fixed height
  `TOOLBAR_HEIGHT = 64`, dark panel background, docked at the bottom of the HUD
  layer. Always visible during the game (not hidden when there are no contextual
  actions).
- **Layout**:
  - Left group: `Skills` button, then the contextual action buttons from
    `toolbarSpecs()` (capture / spawn / upgrade village / build factory-mine-port
    / road / heal / extract forest / upgrade ship).
  - Right group: `End Turn` (disabled while `store.aiActive`) and `Stats`.
- **Fold in and delete**: `HudEndTurn.ts` and `HudSkills.ts` are removed; their
  buttons live in the bar. `GameScreen.ts` no longer mounts them as separate
  widgets.
- **SelectedInfo**: bottom offset becomes `TOOLBAR_HEIGHT + 8` so it never
  overlaps the bar. Other HUD (ScoreInfo, TurnInfo, MoneyInfo, PlayersList)
  unchanged.
- **Known limitation**: if the left group exceeds the screen width on narrow
  windows it clips at the left edge; no scrolling or wrapping (YAGNI).

## Section 3 — Map shifted up, not rendered under the toolbar

The map fits, pans, zooms, and culls within the area above the toolbar and never
draws into the toolbar strip.

- **New shared constant**: `TOOLBAR_HEIGHT = 64` in `src/ui/layout.ts`, imported
  by both the GameScreen controller and `gameController`.
- **`gameController`**: add a helper `mapHeight() = app.screen.height -
  TOOLBAR_HEIGHT` and use it everywhere the map currently uses the full screen
  height (~10 sites):
  - `applyFitToScreen` — fit scale and pan center
  - `resetView` — pan center
  - `maxZoomFor` — aspect ratio
  - every `clampPan` call — pan bounds
  - `isCellVisible` — visibility check
  - `bringCellIntoView` — target center
  - the `Viewport` passed to `mapView.update`
- **Mask**: the GameScreen controller assigns a `Graphics` mask to `mapLayer`
  spanning `(0, 0, screen.width, mapHeight())`, guaranteeing nothing renders
  under the toolbar even during zoom/pan. Transient world effects (floating hp
  text, score-fly, fog reveal) are children of `mapLayer` and are clipped by the
  same mask. The HUD layer is not masked. The mask is resized on window resize.

## Section 4 — GameStats overlay

- **Store**: add `statsOpen: boolean` (default `false`) and
  `setStatsOpen(open: boolean)`. Consistent with `spawnDialogOpen` /
  `skillTreeOpen`.
- **New overlay** `src/ui/overlays/GameStats.ts`, registered in `OverlayManager`
  and gated by `inGame && statsOpen`.
- **Content**: full-screen dark overlay over the paused game; title "Stats"; a
  panel listing every player sorted by **total score descending** (sort is stable,
  matching the game-over table). Each row: **name, tribe name, total score,
  kills** — e.g. `Cats' Champion (Cats): 123 pts (kills: 5)` — tribe-colored,
  with `(you)` / `(AI)` markers like the players list. Rows recompute live via a
  store subscription (scores change during play).
- **Close**: Close button + `Escape` (mirrors the skill tree). Re-centers on
  resize.
- **Score source**: `totalScore(map, player)` via `gameController.getMap()`,
  falling back to `player.score` when no map (same as the existing HUD).

## Files touched

- Delete: `src/ui/overlays/PopupStack.ts`, `src/ui/popupQueue.ts`,
  `src/ui/hud/HudEndTurn.ts`, `src/ui/hud/HudSkills.ts`.
- Create: `src/ui/layout.ts`, `src/ui/overlays/GameStats.ts`.
- Modify: `src/ui/hud/HudToolbar.ts` (full-width bar),
  `src/ui/screens/GameScreen.ts` (mask, widget list, SelectedInfo offset),
  `src/ui/overlays/OverlayManager.ts` (remove popup entry, add stats entry),
  `src/store/gameStore.ts` (remove popups, add statsOpen),
  `src/controller/gameController.ts` (mapHeight uses, remove showPopup calls),
  `src/ui/hud/HudSelected.ts` (bottom offset),
  `tests/gameStore.test.ts` (popup tests removed, statsOpen test added).

## Testing

- `npm run typecheck` and `npm test` must pass.
- `tests/gameStore.test.ts`: popup tests removed; one small test for `statsOpen`.
- Manual smoke test (`npm run dev`):
  1. No left-side toasts anywhere — start game, attack, capture, end turn: only
     floating hp text and the centered "Your turn!" appear.
  2. Bottom bar is full-width; the map never renders beneath it; zoom/pan keeps
     the map inside the area above the bar; resize behaves.
  3. Bar shows Skills + contextual actions on the left, End Turn (disabled during
     AI) + Stats on the right; actions appear/disappear correctly on selection.
  4. Stats opens the overlay: players sorted by score desc with
     name/tribe/score/kills, live-updates on score change, Close + Escape work,
     and the game resumes underneath.
