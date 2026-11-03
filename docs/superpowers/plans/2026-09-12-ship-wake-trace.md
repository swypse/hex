# Ship Wake Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give sea units (ships and pirates) a short fading wake trace as they sail, so every water tile they cross gets 10–20 small 2px light-blue squares scattered along the travel line that fade out over 200 ms.

**Architecture:** A new render module `src/render/wake.ts` owns the pure square-scattering geometry (`wakeSquarePositions`) and the Pixi spawn/fade animation (`spawnShipWake`). `EventPresenter.animateMoveEvent` detects sea-unit moves (`e.shipLevel` set, or `unit.type === 'pirate'`) and calls `spawnShipWake` after the ghost sprite arrives at each *water* path step. Wake squares are added directly to `mapView.container` in world coordinates, so they scale with the camera like the ship sprite.

**Tech Stack:** TypeScript, PixiJS 8 (`Graphics`, `Container`, `Application.ticker`), Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass.
- Follow existing code style: no comments unless self-evident, 2-space indent, `noUncheckedIndexedAccess` (index access requires `!`).
- Pixi: `Graphics` rects are drawn in the node's local space; set `g.position` to place them. `container.sortableChildren = true` (already set on `mapView.container`), so `zIndex` orders direct children.
- Wake squares must NOT block the move animation (`spawnShipWake` is fire-and-forget; the 200 ms fade runs on `app.ticker`).
- Commit after each task with conventional messages (`feat:`, `test:`, etc.).

---

### Task 1: `wakeSquarePositions` pure geometry

**Files:**
- Create: `src/render/wake.ts`
- Test: `tests/wake.test.ts`

**Interfaces:**
- Consumes: nothing (pure math).
- Produces: `export interface WakePoint { x: number; y: number }` and
  `export function wakeSquarePositions(from: WakePoint, to: WakePoint, count: number, rng?: () => number): WakePoint[]`.
  Default `rng = Math.random`.

- [ ] **Step 1: Write the failing test**

`tests/wake.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { wakeSquarePositions } from '../src/render/wake';

function seqRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('wakeSquarePositions', () => {
  it('returns exactly the requested number of points', () => {
    const pts = wakeSquarePositions({ x: 0, y: 0 }, { x: 100, y: 0 }, 15, seqRng(7));
    expect(pts).toHaveLength(15);
    expect(pts.every((p) => p.x >= 0 && p.x <= 100)).toBe(true);
  });

  it('scatters points along the segment with small perpendicular jitter', () => {
    const pts = wakeSquarePositions({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, seqRng(3));
    const xs = pts.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(50);
    expect(Math.max(...xs)).toBeGreaterThan(50);
    expect(pts.every((p) => Math.abs(p.y) <= 8)).toBe(true);
  });

  it('works for a diagonal segment', () => {
    const pts = wakeSquarePositions({ x: 0, y: 0 }, { x: 60, y: 30 }, 12, seqRng(11));
    expect(pts).toHaveLength(12);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-8);
      expect(p.x).toBeLessThanOrEqual(68);
      expect(p.y).toBeGreaterThanOrEqual(-8);
      expect(p.y).toBeLessThanOrEqual(38);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wake.test.ts`
Expected: FAIL — `Cannot find module '../src/render/wake'` / functions undefined.

- [ ] **Step 3: Write the implementation**

Create `src/render/wake.ts`:

```ts
import { Application, Container, Graphics } from 'pixi.js';

export interface WakePoint {
  x: number;
  y: number;
}

export const WAKE_JITTER_PX = 8;

export function wakeSquarePositions(
  from: WakePoint,
  to: WakePoint,
  count: number,
  rng: () => number = Math.random,
): WakePoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: WakePoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = rng();
    const jitter = (rng() - 0.5) * 2 * WAKE_JITTER_PX;
    pts.push({
      x: from.x + dx * t + nx * jitter,
      y: from.y + dy * t + ny * jitter,
    });
  }
  return pts;
}
```

