# Map Centering, Max-Zoom Quality, Smooth Drag & Inertia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the map in the viewport on start, render everything at 100% quality at max zoom, and make map dragging smooth with inertia that always stops on pointer release.

**Architecture:** Add a `qualityFactor = baseScale × MAX_ZOOM × devicePixelRatio` computed at fit time; generate textures at `HEX_SIZE × qualityFactor` and render text at `resolution = qualityFactor` so sprites/text are 1:1 with screen pixels at max zoom. Move drag input to `window`-level listeners (with pointer capture) so dragging never sticks, track velocity, and animate pan via the Pixi ticker with exponential decay. Pure math lives in `src/game/zoom.ts` and is unit-tested; wiring lives in the controller.

**Tech Stack:** TypeScript, PixiJS v8, Vitest.

## Global Constraints

- `HEX_SIZE = 40` stays fixed (`src/controller/gameController.ts:21`).
- `MAX_ZOOM = 2` stays fixed (`src/game/zoom.ts:2`).
- No new npm dependencies.
- No code comments.
- Typecheck: `npm run typecheck`; tests: `npm run test` (vitest).
- The renderer init additionally gets `resolution: window.devicePixelRatio, autoDensity: true`.
- `qualityFactor = baseScale * MAX_ZOOM * window.devicePixelRatio`; sprite scale in the map container is `1 / qualityFactor`; text resolution is `qualityFactor`.

---

### Task 1: Pure zoom/pan helpers (quality factor + inertia math)

**Files:**
- Modify: `src/game/zoom.ts`
- Test: `tests/zoom.test.ts`

**Interfaces:**
- Consumes: existing `clampPan(pos: {x;y}, mapRadius, hexSize, scale, screenW, screenH): {x;y}`.
- Produces:
  - `export const INERTIA_DECAY = 0.01;` (per-second velocity factor)
  - `export const INERTIA_START_SPEED = 100;` (px/s threshold to start inertia)
  - `export const INERTIA_STOP_SPEED = 30;` (px/s below which inertia stops)
  - `export function qualityFactor(baseScale: number, devicePixelRatio: number): number` → `baseScale * MAX_ZOOM * devicePixelRatio`
  - `export function decayVelocity(velocity: { x: number; y: number }, dt: number): { x: number; y: number }` → velocity scaled by `Math.pow(INERTIA_DECAY, dt)`
  - `export function inertiaStep(pan, velocity, dt, mapRadius, hexSize, scale, screenW, screenH): { pan: {x;y}; velocity: {x;y}; done: boolean }`

- [ ] **Step 1: Add failing tests**

Append to `tests/zoom.test.ts`:

```ts
import {
  clampZoom,
  clampPan,
  zoomAroundCursor,
  qualityFactor,
  decayVelocity,
  inertiaStep,
} from '../src/game/zoom';

describe('qualityFactor', () => {
  it('is baseScale * MAX_ZOOM * devicePixelRatio', () => {
    expect(qualityFactor(1.5, 2)).toBeCloseTo(6);
    expect(qualityFactor(0.5, 1)).toBeCloseTo(1);
  });
});

describe('decayVelocity', () => {
  it('decays velocity over time', () => {
    const v = decayVelocity({ x: 100, y: 0 }, 1);
    expect(v.x).toBeCloseTo(1);
  });
  it('leaves velocity unchanged at dt=0', () => {
    const v = decayVelocity({ x: 50, y: -30 }, 0);
    expect(v.x).toBeCloseTo(50);
    expect(v.y).toBeCloseTo(-30);
  });
});

describe('inertiaStep', () => {
  it('moves pan by velocity and decays it', () => {
    const result = inertiaStep({ x: 100, y: 100 }, { x: 60, y: 0 }, 0.1, 6, 40, 2, 1920, 1080);
    expect(result.pan.x).toBeGreaterThan(100);
    expect(result.velocity.x).toBeLessThan(60);
    expect(result.done).toBe(false);
  });
  it('is done when velocity slows below the stop speed', () => {
    const result = inertiaStep({ x: 100, y: 100 }, { x: 10, y: 0 }, 1, 6, 40, 2, 1920, 1080);
    expect(result.done).toBe(true);
  });
  it('stops when pinned at a boundary', () => {
    const radius = 6;
    const hexSize = 40;
    const scale = 2;
    const maxLeft = -(Math.sqrt(3) * radius * hexSize * scale - 1);
    const result = inertiaStep({ x: maxLeft, y: 0 }, { x: -1000, y: 0 }, 0.1, radius, hexSize, scale, 1920, 1080);
    expect(result.pan.x).toBe(maxLeft);
    expect(result.done).toBe(true);
  });
});
```

