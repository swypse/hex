# FPS/Memory Indicator Design

Date: 2026-08-22

## Problem

No way to see runtime performance (FPS and heap usage) while playing. Add a small,
always-visible indicator to the game HUD.

## Design

### 1. New component `src/screens/hud/PerfIndicator.tsx`

A React component rendered in `GameScreen` under `#money-info` (top-center). It:

- Uses `useEffect` with `setInterval` at 250 ms.
- Measures FPS by counting `requestAnimationFrame` ticks between samples (frames /
  elapsed seconds), smoothed with an exponential moving average (α = 0.3).
- Reads `performance.memory.usedJSHeapSize` when present and formats it as MB
  (`(bytes / 1048576).toFixed(1)`).
- Writes the text directly into a `<div ref>`'s `textContent` each tick (no
  setState-per-frame, avoiding React re-render churn).
- On browsers without `performance.memory`, shows `—` for memory.

Display format: `"60 fps · 48.3 MB"`.

### 2. Styling (`index.html`)

Add a rule:

```css
#perf-indicator {
  position: absolute; top: 92px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.6); padding: 2px 10px; border-radius: 4px;
  font-size: 11px; color: #9ecbff; font-family: monospace;
}
```

`#money-info` is at `top: 44px`; 92px places the indicator just below it.

Add a mobile override inside `@media (max-width: 600px)`:

```css
#perf-indicator { top: 74px; font-size: 10px; }
```

(`#money-info` is at `top: 40px` on mobile.)

### 3. Wiring (`src/screens/GameScreen.tsx`)

Add `<PerfIndicator />` after `<MoneyInfo />`.

## Files touched

- `src/screens/hud/PerfIndicator.tsx` (new)
- `src/screens/GameScreen.tsx`
- `index.html`

## Testing

- `npm run typecheck`, `npm test`, `npm run build` pass.
- Manual: the top-center indicator shows live FPS and heap usage in MB; on Firefox/Safari
  memory shows `—`; it doesn't overlap `#money-info` on desktop or mobile widths.
