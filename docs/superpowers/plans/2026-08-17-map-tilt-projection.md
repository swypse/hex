# Map Tilt Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tilt the whole hex map toward the camera by baking a Y-squash factor (`HEX_TILT = 0.7`) into the hex projection math, so projected hexes are wider than tall while clicks and camera behavior stay consistent.

**Architecture:** Add one source-of-truth constant `HEX_TILT` in `src/game/hex.ts` and apply it in `hexToPixel`, `pixelToHex`, `hexCorners`, and the private `hexCorner`. Squash texture geometry in `textureFactory.ts` with the same constant so drawn tiles match the footprint. Thread `tilt` through `clampPan`/`inertiaStep` in `src/game/zoom.ts` and update `applyFitToScreen` in `gameController.ts`. All other consumers already derive from `hexToPixel` and squash automatically.

**Tech Stack:** TypeScript, Vitest, PixiJS v8.

## Global Constraints

- `HEX_TILT = 0.7` lives in `src/game/hex.ts` and is the single source of truth; every use imports it from there.
- Units (circle/square/triangle), village name labels, and HP bars stay unsquashed.
- `clampPan` new signature: `clampPan(pos, mapRadius, hexSize, scale, screenW, screenH, tilt)`.
- `inertiaStep` new signature: `inertiaStep(pan, velocity, dt, mapRadius, hexSize, scale, screenW, screenH, tilt)`.
- Spec: `docs/superpowers/specs/2026-08-17-map-tilt-projection-design.md`.
- Commit after each task. Test: `npm test`. Typecheck: `npm run typecheck`.

---

### Task 1: Tilt in the hex projection (`src/game/hex.ts`)

**Files:**
- Modify: `src/game/hex.ts`
- Test: `tests/hex.test.ts`

**Interfaces:**
- Produces: `export const HEX_TILT = 0.7`; tilted `hexToPixel`, `pixelToHex`, `hexCorners`, and private `hexCorner`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

Add to `tests/hex.test.ts`:

```ts
import { HEX_TILT } from '../src/game/hex';

  it('hexToPixel squashes y by HEX_TILT', () => {
    expect(hexToPixel({ q: 0, r: 1 }, 40).y).toBeCloseTo(1.5 * 40 * HEX_TILT);
    expect(hexToPixel({ q: 0, r: 1 }, 40).x).toBeCloseTo(Math.sqrt(3) / 2 * 40);
  });
```