Note: the existing import at the top of `tests/zoom.test.ts` (`import { clampZoom, clampPan, zoomAroundCursor } from '../src/game/zoom';`) must be replaced by the combined import above.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/zoom.test.ts`
Expected: FAIL — `qualityFactor` / `decayVelocity` / `inertiaStep` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/game/zoom.ts`:

```ts
export const INERTIA_DECAY = 0.01;
export const INERTIA_START_SPEED = 100;
export const INERTIA_STOP_SPEED = 30;

export function qualityFactor(baseScale: number, devicePixelRatio: number): number {
  return baseScale * MAX_ZOOM * devicePixelRatio;
}

export function decayVelocity(
  velocity: { x: number; y: number },
  dt: number,
): { x: number; y: number } {
  const factor = Math.pow(INERTIA_DECAY, dt);
  return { x: velocity.x * factor, y: velocity.y * factor };
}

export function inertiaStep(
  pan: { x: number; y: number },
  velocity: { x: number; y: number },
  dt: number,
  mapRadius: number,
  hexSize: number,
  scale: number,
  screenW: number,
  screenH: number,
): { pan: { x: number; y: number }; velocity: { x: number; y: number }; done: boolean } {
  const next = clampPan(
    { x: pan.x + velocity.x * dt, y: pan.y + velocity.y * dt },
    mapRadius,
    hexSize,
    scale,
    screenW,
    screenH,
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/zoom.test.ts`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/game/zoom.ts tests/zoom.test.ts
git commit -m "feat: add quality factor and inertia math helpers"
```

---

### Task 2: Renderer quality parameters (textures, sprites, text)

**Files:**
- Modify: `src/render/textureFactory.ts:66-73` (glow blur strength)
- Modify: `src/render/mapRenderer.ts` (renderMap signature, sprite scaling, text resolution)

**Interfaces:**
- Consumes: `createTextures(app: Application, hexSize?: number): TextureSet` (already size-parameterized — signature unchanged).
- Produces: `renderMap(app, map, textures, players, selection, reachableKeys, attackableKeys, hexSize = 40, spriteScale = 1, textResolution = 1): Container` — every `Sprite` drawn with `scale = spriteScale`; every `Text` created with `resolution = textResolution`.
- `addHpBar(container, unit, position, hexSize, textResolution): void`.

- [ ] **Step 1: Scale the glow blur with texture size**

In `src/render/textureFactory.ts`, change `makeGlowTexture` (currently lines 66-73) so the blur strength grows with the texture size:

```ts
function makeGlowTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  g.circle(0, 0, hexSize * 0.6).fill({ color, alpha: 0.5 });
  g.filters = [new BlurFilter({ strength: 12 * (hexSize / 40) })];
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

- [ ] **Step 2: Extend `renderMap` signature and add `textResolution` to `addHpBar`**

In `src/render/mapRenderer.ts`:

Change the `addHpBar` signature (line 28) from:

```ts
function addHpBar(
  container: Container,
  unit: Unit,
  position: { x: number; y: number },
  hexSize: number,
): void {
```

to:

```ts
function addHpBar(
  container: Container,
  unit: Unit,
  position: { x: number; y: number },
  hexSize: number,
  textResolution: number,
): void {
```

Inside `addHpBar`, add `resolution: textResolution,` to the `new Text({...})` options (the `label`):

```ts
  const label = new Text({
    text: `${unit.hp}/${maxHp}`,
    style: { fontSize: 10, fill: 0xffffff },
    resolution: textResolution,
  });
```

Change the `renderMap` signature (line 85) from:

```ts
export function renderMap(
  app: Application,
  map: GameMap,
  textures: TextureSet,
  players: Player[],
  selection: Selection | null,
  reachableKeys: Set<string>,
  attackableKeys: Set<string>,
  hexSize = 40,
): Container {
```

to:

```ts
export function renderMap(
  app: Application,
  map: GameMap,
  textures: TextureSet,
  players: Player[],
  selection: Selection | null,
  reachableKeys: Set<string>,
  attackableKeys: Set<string>,
  hexSize = 40,
  spriteScale = 1,
  textResolution = 1,
): Container {
```

