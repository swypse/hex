# Pan Constraint Padding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relax the pan clamp so the map edge can sit up to 10% of the screen inside the viewport, showing empty spacing around the map.

**Architecture:** Add `PAN_PADDING = 0.1` to `src/game/zoom.ts` and expand the clamp bounds by `PAN_PADDING * screenW/screenH` on each side. Update `clampPan` tests to the new semantics.

**Tech Stack:** TypeScript, Vite, Vitest.

## Global Constraints

- No new dependencies.
- The "center when map smaller than screen" fallback in `clampAxis` is unchanged.
- Existing 292 tests pass; `npm run typecheck` clean.

---

### Task 1: Add pan padding

**Files:**
- Modify: `src/game/zoom.ts`
- Test: `tests/zoom.test.ts`

**Interfaces:**
- Consumes: `clampPan` args (unchanged signature).
- Produces: `PAN_PADDING` exported; `clampPan` allows the map edge to sit within
  `PAN_PADDING * screen` inside the viewport.

- [ ] **Step 1: Write the failing tests (TDD)**

Update the two "keeps the map covering the screen" tests to the padded semantics in
`tests/zoom.test.ts`:

```ts
  it('keeps the map within padding distance of the screen edges horizontally', () => {
    const radius = 6; // map wider than the 800px screen
    const hexSize = 40;
    const scale = 1;
    const screenW = 800;
    const padX = PAN_PADDING * screenW;
    const halfW = Math.sqrt(3) * radius * hexSize * scale;
    // map spans [pan.x-halfW, pan.x+halfW]; its edges must stay within padX of the screen
    for (const px of [-9999, 0, 400, 9999]) {
      const clamped = clampPan({ x: px, y: 0 }, radius, hexSize, scale, screenW, 600, 1);
      expect(clamped.x - halfW).toBeGreaterThanOrEqual(-padX);
      expect(clamped.x + halfW).toBeLessThanOrEqual(screenW + padX);
    }
  });

  it('keeps the map within padding distance of the screen edges vertically with tilt', () => {
    const radius = 6;
    const hexSize = 40;
    const scale = 2;
    const tilt = 0.7;
    const screenH = 600;
    const padY = PAN_PADDING * screenH;
    const halfH = 1.5 * radius * hexSize * scale * tilt;
    for (const py of [-9999, 0, 300, 9999]) {
      const clamped = clampPan({ x: 0, y: py }, radius, hexSize, scale, 800, screenH, tilt);
      expect(clamped.y - halfH).toBeGreaterThanOrEqual(-padY);
      expect(clamped.y + halfH).toBeLessThanOrEqual(screenH + padY);
    }
  });
```

Add `PAN_PADDING` to the test's imports from `'../src/game/zoom'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/zoom.test.ts`
Expected: the two updated tests fail (current clamp keeps edges exactly at screen bounds).

- [ ] **Step 3: Implement in `zoom.ts`**

Add the constant near the other zoom constants (after `INERTIA_STOP_SPEED`, around line 66):

```ts
export const PAN_PADDING = 0.1; // fraction of the screen, on each side
```

Update `clampPan` (lines 39-62):

```ts
export function clampPan(
  pos: { x: number; y: number },
  mapRadius: number,
  hexSize: number,
  scale: number,
  screenW: number,
  screenH: number,
  tilt: number,
): { x: number; y: number } {
  const halfW = Math.sqrt(3) * mapRadius * hexSize * scale;
  const halfH = 1.5 * mapRadius * hexSize * scale * tilt;
  // Allow the map edge to sit up to PAN_PADDING * screen inside the viewport.
  // Map spans [pan.x-halfW, pan.x+halfW]; pan.x in [screenW-halfW-padX, halfW+padX].
  const padX = PAN_PADDING * screenW;
  const padY = PAN_PADDING * screenH;
  const xMin = screenW - halfW - padX;
  const xMax = halfW + padX;
  const yMin = screenH - halfH - padY;
  const yMax = halfH + padY;
  const clampAxis = (v: number, lo: number, hi: number): number =>
    lo < hi ? Math.min(hi, Math.max(lo, v)) : (lo + hi) / 2;
  return {
    x: clampAxis(pos.x, xMin, xMax),
    y: clampAxis(pos.y, yMin, yMax),
  };
}
```

- [ ] **Step 4: Run the zoom tests**

Run: `npx vitest run tests/zoom.test.ts`
Expected: all pass, including the "centers the map when smaller than the screen" test.

- [ ] **Step 5: Typecheck and full suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/zoom.ts tests/zoom.test.ts
git commit -m "feat: allow 10% pan padding around the map"
```

---

### Task 2: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, start a game.
Check:
- Panning a larger-than-screen map lets the edge come ~10% inside the viewport before
  stopping, showing empty background spacing.
- On a smaller-than-screen map, the map still centers.
- Pinch zoom and inertia still respect the padded bounds (no map thrown fully off-screen).
