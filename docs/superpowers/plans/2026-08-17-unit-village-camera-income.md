# Unit Fix, Hex Villages, AI Action Camera, Wood/Stone Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the invisible unit sprite, render villages as hexagons, center the camera on off-screen AI action targets, and collect wood/stone income each round with animated counters.

**Architecture:** Restore the missing `addChild(unitSprite)` call; change the village texture to a hexagon; add a ticker-driven camera animation to the controller that glides `pan` to the action's target cell before each AI action; add a pure `collectTerrainIncome` counter and a React ticking-value hook so wood/stone animate like money.

**Tech Stack:** TypeScript, PixiJS v8, React, Vitest.

## Global Constraints

- `HEX_SIZE = 40` and `MAX_ZOOM = 2` stay fixed.
- Village hexagon circumradius = `hexSize * 0.45`, black stroke width 2.
- Camera animation duration = 600 ms, `easeInOutCubic`; the action cell is centered when off-screen; zoom is unchanged.
- Round end: `money += villageIncome(...)` per settlement (unchanged) plus wood/stone from `collectTerrainIncome`.
- No new npm dependencies; no code comments.
- Typecheck: `npm run typecheck`; tests: `npm run test`.

---

### Task 1: Fix the invisible unit sprite

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Produces: `renderMap` returns a container where each unit's sprite is a child (was accidentally omitted).

- [ ] **Step 1: Restore the unit `addChild` call**

In `src/render/mapRenderer.ts`, find the unit rendering block:

```ts
    if (tile.unit) {
      const unitSprite = new Sprite(textures.unitTextures[players[tile.unit.owner].tribe][tile.unit.type]);
      unitSprite.anchor.set(0.5);
      unitSprite.scale.set(spriteScale);
      unitSprite.position.set(p.x, p.y);
      addHpBar(container, tile.unit, p, hexSize, textResolution);
    }
```

Insert `container.addChild(unitSprite);` after the `unitSprite.position.set(p.x, p.y);` line (before `addHpBar(...)`), matching how every other sprite in the file is added:

```ts
    if (tile.unit) {
      const unitSprite = new Sprite(textures.unitTextures[players[tile.unit.owner].tribe][tile.unit.type]);
      unitSprite.anchor.set(0.5);
      unitSprite.scale.set(spriteScale);
      unitSprite.position.set(p.x, p.y);
      container.addChild(unitSprite);
      addHpBar(container, tile.unit, p, hexSize, textResolution);
    }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "fix: add missing unit sprite to the map container"
```

---

### Task 2: Render villages as hexagons

**Files:**
- Modify: `src/render/textureFactory.ts`

**Interfaces:**
- Produces: `makeVillageTexture(app, color, hexSize): Texture` now draws a hexagon of circumradius `hexSize * 0.45` instead of a circle of radius `hexSize * 0.3`.

- [ ] **Step 1: Change the village shape**

In `src/render/textureFactory.ts`, replace `makeVillageTexture` (currently lines 38-44):

```ts
function makeVillageTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  g.circle(0, 0, hexSize * 0.3).fill(color);
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

with:

```ts
function makeVillageTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  g.poly(hexagonPoints(hexSize * 0.45)).fill(color).stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