- [ ] **Step 3: Apply `spriteScale` to every sprite and pass `textResolution` to labels**

In `src/render/mapRenderer.ts`, after each sprite's `.anchor.set(0.5)` add `.scale.set(spriteScale)` — there are 6 sprites: `terrainSprite`, `villageSprite`, `unitSprite`, the selection `glow`, the reachable `ghost`, and the attackable `glow`.

Also:
- The village `count/capacity` label `Text` gets `resolution: textResolution,` added to its options.
- The `addHpBar(...)` call site (line 135) becomes `addHpBar(container, tile.unit, p, hexSize, textResolution);`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts
git commit -m "feat: add sprite scale and text resolution to map rendering"
```

---

### Task 3: Center the map on startup and wire the quality factor

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `qualityFactor(baseScale, devicePixelRatio)` (Task 1), `createTextures(app, hexSize)` (Task 2), `renderMap(..., hexSize, spriteScale, textResolution)` (Task 2).
- Produces: `gameController` fields `qualityFactor` (number); `applyFitToScreen()` no longer requires `mapContainer` and also sets `qualityFactor`.

- [ ] **Step 1: Update imports and add the `qualityFactor` field**

In `src/controller/gameController.ts`:

Change line 14 from:

```ts
import { clampPan, clampZoom, zoomAroundCursor } from '../game/zoom';
```

to:

```ts
import { clampPan, clampZoom, qualityFactor, zoomAroundCursor } from '../game/zoom';
```

Add a field after `private pan = { x: 0, y: 0 };` (line 38):

```ts
  private qualityFactor = 1;
```

- [ ] **Step 2: Add DPI options to app init and center in `init().then`**

Replace the `init` body (lines 44-60) with:

```ts
  init(container: HTMLElement): void {
    if (this.app) return;
    const token = ++this.initToken;
    const app = new Application();
    void app
      .init({
        resizeTo: window,
        background: '#1a1a2e',
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
      })
      .then(() => {
        if (token !== this.initToken) {
          app.destroy(true);
          return;
        }
        container.appendChild(app.canvas);
        this.app = app;
        if (this.map) {
          this.applyFitToScreen();
          this.textures = createTextures(app, HEX_SIZE * this.qualityFactor);
          this.render();
        }
      });
  }
```

- [ ] **Step 3: Relax `applyFitToScreen` guard and compute the quality factor**

Replace `applyFitToScreen` (lines 94-107) with:

```ts
  private applyFitToScreen(): void {
    if (!this.app || !this.map) return;
    const radius = this.map.radius;
    const mapW = 2 * Math.sqrt(3) * radius * HEX_SIZE;
    const mapH = 2 * (1.5 * radius * HEX_SIZE);
    const fit = Math.min(this.app.screen.width / mapW, this.app.screen.height / mapH) * 0.9;
    this.baseScale = fit;
    this.zoom = 1;
    this.qualityFactor = qualityFactor(fit, window.devicePixelRatio);
    this.pan = {
      x: this.app.screen.width / 2,
      y: this.app.screen.height / 2,
    };
    this.applyTransform();
  }
```

- [ ] **Step 4: Compute fit before textures in `startGame`**

Replace the `startGame` method (lines 75-92) with:

```ts
  startGame(tribe: Tribe, enemyCount: number): void {
    const store = useGameStore.getState();
    const players = buildPlayers(tribe, enemyCount, new SeededRandom(Math.floor(Math.random() * 100000)));
    store.setPlayers(players);
    this.map = generateMap(players.length, Math.floor(Math.random() * 100000));
    if (this.app) {
      this.applyFitToScreen();
      this.textures = createTextures(this.app, HEX_SIZE * this.qualityFactor);
    }
    store.setTurn(1);
    store.setCurrentPlayerIndex(0);
    store.setAiActive(false);
    store.setSelection(null);
    store.setScreen('game');
    this.render();
    const human = players[0];
    showPopup(`${human.name}'s turn!`, { background: tribeBackground(human) });
    this.applyFitToScreen();
  }
```

- [ ] **Step 5: Pass sprite scale and text resolution in `render()`**

In `render()` (line 392), change:

```ts
    this.mapContainer = renderMap(this.app, this.map, this.textures, store.players, selection, this.reachableKeys, this.attackableKeys, HEX_SIZE);
