# Design: Popup queue, styling, scrollbars

Date: 2026-08-16

## Goal

Fix popup presentation and behavior:
- The popup container is always visible, `max-width: 15%` of viewport width.
- Notifications are accumulated; each popup is added no earlier than 300ms after the previous.
- No in/out animations — popups appear and disappear immediately (after 5s visible, or when explicitly closed).
- `1em` gap between popups.
- Default text size ×1.5.
- Disable body/html scrollbars.

## Background

Popups currently slide in/out with a `left` transition, the container toggles `display:none` when empty, and notifications all appear at once.

## Changes

### index.html (CSS)

- Disable scrollbars: add `overflow: hidden;` to the `html, body` rule.
- `#popup-stack`: keep `position: absolute; left: 10px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; z-index: 10;` and add `max-width: 15vw; width: fit-content;`. Remove nothing else — the container stays visible always (no `display:none` logic in JS).
- `.popup`: remove `transition: left 0.3s ease; position: relative; left: -500px;` (no animation, no off-screen start); add `gap` is on the container instead; set `font-size: 24px` (16px base × 1.5).
- `.popup` margin: use the container's `gap: 1em` (not per-popup margin) for spacing between popups.

### src/ui/popups.ts

- Queue-based: `showPopup` pushes to a pending queue and starts a processor if not already running. The processor adds the next popup, then schedules the following one `QUEUE_GAP_MS` (300ms) later. Only one processor timer runs at a time.
- Each popup is appended to the stack immediately (no slide-in), stays `VISIBLE_MS` (5000ms), then is removed immediately (no slide-out). Click / ✕ removes it immediately too.
- Remove the `display:none` empty-state toggling — the container remains visible.
- Keep `showPopup(text, opts?: { background?: string; color?: string })` unchanged.

## Tests

Manual verification via headless Chrome:
- Container present with `max-width: 15vw`, always `display: flex` (not `none`).
- Multiple rapid `showPopup` calls produce popups spaced ≥300ms apart (counted over time).
- Each popup disappears immediately at 5s; clicking dismisses immediately.
- No scrollbars on the page.
- Text appears 1.5× larger.
