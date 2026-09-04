# Mobile Support Design

Date: 2026-08-22

## Problem

The game is playable on desktop but not on mobile browsers:

1. Zoom is bound to the `wheel` event only, which never fires on touch — mobile users
   cannot zoom.
2. Browser gestures (scroll, pinch, pull-to-refresh) interfere with map panning because
   there is no `touch-action` and the viewport allows page zoom.
3. The HUD uses fixed pixel positions that overlap on narrow screens, and buttons are too
   small for touch.

## Design

### 1. Pinch zoom (`src/controller/gameController.ts`)

Track active pointers on the map container with standard pointer events (no new deps):

- Add `private pointers = new Map<number, { x: number; y: number }>()` and
  `private pinchActive = false`.
- On `pointerdown` (first or additional): store the pointer in the map.
  - When a second pointer lands while the first is still down → enter pinch mode: stop
    camera/inertia, cancel single-finger drag. Record `pinchStartZoom = zoom`,
    `pinchStartDist` (distance between the two pointers), `pinchStartMidpoint`
    (average of the two pointer positions), and `pinchStartPan`.
- On `pointermove` with exactly 2 active pointers: compute the current distance and
  midpoint; set `zoom = clampZoom(pinchStartZoom * newDist / pinchStartDist)`; set
  `pan = clampPan(pinchStartPan + (midpoint - pinchStartMidpoint), ...)`; then
  `applyTransform()`.
- On `pointerup`/`pointercancel`: remove the pointer from the map. When fewer than 2
  remain, exit pinch mode and restore single-finger drag behavior; when none remain,
  stop.
- Single-pointer drag/pan/tap behavior is unchanged when only one pointer is active.

The existing `wheel` zoom handler is unchanged; pinch adds a touch equivalent.

### 2. touch-action and viewport (`index.html`)

- Viewport meta becomes:
  `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no`
- Add CSS: `#game-root canvas { touch-action: none; }` so pinch/pan goes to the game, and
  `button, #fog-toggle, #skills-btn { touch-action: manipulation; }` to remove the
  double-tap-zoom delay on controls while keeping taps.

### 3. Responsive HUD (`index.html` media query)

Add `@media (max-width: 600px)`:
- Compact the top bar: `#mode-label` and `#players-list` stack without overlapping;
  `#turn-info`/`#money-info` stay centered but slightly smaller.
- Reposition `#fog-toggle` and `#skills-btn` so they do not collide with `#score-info`
  (which shrinks to ~48px on mobile).
- Bottom controls: enlarge `button` padding/font so touch targets are ~44px tall;
  `#selected-info` gets a max-width so it does not cover `#action-toolbar`.
- Keep the desktop layout untouched; the media query only applies below 600px.

## Files touched

- `src/controller/gameController.ts`
- `index.html`

## Testing

- Existing suite (287 tests) and `npm run typecheck` pass; no logic changes to tests.
- Manual: desktop unchanged (wheel zoom, drag, tap). On a phone / DevTools mobile
  emulation at ~390px: pinch zooms around the midpoint, two-finger drag pans, no page
  scroll/pull-to-refresh, and the HUD does not overlap.
