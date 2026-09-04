# Mobile Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game playable on mobile: pinch-to-zoom, `touch-action`/viewport hardening, and a responsive HUD.

**Architecture:** Two-finger pinch is implemented in the existing pointer-event flow in `gameController.ts`; the viewport meta and CSS hardening live in `index.html`.

**Tech Stack:** TypeScript, PixiJS 8, React, CSS, Vite, Vitest.

## Global Constraints

- No new dependencies.
- Desktop behavior (wheel zoom, single-finger drag, tap) must be unchanged.
- Existing 287 tests pass; `npm run typecheck` clean.
- No game-logic changes in `src/game/*`.

---

### Task 1: Pinch zoom in the controller

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: existing `clampZoom`, `clampPan`, `zoomAroundCursor`, `applyTransform`, `stopCameraAnimation`, `stopInertia`.
- Produces: two-finger pinch zoom + midpoint pan on the map container.

- [ ] **Step 1: Add pointer/pinch fields**

Add near the other drag fields (around line 68-83):

```ts
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchActive = false;
  private pinchStartZoom = 1;
  private pinchStartDist = 0;
  private pinchStartMidpoint = { x: 0, y: 0 };
  private pinchStartPan = { x: 0, y: 0 };
```

- [ ] **Step 2: Add pinch helper methods**

Add these methods to the class (near `onWindowUp`):

```ts
  private pointerDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  private pointerMidpoint(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private beginPinch(): void {
    if (this.pointers.size < 2) return;
    this.stopCameraAnimation();
    this.stopInertia();
    this.pinchActive = true;
    this.dragging = false;
    this.dragActive = false;
    this.pinchStartZoom = this.zoom;
    this.pinchStartDist = this.pointerDistance();
    this.pinchStartMidpoint = this.pointerMidpoint();
    this.pinchStartPan = { ...this.pan };
  }

  private applyPinch(): void {
    if (!this.pinchActive || this.pointers.size < 2 || !this.app || !this.sim) return;
    const dist = this.pointerDistance();
    const midpoint = this.pointerMidpoint();
    const nextZoom = clampZoom(this.pinchStartZoom * (dist / this.pinchStartDist), this.maxZoom);
    const scale = this.baseScale * this.zoom;
    const nextScale = this.baseScale * nextZoom;
    this.pan = zoomAroundCursor(midpoint, this.pan, scale, nextScale);
    this.zoom = nextZoom;
    this.pan = clampPan(
      { x: this.pinchStartPan.x + (midpoint.x - this.pinchStartMidpoint.x), y: this.pinchStartPan.y + (midpoint.y - this.pinchStartMidpoint.y) },
      this.sim.map.radius,
      HEX_SIZE,
      this.baseScale * this.zoom,
      this.app.screen.width,
      this.app.screen.height,
      HEX_TILT,
    );
    this.applyTransform();
  }

  private endPinch(): void {
    this.pinchActive = false;
  }
```

- [ ] **Step 3: Track pointers on pointerdown**

In the `pointerdown` handler inside `render()` (currently `gameController.ts:1222`), after the existing single-finger setup, add pointer tracking. Append at the end of the existing `pointerdown` handler:

```ts
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      if (this.pointers.size >= 2) {
        this.beginPinch();
        return;
      }
```

- [ ] **Step 4: Handle pointermove for pinch**

The single-finger drag is handled by the window-level `onWindowMove`. For pinch, add an inline `pointermove` handler on the container alongside the existing `pointerdown` (before it), OR extend `onWindowMove`. Add to the container inside `render()` (before the existing `pointerdown` registration):

```ts
      this.mapView.container.on('pointermove', (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
        if (this.pinchActive) this.applyPinch();
      });
```

Note: `e.global` is a Pixi event property; use it as in the existing handlers.

- [ ] **Step 5: Handle pointerup/cancel for pinch**

Add a window-level `pointerup`/`pointercancel` cleanup for pointers. Register them alongside the existing single-finger listeners in the `pointerdown` handler (after `window.addEventListener('pointercancel', this.onWindowUp);`):

```ts
      window.addEventListener('pointerup', this.onWindowUpPointer);
      window.addEventListener('pointercancel', this.onWindowUpPointer);
```

Add the handler method (near `onWindowUp`):

```ts
  private onWindowUpPointer = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pinchActive && this.pointers.size < 2) this.endPinch();
  };
```

- [ ] **Step 6: Remove the pointer listeners in `destroy()`**

In `destroy()` (around line 122-136), add after the existing `window.removeEventListener` calls:

```ts
    window.removeEventListener('pointerup', this.onWindowUpPointer);
    window.removeEventListener('pointercancel', this.onWindowUpPointer);
```

- [ ] **Step 7: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: pinch-to-zoom on touch devices"
```

---

### Task 2: Viewport and touch-action hardening

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: viewport meta disables page zoom; canvas and controls get `touch-action` rules.

- [ ] **Step 1: Update the viewport meta**

Replace line 5:

```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

- [ ] **Step 2: Add touch-action CSS**

Add to the `<style>` block (after the `button.selected` rule, around line 19):

```css
    #game-root canvas { touch-action: none; }
    button, #fog-toggle, #skills-btn { touch-action: manipulation; }
```

- [ ] **Step 3: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass (HTML change only).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: harden viewport and touch-action for mobile"
```

---

### Task 3: Responsive HUD

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: a `@media (max-width: 600px)` block that keeps the HUD from overlapping and enlarges touch targets.

- [ ] **Step 1: Add the media query**

Append to the `<style>` block (after `#popup-stack .popup .popup-close` rule, the last rule at line 48):

```css
    @media (max-width: 600px) {
      button { font-size: 18px; padding: 12px 20px; min-height: 44px; }
      #score-info { width: 48px; height: 48px; font-size: 18px; top: 4px; right: 4px; }
      #mode-label { top: 60px; left: 4px; font-size: 10px; padding: 3px 8px; }
      #players-list { top: 4px; left: 4px; font-size: 12px; padding: 6px 10px; }
      #turn-info { top: 4px; font-size: 13px; padding: 6px 10px; }
      #money-info { top: 40px; font-size: 12px; padding: 3px 10px; }
      #skills-btn { top: 58px; right: 8px; }
      #fog-toggle { top: 4px; right: 60px; font-size: 11px; padding: 6px 8px; }
      #end-turn-btn { bottom: 8px; right: 8px; }
      #action-toolbar { bottom: 8px; gap: 6px; }
      #action-toolbar button { padding: 10px 14px; }
      #selected-info { bottom: 76px; left: 8px; max-width: 45vw; font-size: 12px; }
    }
```

Adjust positions if needed during manual verification — the goal is no overlap between
`#score-info`, `#skills-btn`, `#fog-toggle`, `#mode-label`, and `#players-list` on a
~390px viewport, and a ≥44px touch height on `button`.

- [ ] **Step 2: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass (CSS change only).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: responsive HUD for narrow screens"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Desktop regression**

Run: `npm run dev`, start a game.
Expected: wheel zoom, single-finger drag, tap-select all work as before.

- [ ] **Step 2: Mobile emulation**

In DevTools, set a ~390x844 device (iPhone 12) and refresh.
Check:
- Pinching with two fingers zooms around the pinch midpoint; two-finger drag pans.
- No page-level pinch zoom (viewport disabled), no scroll/pull-to-refresh during map pan.
- Tapping a unit selects it (single tap after a quick touch).
- HUD elements do not overlap: score circle, skills button, fog toggle, mode label, players
  list, turn/money info, toolbar, end-turn button, selected-info.
- Buttons are comfortably tappable (≥44px).