```

to:

```ts
    this.mapContainer = renderMap(this.app, this.map, this.textures, store.players, selection, this.reachableKeys, this.attackableKeys, HEX_SIZE, 1 / this.qualityFactor, this.qualityFactor);
```

- [ ] **Step 6: Typecheck and manual verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run dev`, start a game (2 enemies).
Expected:
- The map is centered: map center at the viewport center, fitted with margin.
- Zoom in to maximum (scroll wheel): hex tiles, village circles, units, HP text, and village labels are crisp (no blur).
- Double-click on empty space resets to the centered fit view.

- [ ] **Step 7: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: center map on startup and render at max-zoom quality"
```

---

### Task 4: Robust smooth drag with inertia

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `inertiaStep`, `INERTIA_START_SPEED` (Task 1), `clampPan`, `Ticker` type from `pixi.js`.
- Produces: drag uses `window` `pointermove`/`pointerup`/`pointercancel` listeners; inertia driven by `app.ticker`, cancelled by `stopInertia()` on new pointerdown / wheel / reset / destroy.

- [ ] **Step 1: Update imports and add constants**

In `src/controller/gameController.ts`:

Change line 1 from:

```ts
import { Application, Container } from 'pixi.js';
```

to:

```ts
import { Application, Container, type Ticker } from 'pixi.js';
```

Change line 14 from:

```ts
import { clampPan, clampZoom, qualityFactor, zoomAroundCursor } from '../game/zoom';
```

to:

```ts
import { clampPan, clampZoom, inertiaStep, INERTIA_START_SPEED, qualityFactor, zoomAroundCursor } from '../game/zoom';
```

Add after `const HEX_SIZE = 40;` (line 21):

```ts
const DRAG_THRESHOLD = 5;
```

- [ ] **Step 2: Replace the drag/pan state fields**

Replace the field block (lines 39-42):

```ts
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private panStart = { x: 0, y: 0 };
  private lastTap = 0;
```

with:

```ts
  private dragging = false;
  private dragActive = false;
  private dragPointerId = -1;
  private dragStart = { x: 0, y: 0 };
  private panStart = { x: 0, y: 0 };
  private dragLast = { x: 0, y: 0 };
  private dragLastTime = 0;
  private dragMoved = 0;
  private dragVelocity = { x: 0, y: 0 };
  private inertiaRemove: (() => void) | null = null;
  private lastTap = 0;
```

- [ ] **Step 3: Stop inertia in `destroy()` and `resetView()`**

In `destroy()` (lines 62-69), add `this.stopInertia();` as the first statement and remove any pending window listeners before the app is torn down:

```ts
  destroy(): void {
    this.initToken++;
    this.stopInertia();
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }
    this.mapContainer = null;
  }
```

Replace `resetView` (lines 116-122) with:

```ts
  private resetView(): void {
    this.stopInertia();
    this.zoom = 1;
    if (this.app) {
      this.pan = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 };
    }
    this.applyTransform();
  }
```

- [ ] **Step 4: Add drag/inertia methods before `render()`**

Insert the following methods between `markCaptureReadyFor` and `render` (i.e., after line 130, before `private render(): void`):

```ts
  private onWindowMove = (e: PointerEvent): void => {
    if (!this.dragging || !this.app || !this.map) return;
    const dx = e.clientX - this.dragLast.x;
    const dy = e.clientY - this.dragLast.y;
    this.dragMoved += Math.hypot(dx, dy);
    const now = performance.now();
    const dt = Math.max(0.0001, (now - this.dragLastTime) / 1000);
    if (!this.dragActive && this.dragMoved > DRAG_THRESHOLD) {
      this.dragActive = true;
      this.panStart = { ...this.pan };
      this.dragStart = { x: e.clientX, y: e.clientY };
    }
    if (this.dragActive) {
      this.dragVelocity.x = this.dragVelocity.x * 0.8 + (dx / dt) * 0.2;
      this.dragVelocity.y = this.dragVelocity.y * 0.8 + (dy / dt) * 0.2;
      this.pan = clampPan(
        { x: this.panStart.x + (e.clientX - this.dragStart.x), y: this.panStart.y + (e.clientY - this.dragStart.y) },
        this.map.radius,
        HEX_SIZE,
        this.baseScale * this.zoom,
        this.app.screen.width,
        this.app.screen.height,
      );
      this.applyTransform();
    }
    this.dragLast = { x: e.clientX, y: e.clientY };
    this.dragLastTime = now;
  };

  private onWindowUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragPointerId) return;
    this.dragging = false;
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    if (this.dragActive) {
      const speed = Math.hypot(this.dragVelocity.x, this.dragVelocity.y);
      if (speed >= INERTIA_START_SPEED) this.startInertia();
    }
  };

  private startInertia(): void {
    if (!this.app || !this.map || this.inertiaRemove) return;
    const scale = this.baseScale * this.zoom;
    const ticker = this.app.ticker;
    const fn = (t: Ticker) => {
      const step = inertiaStep(
        this.pan,
        this.dragVelocity,
        t.deltaMS / 1000,
        this.map!.radius,
        HEX_SIZE,
        scale,
        this.app!.screen.width,
        this.app!.screen.height,
      );
      this.pan = step.pan;
      this.dragVelocity = step.velocity;
      this.applyTransform();
      if (step.done) this.stopInertia();
    };
    ticker.add(fn);
    this.inertiaRemove = () => ticker.remove(fn);
  }

  private stopInertia(): void {
    if (this.inertiaRemove) {
      this.inertiaRemove();
      this.inertiaRemove = null;
    }
  }
