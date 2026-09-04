# FPS/Memory Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible FPS/heap-usage indicator to the game HUD.

**Architecture:** A new `PerfIndicator` React component samples FPS and `performance.memory`, writing into a DOM ref's `textContent` on a 250 ms interval. Styling lives in `index.html`.

**Tech Stack:** TypeScript, React 19, CSS, Vite, Vitest.

## Global Constraints

- No new dependencies.
- No setState-per-frame (avoid React re-render churn).
- `performance.memory` is Chromium-only; other browsers show `—`.
- Existing 290 tests pass; `npm run typecheck` clean.

---

### Task 1: Add the PerfIndicator component and wire it in

**Files:**
- Create: `src/screens/hud/PerfIndicator.tsx`
- Modify: `src/screens/GameScreen.tsx`

**Interfaces:**
- Consumes: nothing from the store; reads `performance`/`requestAnimationFrame` directly.
- Produces: `<PerfIndicator />` renders a `<div id="perf-indicator">` whose `textContent` updates with FPS and memory.

- [ ] **Step 1: Create the component**

Create `src/screens/hud/PerfIndicator.tsx`:

```tsx
import { useEffect, useRef } from 'react';

interface MemoryInfo {
  usedJSHeapSize: number;
}

export function PerfIndicator(): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;
    let frames = 0;
    let emaFps = 0;
    let rafActive = false;

    const tick = (): void => {
      frames++;
      rafId = requestAnimationFrame(tick);
    };

    const sample = (): void => {
      const el = ref.current;
      if (!el) return;
      const mem = (performance as Performance & { memory?: MemoryInfo }).memory;
      const memText = mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB` : '—';
      if (emaFps === 0) {
        emaFps = frames;
      } else {
        emaFps = emaFps * 0.7 + frames * 0.3;
      }
      el.textContent = `${Math.round(emaFps)} fps · ${memText}`;
      frames = 0;
    };

    rafActive = true;
    rafId = requestAnimationFrame(tick);
    const interval = window.setInterval(sample, 250);

    return () => {
      rafActive = false;
      cancelAnimationFrame(rafId);
      window.clearInterval(interval);
    };
  }, []);

  return <div id="perf-indicator" ref={ref}>—</div>;
}
```

Note: the `rafActive` flag is unused by the tick loop as written; it is harmless, but remove it to keep the file clean. The final component:

```tsx
import { useEffect, useRef } from 'react';

interface MemoryInfo {
  usedJSHeapSize: number;
}

export function PerfIndicator(): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;
    let frames = 0;
    let emaFps = 0;

    const tick = (): void => {
      frames++;
      rafId = requestAnimationFrame(tick);
    };

    const sample = (): void => {
      const el = ref.current;
      if (!el) return;
      const mem = (performance as Performance & { memory?: MemoryInfo }).memory;
      const memText = mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB` : '—';
      emaFps = emaFps === 0 ? frames : emaFps * 0.7 + frames * 0.3;
      el.textContent = `${Math.round(emaFps)} fps · ${memText}`;
      frames = 0;
    };

    rafId = requestAnimationFrame(tick);
    const interval = window.setInterval(sample, 250);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearInterval(interval);
    };
  }, []);

  return <div id="perf-indicator" ref={ref}>—</div>;
}
```

- [ ] **Step 2: Wire it into the game screen**

In `src/screens/GameScreen.tsx`:
- Add `import { PerfIndicator } from './hud/PerfIndicator';`
- Add `<PerfIndicator />` after `<MoneyInfo />` (line 47).

- [ ] **Step 3: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/screens/hud/PerfIndicator.tsx src/screens/GameScreen.tsx
git commit -m "feat: add FPS/memory indicator component"
```

---

### Task 2: Style the indicator

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: `#perf-indicator` positioned just below `#money-info`, desktop + mobile.

- [ ] **Step 1: Add the desktop CSS rule**

In `index.html`, after the `#money-info` rule (around line 42), add:

```css
    #perf-indicator {
      position: absolute; top: 92px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.6); padding: 2px 10px; border-radius: 4px;
      font-size: 11px; color: #9ecbff; font-family: monospace;
    }
```

- [ ] **Step 2: Add the mobile override**

Inside the existing `@media (max-width: 600px)` block, add:

```css
      #perf-indicator { top: 74px; font-size: 10px; }
```

- [ ] **Step 3: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass (CSS-only change).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: style FPS/memory indicator"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, start a game.
Check:
- A top-center indicator shows live FPS and heap usage (e.g. `60 fps · 48.3 MB`).
- It updates ~4×/s and sits just below the money panel without overlapping.
- On a narrow (mobile) viewport it is positioned below the money panel without overlap.
- If opened in Firefox/Safari, memory shows `—`.