(`hexagonPoints` is already defined at the top of the file.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/render/textureFactory.ts
git commit -m "feat: render villages as hexagons"
```

---

### Task 3: Camera easing helpers

**Files:**
- Modify: `src/game/zoom.ts`
- Test: `tests/zoom.test.ts`

**Interfaces:**
- Produces:
  - `export function easeInOutCubic(t: number): number` — clamped cubic ease-in-out
  - `export function cameraPanStep(pan: { x: number; y: number }, target: { x: number; y: number }, progress: number): { x: number; y: number }` — `pan` interpolated toward `target` by the eased, clamped progress

- [ ] **Step 1: Add failing tests**

Append to `tests/zoom.test.ts`, and extend the existing `import` from `'../src/game/zoom'` with `easeInOutCubic, cameraPanStep`:

```ts
describe('easeInOutCubic', () => {
  it('is 0 at 0 and 1 at 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });
  it('is 0.5 at the midpoint', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });
  it('clamps outside [0,1]', () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});

describe('cameraPanStep', () => {
  it('returns start at progress 0 and target at progress 1', () => {
    const start = { x: 100, y: 200 };
    const target = { x: 300, y: 50 };
    expect(cameraPanStep(start, target, 0)).toEqual(start);
    expect(cameraPanStep(start, target, 1)).toEqual(target);
  });
  it('eases between start and target', () => {
    const start = { x: 0, y: 0 };
    const target = { x: 100, y: 0 };
    expect(cameraPanStep(start, target, 0.5).x).toBeCloseTo(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/zoom.test.ts`
Expected: FAIL — `easeInOutCubic` / `cameraPanStep` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/game/zoom.ts`:

```ts
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function cameraPanStep(
  pan: { x: number; y: number },
  target: { x: number; y: number },
  progress: number,
): { x: number; y: number } {
  const e = easeInOutCubic(progress);
  return { x: pan.x + (target.x - pan.x) * e, y: pan.y + (target.y - pan.y) * e };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/zoom.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/game/zoom.ts tests/zoom.test.ts
git commit -m "feat: add camera easing and pan step helpers"
```

---

### Task 4: Terrain income collector

**Files:**
- Modify: `src/game/capture.ts`
- Test: `tests/capture.test.ts`

**Interfaces:**
- Produces:
  - `export function collectTerrainIncome(map: GameMap, playerIndex: number): { wood: number; stone: number }` — for every tile with `tile.ownedBy === playerIndex`: `ForestLand`/`ForestSand`/`ForestSnow` adds 1 wood, `Mountain` adds 1 stone.

- [ ] **Step 1: Add failing tests**

Append to `tests/capture.test.ts`, and extend the existing `import` from `'../src/game/capture'` with `collectTerrainIncome`:

```ts
describe('collectTerrainIncome', () => {
  function incomeTile(terrain: TileType, ownedBy: number | null): MapTile {
    return { q: 0, r: 0, terrain, settlement: null, unit: null, ownedBy, claimedByVillage: null };
  }

  it('counts 1 wood per owned forest tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      incomeTile(TileType.ForestLand, 0),
      incomeTile(TileType.ForestSand, 0),
      incomeTile(TileType.ForestSnow, 0),
    );
    expect(collectTerrainIncome(map, 0)).toEqual({ wood: 3, stone: 0 });
  });

  it('counts 1 stone per owned mountain tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(incomeTile(TileType.Mountain, 0), incomeTile(TileType.Mountain, 0));
    expect(collectTerrainIncome(map, 0)).toEqual({ wood: 0, stone: 2 });
  });

  it('ignores tiles owned by others and non-forest/mountain terrains', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      incomeTile(TileType.ForestLand, 1),
      incomeTile(TileType.Mountain, 1),
      incomeTile(TileType.Land, 0),
      incomeTile(TileType.Water, 0),
      incomeTile(TileType.Mountain, null),
    );
    expect(collectTerrainIncome(map, 0)).toEqual({ wood: 0, stone: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/capture.test.ts`
Expected: FAIL — `collectTerrainIncome` is not exported.

- [ ] **Step 3: Implement the function**

In `src/game/capture.ts`, add the import at the top:

```ts
import { TileType } from './tileTypes';
```

And append:

```ts
export function collectTerrainIncome(
  map: GameMap,
  playerIndex: number,
): { wood: number; stone: number } {
  let wood = 0;
  let stone = 0;
  for (const t of map.tiles) {
    if (t.ownedBy !== playerIndex) continue;
    if (
      t.terrain === TileType.ForestLand ||
      t.terrain === TileType.ForestSand ||
      t.terrain === TileType.ForestSnow
    ) {
      wood += 1;
    } else if (t.terrain === TileType.Mountain) {
      stone += 1;
    }
  }
  return { wood, stone };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/capture.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/game/capture.ts tests/capture.test.ts
git commit -m "feat: collect wood and stone from owned forest and mountain tiles"
```

---

### Task 5: Collect terrain income at round end

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `collectTerrainIncome(map, playerIndex): { wood; stone }` (Task 4).
- Produces: at the end of `runAiPhase`, every player gains wood/stone in addition to money.

- [ ] **Step 1: Update the capture import**

In `src/controller/gameController.ts`, change:

```ts
import { captureVillage, setCaptureReady, villageIncome } from '../game/capture';
```

to:

```ts
import { captureVillage, collectTerrainIncome, setCaptureReady, villageIncome } from '../game/capture';
```

- [ ] **Step 2: Collect wood/stone alongside money**

In `runAiPhase`, replace the round-end income block:

```ts
    for (const player of players) {
      let income = 0;
      for (const t of this.map.tiles) {
        if (t.settlement && t.settlement.owner === player.index) {
          income += villageIncome(this.map, t);
        }
      }
      player.resources.money += income;
    }
```

with:

```ts
    for (const player of players) {
      let income = 0;
      for (const t of this.map.tiles) {
        if (t.settlement && t.settlement.owner === player.index) {
          income += villageIncome(this.map, t);
        }
      }
      player.resources.money += income;
      const terrain = collectTerrainIncome(this.map, player.index);
      player.resources.wood += terrain.wood;
      player.resources.stone += terrain.stone;
    }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: collect wood and stone income each round"
```

---

### Task 6: Animate wood and stone counters like money

**Files:**
- Modify: `src/screens/hud/MoneyInfo.tsx`

**Interfaces:**
- Produces: `useTickingValue(target: number): { value: number; bounce: number }` — a local hook that steps `value` by ±1 every `STEP_MS` toward `target`, incrementing `bounce` on each step.
- `MoneyInfo` renders money, wood, and stone via this hook so all three animate identically.

- [ ] **Step 1: Replace `MoneyInfo` with a hook-driven version**

Replace the entire contents of `src/screens/hud/MoneyInfo.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';

const STEP_MS = 80;

function useTickingValue(target: number): { value: number; bounce: number } {
  const [value, setValue] = useState(target);
  const [bounce, setBounce] = useState(0);
  const ref = useRef(target);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    const step = (): void => {
      if (cancelled) return;
      const current = ref.current;
      if (current < target) {
        ref.current = current + 1;
        setValue(current + 1);
        setBounce((b) => b + 1);
        setTimeout(step, STEP_MS);
      } else if (current > target) {
        ref.current = current - 1;
        setValue(current - 1);
        setBounce((b) => b + 1);
        setTimeout(step, STEP_MS);
      }
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [target]);

  return { value, bounce };
}

export function MoneyInfo(): React.ReactElement {
  const player = useGameStore((s) => s.players[s.currentPlayerIndex]);
  const money = player?.resources.money ?? 0;
  const wood = player?.resources.wood ?? 0;
  const stone = player?.resources.stone ?? 0;
  const moneyTick = useTickingValue(money);
  const woodTick = useTickingValue(wood);
  const stoneTick = useTickingValue(stone);

  const squareStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 10,
    height: 10,
    marginLeft: 8,
  };

  return (
    <div id="money-info">
      <span key={moneyTick.bounce} className={moneyTick.bounce > 0 ? 'money-bounce' : ''}>⭐ {moneyTick.value}</span>
      <span style={{ ...squareStyle, background: '#8b5a2b' }} />
      <span key={`wood-${woodTick.bounce}`} className={woodTick.bounce > 0 ? 'money-bounce' : ''}>Wood: {woodTick.value}</span>
      <span style={{ ...squareStyle, background: '#9a9a9a' }} />
      <span key={`stone-${stoneTick.bounce}`} className={stoneTick.bounce > 0 ? 'money-bounce' : ''}>Stone: {stoneTick.value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/hud/MoneyInfo.tsx
git commit -m "feat: animate wood and stone counters like money"
```

---

### Task 7: Camera centers AI action targets

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `cameraPanStep(pan, target, progress)` (Task 3), `clampPan`, `hexToPixel`, `Ticker` (already imported).
- Produces:
  - `private isCellVisible(q: number, r: number): boolean`
  - `private async bringCellIntoView(q: number, r: number): Promise<void>`
  - `private animateCameraTo(target: { x: number; y: number }): Promise<void>`
  - `private stopCameraAnimation(): void`
  - `runAiPhase` awaits `bringCellIntoView(action.q, action.r)` before each AI action.

- [ ] **Step 1: Update imports and constants**

In `src/controller/gameController.ts`:

Change:

```ts
import { axialKey, pixelToHex } from '../game/hex';
```

to:

```ts
import { axialKey, hexToPixel, pixelToHex } from '../game/hex';
```

Change the zoom import to:

```ts
import { cameraPanStep, clampPan, clampZoom, inertiaStep, INERTIA_START_SPEED, qualityFactor, zoomAroundCursor } from '../game/zoom';
```

Add after `const DRAG_THRESHOLD = 5;`:

```ts
const CAMERA_DURATION_MS = 600;
const CAMERA_MARGIN_TILES = 2;
```

- [ ] **Step 2: Add camera state fields**

After the field `private inertiaRemove: (() => void) | null = null;`, add:

```ts
  private cameraRemove: (() => void) | null = null;
  private cameraResolve: (() => void) | null = null;
  private cameraStartPan = { x: 0, y: 0 };
  private cameraTarget = { x: 0, y: 0 };
  private cameraStartTime = 0;
```

- [ ] **Step 3: Stop the camera animation in `destroy()` and `resetView()`**

In `destroy()`, add `this.stopCameraAnimation();` as the first statement (before `this.initToken++;`).

Replace `resetView` with:

```ts
  private resetView(): void {
    this.stopCameraAnimation();
    this.stopInertia();
    this.zoom = 1;
    if (this.app) {
      this.pan = { x: this.app.screen.width / 2, y: this.app.screen.height / 2 };
    }
    this.applyTransform();
  }
```

- [ ] **Step 4: Add the camera methods after `stopInertia()`**

Insert after the `stopInertia` method:

```ts
  private isCellVisible(q: number, r: number): boolean {
    if (!this.app || !this.map) return false;
    const world = hexToPixel({ q, r }, HEX_SIZE);
    const scale = this.baseScale * this.zoom;
    const sx = this.pan.x + world.x * scale;
    const sy = this.pan.y + world.y * scale;
    const margin = HEX_SIZE * scale * CAMERA_MARGIN_TILES;
    return (
      sx >= -margin &&
      sx <= this.app.screen.width + margin &&
      sy >= -margin &&
      sy <= this.app.screen.height + margin
    );
  }

  private async bringCellIntoView(q: number, r: number): Promise<void> {
    if (this.isCellVisible(q, r)) return;
    if (!this.app || !this.map) return;
    const world = hexToPixel({ q, r }, HEX_SIZE);
    const scale = this.baseScale * this.zoom;
    const target = {
      x: this.app.screen.width / 2 - world.x * scale,
      y: this.app.screen.height / 2 - world.y * scale,
    };
    await this.animateCameraTo(target);
  }

  private animateCameraTo(target: { x: number; y: number }): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.app || !this.map) {
        resolve();
        return;
      }
      this.stopCameraAnimation();
      this.stopInertia();
      this.cameraStartPan = { ...this.pan };
      this.cameraTarget = { ...target };
      this.cameraStartTime = performance.now();
      this.cameraResolve = resolve;
      const ticker = this.app.ticker;
      const fn = (t: Ticker) => {
        const progress = Math.min(1, (performance.now() - this.cameraStartTime) / CAMERA_DURATION_MS);
        const scale = this.baseScale * this.zoom;
        this.pan = clampPan(
          cameraPanStep(this.cameraStartPan, this.cameraTarget, progress),
          this.map!.radius,
          HEX_SIZE,
          scale,
          this.app!.screen.width,
          this.app!.screen.height,
        );
        this.applyTransform();
        if (progress >= 1) this.stopCameraAnimation();
      };
      ticker.add(fn);
      this.cameraRemove = () => ticker.remove(fn);
    });
  }

  private stopCameraAnimation(): void {
    if (this.cameraRemove) {
      this.cameraRemove();
      this.cameraRemove = null;
    }
    if (this.cameraResolve) {
      const resolve = this.cameraResolve;
      this.cameraResolve = null;
      resolve();
    }
  }
```

- [ ] **Step 5: Cancel the animation on user interaction**

In the `wheel` handler, add `this.stopCameraAnimation();` as the first statement (next to the existing `this.stopInertia();`).

In the `pointerdown` handler, add `this.stopCameraAnimation();` as the first statement (before `this.stopInertia();`).

- [ ] **Step 6: Center the camera before each AI action**

In `runAiPhase`, inside the `for (const action of actions)` loop, add as the first statement:

```ts
        await this.bringCellIntoView(action.q, action.r);
```

so the loop begins:

```ts
      for (const action of actions) {
        await this.bringCellIntoView(action.q, action.r);
        if (action.type === 'upgrade') {
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: center the camera on off-screen AI action targets"
```

---

## Final Verification

- [ ] Run `npm run test` — all unit tests pass (including new zoom + capture cases).
- [ ] Run `npm run typecheck` — no errors.
- [ ] Run `npm run build` — production build succeeds.
- [ ] Manual (`npm run dev`): units are visible on the map; villages render as hexagons and are larger; during the AI turn the camera glides to center each off-screen action target; at round end wood/stone counters tick up one by one with the money bounce; a pointer drag / wheel still works and cancels a running camera pan.