Note: `Application` is imported now but only used as a type in Task 2 — keep it imported here so Task 2 needs no import change.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/wake.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/wake.test.ts src/render/wake.ts
git commit -m "feat: wake trace square scatter geometry"
```

---

### Task 2: `spawnShipWake` animation

**Files:**
- Modify: `src/render/wake.ts`
- Test: `tests/wake.test.ts`

**Interfaces:**
- Consumes: `wakeSquarePositions` from Task 1, Pixi `Application`/`Container`/`Graphics`.
- Produces: `export function spawnShipWake(app: Application, container: Container, from: WakePoint, to: WakePoint): void`
  — spawns 10–20 (uniform random) 2×2 px `Graphics` rects colored `0xaee8ff`, `zIndex = 5`, positioned along the segment, fades `alpha` 1→0 over 200 ms on `app.ticker`, then removes and destroys them.

- [ ] **Step 1: Write the failing test**

Append to `tests/wake.test.ts`:

```ts
import { Application, Container, Graphics } from 'pixi.js';
import { spawnShipWake } from '../src/render/wake';

describe('spawnShipWake', () => {
  it('spawns 10-20 light-blue rects on the container that fade out and are removed after 200ms', () => {
    const callbacks: Array<() => void> = [];
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (fn: () => void) => callbacks.push(fn), remove: (): void => {} },
    } as unknown as Application;
    const container = new Container();
    container.sortableChildren = true;

    const realNow = (globalThis as { performance: Performance }).performance.now;
    let now = 1000;
    (globalThis as { performance: Performance }).performance.now = () => now;
    try {
      spawnShipWake(app, container, { x: 0, y: 0 }, { x: 100, y: 0 });

      const rects = container.children.filter((c) => c instanceof Graphics);
      expect(rects.length).toBeGreaterThanOrEqual(10);
      expect(rects.length).toBeLessThanOrEqual(20);
      expect(rects.every((g) => g.zIndex === 5)).toBe(true);
      expect(callbacks).toHaveLength(1);

      const fn = callbacks[0]!;
      now = 1100;
      fn();
      expect(rects.every((g) => g.alpha > 0 && g.alpha < 1)).toBe(true);

      now = 1300;
      fn();
      expect(container.children.length).toBe(0);
    } finally {
      (globalThis as { performance: Performance }).performance.now = realNow;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wake.test.ts`
Expected: FAIL — `spawnShipWake is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/render/wake.ts`:

```ts
const WAKE_COLOR = 0xaee8ff;
const SQUARE_SIZE = 2;
const PER_TILE_MIN = 10;
const PER_TILE_MAX = 20;
const WAKE_MS = 200;
const WAKE_Z_INDEX = 5;

export function spawnShipWake(
  app: Application,
  container: Container,
  from: WakePoint,
  to: WakePoint,
): void {
  const count = PER_TILE_MIN + Math.floor(Math.random() * (PER_TILE_MAX - PER_TILE_MIN + 1));
  const points = wakeSquarePositions(from, to, count);
  const rects: Graphics[] = [];
  for (const p of points) {
    const g = new Graphics();
    g.rect(0, 0, SQUARE_SIZE, SQUARE_SIZE).fill({ color: WAKE_COLOR, alpha: 1 });
    g.position.set(p.x, p.y);
    g.zIndex = WAKE_Z_INDEX;
    g.alpha = 1;
    container.addChild(g);
    rects.push(g);
  }
  const start = performance.now();
  const ticker = app.ticker;
  const fn = (): void => {
    const t = Math.min(1, (performance.now() - start) / WAKE_MS);
    for (const g of rects) g.alpha = 1 - t;
    if (t >= 1) {
      ticker.remove(fn);
      for (const g of rects) {
        container.removeChild(g);
        g.destroy();
      }
    }
  };
  ticker.add(fn);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/wake.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/wake.test.ts src/render/wake.ts
git commit -m "feat: spawn and fade ship wake squares"
```

---

### Task 3: Wire wake into ship/pirate moves

**Files:**
- Modify: `src/controller/eventPresenter.ts`
- Test: `tests/moveAnimation.test.ts`

**Interfaces:**
- Consumes: `spawnShipWake` from Task 2; existing `hexToPixel`, `hexDistance`, `tileAt`, `tileElevation`, `isWaterType`, `isExploredFor`, `Application`, `Container`.
- Produces: no new public API. Ship/pirate moves over water now visually emit the wake.
- Uses: two private members on `EventPresenter`:
  - in `animateMoveEvent`, detect sea unit via `e.shipLevel !== undefined || unit.type === 'pirate'`;
  - new private method `spawnShipWakeSegment(from: Axial, to: Axial): void` gatekeeping water/adjacent checks.

- [ ] **Step 1: Add imports and the helper**

In `src/controller/eventPresenter.ts`, update the import from `'../game/hex'` (line 10) to include the `Axial` type:

```ts
import { axialKey, hexDistance, hexToPixel, type Axial } from '../game/hex';
```

Add these imports (alphabetical, near the other `../game/` imports):

```ts
import { isWaterType } from '../game/tileTypes';
import { spawnShipWake } from '../render/wake';
```

Note: the pair must start with `type`:
`import { axialKey, hexDistance, hexToPixel, type Axial } from '../game/hex';`

- [ ] **Step 2: Write the failing integration tests**

In `tests/moveAnimation.test.ts`, add `import { Graphics } from 'pixi.js';` to the existing pixi import at line 2. Append these tests at the end of the `describe('move animation', ...)` block:

```ts
  it('spawns wake squares on water tiles while a ship sails', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats)];
    h = setupGame(map, players);
    const from = unitAt(map, 0, 0);
    from.terrain = TileType.Water;
    const ship: Unit = {
      id: 's1', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 }, shipLevel: 1,
    };
    from.unit = ship;
    const dest = unitAt(map, 1, 0);
    dest.terrain = TileType.Water;
    from.unit = null;
    dest.unit = { ...ship, q: 1, r: 0 };
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const events: GameEvent[] = [
      { type: 'unitMoved', unitId: 's1', from: { q: 0, r: 0 }, path: [{ q: 1, r: 0 }], to: { q: 1, r: 0 }, shipLevel: 1 },
    ];
    const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));
    await waitFor(() =>
      [...h.mapView.container.children].some((c) => c instanceof Graphics && c.zIndex === 5),
    );
    await p;

    const wakeRects = [...h.mapView.container.children].filter(
      (c) => c instanceof Graphics && c.zIndex === 5,
    );
    expect(wakeRects.length).toBeGreaterThanOrEqual(10);
    expect(wakeRects.length).toBeLessThanOrEqual(20);
  });

  it('does not spawn wake squares on a landing step onto land', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats)];
    h = setupGame(map, players);
    const ship: Unit = {
      id: 's1', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 }, shipLevel: 1,
    };
    unitAt(map, 0, 0).terrain = TileType.Water;
    unitAt(map, 0, 0).unit = ship;
    unitAt(map, 0, 0).unit = null;
    unitAt(map, 1, 0).unit = { ...ship, q: 1, r: 0 };
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const events: GameEvent[] = [
      { type: 'unitMoved', unitId: 's1', from: { q: 0, r: 0 }, path: [{ q: 1, r: 0 }], to: { q: 1, r: 0 }, shipLevel: 1 },
    ];
    await h.gc.presentEvents(events, h.gc.exploredKeysFor(0));

    const wakeRects = [...h.mapView.container.children].filter(
      (c) => c instanceof Graphics && c.zIndex === 5,
    );
    expect(wakeRects.length).toBe(0);
  });

  it('spawns wake squares while a pirate sails', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats)];
    h = setupGame(map, players);
    const pirate: Unit = {
      id: 'p1', owner: -1, type: 'pirate', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    unitAt(map, 0, 0).terrain = TileType.Water;
    unitAt(map, 0, 0).unit = pirate;
    unitAt(map, 0, 0).unit = null;
    unitAt(map, 1, 0).terrain = TileType.Water;
    unitAt(map, 1, 0).unit = { ...pirate, q: 1, r: 0 };
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const events: GameEvent[] = [
      { type: 'unitMoved', unitId: 'p1', from: { q: 0, r: 0 }, path: [{ q: 1, r: 0 }], to: { q: 1, r: 0 } },
    ];
    const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));
    await waitFor(() =>
      [...h.mapView.container.children].some((c) => c instanceof Graphics && c.zIndex === 5),
    );
    await p;

    const wakeRects = [...h.mapView.container.children].filter(
      (c) => c instanceof Graphics && c.zIndex === 5,
    );
    expect(wakeRects.length).toBeGreaterThanOrEqual(10);
    expect(wakeRects.length).toBeLessThanOrEqual(20);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/moveAnimation.test.ts`
Expected: All three new tests FAIL (no wake rects because trigger not wired). Existing tests still pass.

- [ ] **Step 4: Wire the wake into `animateMoveEvent`**

In `src/controller/eventPresenter.ts` around line 699, modify the move loop and add the helper method. Change:

```ts
    for (const step of steps) {
      const to = hexToPixel(step, HEX_SIZE);
      const targetTile = tileAt(map, step.q, step.r);
      const y = targetTile ? to.y - tileElevation(targetTile, HEX_SIZE) : to.y;
      await this.tweenSpriteTo(sprite, { x: to.x, y }, 110);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
```

to:

```ts
    const seaUnit = e.shipLevel !== undefined || unit.type === 'pirate';
    let prev = e.from;
    for (const step of steps) {
      const to = hexToPixel(step, HEX_SIZE);
      const targetTile = tileAt(map, step.q, step.r);
      const y = targetTile ? to.y - tileElevation(targetTile, HEX_SIZE) : to.y;
      await this.tweenSpriteTo(sprite, { x: to.x, y }, 110);
      if (seaUnit) this.spawnShipWakeSegment(prev, step);
      prev = step;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
```

Then add this private method right after `animateMoveEvent`'s closing brace (before `presentBonusClaimed`):

```ts
  /** Scatters a short fading wake along the segment between two adjacent water
   *  tiles the sea unit just sailed across. No-op for land steps (the landing
   *  stop) and non-adjacent pairs (unexplored gaps in enemy paths). */
  private spawnShipWakeSegment(from: Axial, to: Axial): void {
    const app = this.host.app();
    const mapView = this.host.mapView();
    const sim = this.host.sim();
    if (!app || !mapView || !sim) return;
    const fromTile = tileAt(sim.map, from.q, from.r);
    const toTile = tileAt(sim.map, to.q, to.r);
    if (!fromTile || !toTile) return;
    if (hexDistance(from, to) !== 1) return;
    if (!isWaterType(fromTile.terrain) || !isWaterType(toTile.terrain)) return;
    spawnShipWake(app, mapView.container, hexToPixel(from, HEX_SIZE), hexToPixel(to, HEX_SIZE));
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/wake.test.ts tests/moveAnimation.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/controller/eventPresenter.ts tests/moveAnimation.test.ts
git commit -m "feat: leave fading wake on water as ships and pirates sail"
```

---

## Self-Review

**Spec coverage:**
- Squares: 10–20 per tile ✓ (Task 2, `PER_TILE_MIN/MAX`)
- Uniform count + scatter around travel line ✓ (Task 1)
- 2px, light blue `0xaee8ff` ✓ (Task 2)
- Smooth fade over 200 ms per tile, ticker-driven ✓ (Task 2)
- World-space on `mapView.container` → scales with map ✓ (Task 3 wiring; container carries camera scale/position)
- All ships (own, AI) + pirates ✓ (Task 3, `seaUnit` check)
- Water-only, landing step skipped, fog-filtered enemy steps skipped ✓ (`spawnShipWakeSegment` water + adjacency gate; steps already filtered upstream in `animateMoveEvent`)
- Fire-and-forget, does not block move loop ✓ (`spawnShipWake` uses its own ticker; called without await)

**Placeholders:** none.

**Type consistency:** `WakePoint` used in both functions; `spawnShipWake(app, mapView.container, ...)` matches the `(Application, Container, WakePoint, WakePoint)` signature; `typename Axial` import matches real usage in `spawnShipWakeSegment(from: Axial, to: Axial)`.