(Add `HEX_TILT` to the existing import from `../src/game/hex`.) The existing `pixelToHex inverts hexToPixel` roundtrip test will now exercise the tilted inverse automatically once the implementation lands.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hex.test.ts`
Expected: FAIL — y is `60` (unsquashed) but expected `42`.

- [ ] **Step 3: Write minimal implementation**

In `src/game/hex.ts`:

```ts
export const HEX_TILT = 0.7; // projected Y squash — hexes wider than tall
```

Update `hexToPixel`:

```ts
export function hexToPixel(h: Axial, hexSize: number): { x: number; y: number } {
  const x = hexSize * (Math.sqrt(3) * h.q + (Math.sqrt(3) / 2) * h.r);
  const y = hexSize * ((3 / 2) * h.r) * HEX_TILT;
  return { x, y };
}
```

Update `pixelToHex` (divide `y` by `HEX_TILT` before solving `r`):

```ts
export function pixelToHex(x: number, y: number, hexSize: number): Axial {
  const r = (2 / 3) * (y / hexSize / HEX_TILT);
  const q = (x / hexSize - (Math.sqrt(3) / 2) * r) / Math.sqrt(3);
  const s = -q - r;
  let qr = Math.round(q);
  let rr = Math.round(r);
  const sr = Math.round(s);
  const dq = Math.abs(qr - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(sr - s);
  if (dq > dr && dq > ds) {
    qr = -rr - sr;
  } else if (dr > ds) {
    rr = -qr - sr;
  }
  return { q: qr, r: rr };
}
```

Update `hexCorner`:

```ts
function hexCorner(h: Axial, corner: number, hexSize: number): { x: number; y: number } {
  const angle = (Math.PI / 3) * corner - Math.PI / 6;
  const p = hexToPixel(h, hexSize);
  return { x: p.x + hexSize * Math.cos(angle), y: p.y + hexSize * Math.sin(angle) * HEX_TILT };
}
```

Update `hexCorners`:

```ts
export function hexCorners(h: Axial, hexSize: number): { x: number; y: number }[] {
  const p = hexToPixel(h, hexSize);
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    corners.push({ x: p.x + hexSize * Math.cos(angle), y: p.y + hexSize * Math.sin(angle) * HEX_TILT });
  }
  return corners;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/hex.test.ts`
Expected: PASS (roundtrip test passes with the tilted inverse; `hexCorners` symmetry test still passes because x and y sums are still ≈ 0).

- [ ] **Step 5: Commit**

```bash
git add src/game/hex.ts tests/hex.test.ts
git commit -m "feat: tilt hex projection math by HEX_TILT"
```

---

### Task 2: Squash tile texture geometry (`src/render/textureFactory.ts`)

**Files:**
- Modify: `src/render/textureFactory.ts`

**Interfaces:**
- Consumes: `HEX_TILT` from `../game/hex`.
- Produces: squashed `hexagonPoints` (Y × `HEX_TILT`); `FillGradient` y-bounds `±hexSize * HEX_TILT`. Tile prisms and village hexagons now match the projected footprint; units unchanged.

- [ ] **Step 1: Import HEX_TILT and squash hexagonPoints**

Update the import from `../game/tileTypes` line — add a new import line:

```ts
import { HEX_TILT } from '../game/hex';
```

Update `hexagonPoints`:

```ts
function hexagonPoints(size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(size * Math.cos(angle), size * Math.sin(angle) * HEX_TILT);
  }
  return points;
}
```

- [ ] **Step 2: Update the FillGradient range in `makeHexTexture`**

Change the gradient `start`/`end` y values to the squashed height:

```ts
  const gradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: -hexSize * HEX_TILT },
    end: { x: 0, y: hexSize * HEX_TILT },
    colorStops: [
      { offset: 0, color: shadeColor(fill, 1.35) },
      { offset: 1, color: bottom },
    ],
    textureSpace: 'global',
  });
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (`hexagonPoints` is used by `makeHexTexture` and `makeVillageTexture`; both now squash, which is intended.)

- [ ] **Step 4: Commit**

```bash
git add src/render/textureFactory.ts
git commit -m "feat: squash tile and village texture geometry to match tilt"
```

---

### Task 3: Thread `tilt` through camera bounds (`src/game/zoom.ts`)

**Files:**
- Modify: `src/game/zoom.ts`
- Test: `tests/zoom.test.ts`

**Interfaces:**
- Consumes: nothing new (tilt passed as a parameter).
- Produces: `clampPan(pos, mapRadius, hexSize, scale, screenW, screenH, tilt)` and `inertiaStep(pan, velocity, dt, mapRadius, hexSize, scale, screenW, screenH, tilt)` — `halfH` multiplied by `tilt`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/zoom.test.ts`:

```ts
describe('clampPan with tilt', () => {
  it('clamps y against the tilted half-height', () => {
    const radius = 2;
    const hexSize = 40;
    const scale = 1;
    const tilt = 0.7;
    const halfH = 1.5 * radius * hexSize * scale * tilt;
    const clamped = clampPan({ x: 0, y: -5000 }, radius, hexSize, scale, 800, 600, tilt);
    expect(clamped.y).toBe(-(halfH - 1));
  });

  it('applies half the vertical extent for tilt 1', () => {
    const radius = 2;
    const clamped = clampPan({ x: 0, y: 0 }, radius, 40, 1, 800, 600, 1);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });
});

describe('inertiaStep with tilt', () => {
  it('passes tilt through to the clamp', () => {
    const result = inertiaStep({ x: 0, y: -5000 }, { x: 0, y: 0 }, 0.1, 2, 40, 1, 800, 600, 0.7);
    const halfH = 1.5 * 2 * 40 * 1 * 0.7;
    expect(result.pan.y).toBe(-(halfH - 1));
  });
});
```

Note: the existing `clampPan` test (line ~36) and `inertiaStep` tests (lines ~62-79) pass a 6-arg / 8-arg call; they must be updated to the new signatures (add `1` as tilt) in Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/zoom.test.ts`
Expected: FAIL — TS/compile error (argument count) and behavior.

- [ ] **Step 3: Update implementation**