```

- [ ] **Step 5: Rewrite the interaction handlers in `render()`**

Replace the `wheel` + `pointerdown` + `pointermove` + `pointerup` + `pointertap` block (currently lines 395-446) with:

```ts
    this.mapContainer.on('wheel', (e) => {
      if (!this.mapContainer) return;
      this.stopInertia();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const scale = this.baseScale * this.zoom;
      const nextZoom = clampZoom(this.zoom * factor);
      const nextScale = this.baseScale * nextZoom;
      this.pan = zoomAroundCursor({ x: e.global.x, y: e.global.y }, this.pan, scale, nextScale);
      this.zoom = nextZoom;
      this.applyTransform();
    });

    this.mapContainer.on('pointerdown', (e) => {
      this.stopInertia();
      this.dragging = true;
      this.dragActive = false;
      this.dragMoved = 0;
      this.dragVelocity = { x: 0, y: 0 };
      this.dragPointerId = e.pointerId;
      this.dragStart = { x: e.global.x, y: e.global.y };
      this.dragLast = { x: e.global.x, y: e.global.y };
      this.dragLastTime = performance.now();
      this.panStart = { ...this.pan };
      try {
        this.app?.canvas.setPointerCapture(e.pointerId);
      } catch { }
      window.addEventListener('pointermove', this.onWindowMove);
      window.addEventListener('pointerup', this.onWindowUp);
      window.addEventListener('pointercancel', this.onWindowUp);
    });

    this.mapContainer.on('pointertap', (e) => {
      if (!this.mapContainer || this.dragActive) return;
      const now = Date.now();
      const local = this.mapContainer.toLocal(e.global);
      const h = pixelToHex(local.x, local.y, HEX_SIZE);
      const tile = tileAt(this.map!, h.q, h.r);
      if (now - this.lastTap < 400 && !tile) {
        this.lastTap = 0;
        this.resetView();
        return;
      }
      this.lastTap = now;
      if (tile) {
        this.handleMapClick(h.q, h.r);
      }
    });
```

- [ ] **Step 6: Typecheck and manual verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run dev`, start a game.
Expected:
- Drag the map: it follows the pointer smoothly even when the cursor moves fast over empty space around the map.
- Release while moving: the map glides with inertia and decelerates to a stop; it does not jump or jitter when it hits the map bounds.
- Release the mouse outside the canvas (e.g., drag past the window edge and let go): dragging stops (map no longer follows the cursor).
- A plain click still selects units/villages; a drag does not trigger a selection.
- Wheel zoom during/after inertia stops the fling; double-click empty space resets the view and stops any fling.

- [ ] **Step 7: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: smooth drag with inertia that always ends on release"
```

---

## Final Verification

- [ ] Run `npm run test` — all unit tests pass (including new `zoom.test.ts` cases).
- [ ] Run `npm run typecheck` — no errors.
- [ ] Run `npm run build` — production build succeeds.
- [ ] Manual: map centered on start/reset; crisp at max zoom (sprites + text); smooth drag with inertia; drag never sticks.
