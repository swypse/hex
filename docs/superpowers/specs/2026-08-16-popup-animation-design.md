# Design: Popup duration, position, and slide animations

Date: 2026-08-16

## Goal

Fix popup presentation: stay fully visible at least 5 seconds, position the stack at the left edge vertically centered, slide popups in from `left: -500px` to `left: 10px` and slide them back out to `-500px`, with a `max-width` of 400px.

## Background

Currently popups fade out after 300ms (too fast), sit at the top-left corner overlapping the players list, and only animate `opacity`.

## Changes

### index.html (CSS)

- `#popup-stack`: left edge at `10px`, vertically centered, newest on top flowing downward:

```css
#popup-stack { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 6px; z-index: 10; }
```

- `.popup`: add `max-width: 400px`, keep `overflow: hidden`, replace the opacity transition with a `left` transition:

```css
#popup-stack .popup { padding: 8px 12px; border-radius: 4px; color: #fff; display: flex; align-items: center; gap: 8px; transition: left 0.3s ease; cursor: pointer; position: relative; left: -500px; max-width: 400px; }
```

### src/ui/popups.ts

- On show: set `popup.style.left = '10px'` after appending (forces slide-in from the CSS default `-500px`).
- Auto-dismiss after **5000ms** fully-visible, then slide out to `-500px` and remove from DOM after the transition.
- Click / ✕: slide out to `-500px` immediately (no 5s wait), then remove.
- Keep `showPopup(text, opts)` signature unchanged — no changes needed in `gameScreen.ts`.

## Tests

Manual verification via headless Chrome:
- Popup appears at left edge, vertically centered, slides in from left.
- Remains fully visible ~5s before sliding out.
- Clicking it dismisses it immediately.
- Max width 400px respected.