Update `clampPan`:

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
  return {
    x: Math.min(Math.max(pos.x, -(halfW - 1)), screenW + (halfW - 1)),
    y: Math.min(Math.max(pos.y, -(halfH - 1)), screenH + (halfH - 1)),
  };
}
```

Update `inertiaStep` signature and its internal `clampPan` call:

```ts
export function inertiaStep(
  pan: { x: number; y: number },
  velocity: { x: number; y: number },
  dt: number,
  mapRadius: number,
  hexSize: number,
  scale: number,
  screenW: number,
  screenH: number,
  tilt: number,
): { pan: { x: number; y: number }; velocity: { x: number; y: number }; done: boolean } {
  const next = clampPan(
    { x: pan.x + velocity.x * dt, y: pan.y + velocity.y * dt },
    mapRadius,
    hexSize,
    scale,
    screenW,
    screenH,
    tilt,
  );
  const nextVelocity = decayVelocity(velocity, dt);
  const speed = Math.hypot(nextVelocity.x, nextVelocity.y);
  const pinned = next.x === pan.x && next.y === pan.y && (velocity.x !== 0 || velocity.y !== 0);
  return {
    pan: next,
    velocity: nextVelocity,
    done: speed < INERTIA_STOP_SPEED || pinned,
  };
}
```

Update the existing callers in the same file — the `clampPan` test at line ~36 and the `inertiaStep` tests at lines ~62-79 must append `, 1` for tilt.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/zoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/zoom.ts tests/zoom.test.ts
git commit -m "feat: thread tilt factor through pan clamp and inertia"
```

---

### Task 4: Controller — fit, and pass tilt to camera calls (`src/controller/gameController.ts`)

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `HEX_TILT` from `../game/hex`; updated `clampPan`/`inertiaStep` signatures from `../game/zoom`.

- [ ] **Step 1: Import HEX_TILT and update fit**

Update the import from `../game/hex`:

```ts
import { axialKey, HEX_TILT, hexToPixel, pixelToHex } from '../game/hex';
```

Update `applyFitToScreen` (`src/controller/gameController.ts:126`):

```ts
  private applyFitToScreen(): void {
    if (!this.app || !this.map) return;
    const radius = this.map.radius;
    const mapW = 2 * Math.sqrt(3) * radius * HEX_SIZE;
    const mapH = 2 * (1.5 * radius * HEX_SIZE * HEX_TILT);
    const fit = Math.min(this.app.screen.width / mapW, this.app.screen.height / mapH) * 0.9;
    this.baseScale = fit;
    this.zoom = 1;
    this.qualityFactor = qualityFactor(fit, window.devicePixelRatio);
    this.spriteScale = 1 / this.qualityFactor;
    this.pan = {
      x: this.app.screen.width / 2,
      y: this.app.screen.height / 2,
    };
    this.applyTransform();
  }
```

- [ ] **Step 2: Update the clampPan/inertiaStep call sites**

In `onWindowMove` (`:184`), append `HEX_TILT` as the 7th arg:

```ts
      this.pan = clampPan(
        { x: this.panStart.x + (e.clientX - this.dragStart.x), y: this.panStart.y + (e.clientY - this.dragStart.y) },
        this.map.radius,
        HEX_SIZE,
        this.baseScale * this.zoom,
        this.app.screen.width,
        this.app.screen.height,
        HEX_TILT,
      );
```

In `startInertia` (`:215`), append `HEX_TILT` as the 9th arg:

```ts
      const step = inertiaStep(
        this.pan,
        this.dragVelocity,
        t.deltaMS / 1000,
        this.map!.radius,
        HEX_SIZE,
        scale,
        this.app!.screen.width,
        this.app!.screen.height,
        HEX_TILT,
      );
```

In the camera animation `fn` (`:284`), append `HEX_TILT` as the 7th arg:

```ts
        this.pan = clampPan(
          cameraPanStep(this.cameraStartPan, this.cameraTarget, progress),
          this.map!.radius,
          HEX_SIZE,
          scale,
          this.app!.screen.width,
          this.app!.screen.height,
          HEX_TILT,
        );
```

- [ ] **Step 3: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both PASS.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`
Expected: map visibly tilted (hexes wider than tall), tiles/prisms/borders aligned, clicks/camera/pan/zoom behave as before, units and labels upright.

- [ ] **Step 5: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: fit and clamp camera with tilted map projection"
```
