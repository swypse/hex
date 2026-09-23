# Zoom-independent HP bars and village labels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep HP bars and village name labels at a constant on-screen size across all zoom levels while they stay anchored to their world positions.

**Architecture:** `renderMap` returns a `RenderedMap` object with a world-space `container` (terrain/villages/units/highlights, scales with zoom) plus a separate screen-space `overlay` container holding HP bars and village labels. `GameController.applyTransform()` — the single choke point for pan/zoom/camera animation — recomputes each overlay element's screen position from its stored world anchor.

**Tech Stack:** TypeScript, PixiJS 8.

## Global Constraints

- `renderMap` keeps its existing parameter list and defaults: `(app, map, textures, players, selection, reachableKeys, attackableKeys, hexSize = 40, spriteScale = 1, textResolution = 1)`.
- Bar geometry stays in the same local units as today: `barWidth = hexSize * 0.6`, bar `y = -hexSize * 0.6`, text `fontSize: 10`. Label offset stays `hexSize * 0.35`. Black semi-transparent backgrounds use `{ color: 0x000000, alpha: 0.6 }`.
- The overlay keeps the default `eventMode` (`'none'`) so pointer/wheel events pass through to the map.
- No automated render tests exist in this project; verification is `npm run typecheck`, `npm test`, and manual browser checks. Do not attempt to add a PixiJS test harness — out of scope.

---

### Task 1: Two-layer render (world container + screen-space overlay)

**Files:**
- Modify: `src/render/mapRenderer.ts` (types, `addHpBar`, village-label block, `renderMap`)
- Modify: `src/controller/gameController.ts` (fields, `render()`, `applyTransform()`, `destroy()`)

**Interfaces:**
- Produces (used by `gameController.ts`):
  - `export interface OverlayItem { el: Container; world: { x: number; y: number } }`
  - `export interface RenderedMap { container: Container; overlay: Container; overlayItems: OverlayItem[] }`
  - `renderMap(...): RenderedMap` — same params as before.
- Consumes: existing `Container`, `Graphics`, `Text` from `pixi.js`; `Unit`, `UNIT_TYPES`; `villageCapacity`, `unitsInVillage`.

This single task must be committed as one unit: `renderMap`'s return-type change breaks `gameController.ts` until both files are updated, so intermediate typecheck between the two file edits is not meaningful.

- [ ] **Step 1: Add the exported types to `src/render/mapRenderer.ts`**

Right after the `stopSelectedBorderAnimation` declaration (line 11), add:

```ts
export interface OverlayItem {
  el: Container;
  world: { x: number; y: number };
}

export interface RenderedMap {
  container: Container;
  overlay: Container;
  overlayItems: OverlayItem[];
}
```

- [ ] **Step 2: Rework `addHpBar` to build into a wrapper `el`**

Replace the entire `addHpBar` function (lines 13–50) with:

```ts
function addHpBar(
  overlay: Container,
  overlayItems: OverlayItem[],
  unit: Unit,
  position: { x: number; y: number },
  hexSize: number,
  textResolution: number,
): void {
  const el = new Container();
  el.position.set(position.x, position.y);

  const barWidth = hexSize * 0.6;
  const barHeight = 5;
  const y = -hexSize * 0.6;
  const maxHp = UNIT_TYPES[unit.type].maxHp;

  const background = new Graphics();
  background.rect(-barWidth / 2, y, barWidth, barHeight).fill(0x000000);
  el.addChild(background);

  const ratio = Math.max(0, Math.min(1, unit.hp / maxHp));
  if (ratio > 0) {
    const fill = new Graphics();
    fill.rect(-barWidth / 2, y, barWidth * ratio, barHeight).fill(0x00ff00);
    el.addChild(fill);
  }

  const label = new Text({
    text: `${unit.hp}/${maxHp}`,
    style: { fontSize: 10, fill: 0xffffff },
    resolution: textResolution,
  });
  label.anchor.set(0.5, 1);
  label.position.set(0, y - 2);

  const labelBg = new Graphics();
  labelBg
    .rect(label.x - label.width / 2 - 2, label.y - label.height, label.width + 4, label.height)
    .fill({ color: 0x000000, alpha: 0.6 });
  el.addChild(labelBg);
  el.addChild(label);

  overlay.addChild(el);
  overlayItems.push({ el, world: position });
}
```

Note: bar geometry moves from world coords to `el`-local coords (`position.x` → `0`, `position.y` → `0` for the wrapper; `y` becomes the relative `-hexSize * 0.6`). `world` records the unit's world anchor so `applyTransform()` can reposition the wrapper.

- [ ] **Step 3: Update the village-label block to use the overlay**

In `renderMap`, replace the village-label block (lines 127–144) with:

```ts
    if (tile.settlement && tile.settlement.owner !== null) {
      const capacity = villageCapacity(tile.settlement.level);
      const count = unitsInVillage(map, tile);
      const label = new Text({
        text: `${tile.settlement.name ?? ''} ${count}/${capacity}`.trim(),
        style: { fontSize: 10, fill: 0xffffff },
        resolution: textResolution,
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, 0);

      const labelBg = new Graphics();
      labelBg
        .rect(label.x - label.width / 2 - 2, label.y - 1, label.width + 4, label.height + 2)
        .fill({ color: 0x000000, alpha: 0.6 });

      const el = new Container();
      el.position.set(p.x, y + hexSize * 0.35);
      el.addChild(labelBg);
      el.addChild(label);
      villageLabelEls.push(el);
      overlayItems.push({ el, world: { x: p.x, y: y + hexSize * 0.35 } });
    }
```

- [ ] **Step 4: Update `renderMap` setup, tail, and return type**

Change the signature return type from `): Container {` to `): RenderedMap {`.

Replace the setup block (lines 97–100) with:

```ts
  const container = new Container();
  container.position.set(app.screen.width / 2, app.screen.height / 2);
  const overlay = new Container();
  const overlayItems: OverlayItem[] = [];
  const hpBars: { unit: Unit; position: { x: number; y: number } }[] = [];
  const villageLabelEls: Container[] = [];
```

Replace the tail of `renderMap` (lines 158–165) with:

```ts
  drawHighlights(container, app, map, selection, reachableKeys, attackableKeys, hexSize);
  for (const hp of hpBars) {
    addHpBar(overlay, overlayItems, hp.unit, hp.position, hexSize, textResolution);
  }
  for (const el of villageLabelEls) {
    overlay.addChild(el);
  }

  return { container, overlay, overlayItems };
```

This preserves the current z-order: village labels are added to `overlay` after the HP bars, so labels stay on top.

- [ ] **Step 5: Update `gameController.ts` import and fields**

Change the `renderMap` import (line 15) to:

```ts
import { renderMap, type OverlayItem } from '../render/mapRenderer';
```

Add two fields after `private mapContainer: Container | null = null;` (line 35):

```ts
  private overlay: Container | null = null;
  private overlayItems: OverlayItem[] = [];
```

- [ ] **Step 6: Update `render()` to build and add both layers**

In `render()` (line 645), replace the removal line (649):

```ts
    if (this.mapContainer) this.app.stage.removeChild(this.mapContainer);
```

with:

```ts
    if (this.mapContainer) this.app.stage.removeChild(this.mapContainer);
    if (this.overlay) this.app.stage.removeChild(this.overlay);
```

Replace the `renderMap` assignment (line 665):

```ts
    this.mapContainer = renderMap(this.app, this.map, this.textures, store.players, selection, this.reachableKeys, this.attackableKeys, HEX_SIZE, 1 / this.qualityFactor, this.qualityFactor);
```

with:

```ts
    const rendered = renderMap(this.app, this.map, this.textures, store.players, selection, this.reachableKeys, this.attackableKeys, HEX_SIZE, 1 / this.qualityFactor, this.qualityFactor);
    this.mapContainer = rendered.container;
    this.overlay = rendered.overlay;
    this.overlayItems = rendered.overlayItems;
```

Replace the stage-add tail (lines 718–719):

```ts
    this.app.stage.addChild(this.mapContainer);
    this.applyTransform();
```

with:

```ts
    this.app.stage.addChild(this.mapContainer);
    this.app.stage.addChild(this.overlay);
    this.applyTransform();
```

The overlay is added after the map container, so it renders on top; its default `eventMode` is `'none'`, so it does not intercept clicks or wheel events.

- [ ] **Step 7: Update `applyTransform()` to reposition overlay items**

Replace the body of `applyTransform()` (lines 145–150) with:

```ts
  private applyTransform(): void {
    if (!this.mapContainer) return;
    const scale = this.baseScale * this.zoom;
    this.mapContainer.scale.set(scale, scale);
    this.mapContainer.position.set(this.pan.x, this.pan.y);
    for (const item of this.overlayItems) {
      item.el.position.set(this.pan.x + item.world.x * scale, this.pan.y + item.world.y * scale);
    }
  }
```

- [ ] **Step 8: Reset overlay fields in `destroy()`**

In `destroy()`, add after `this.mapContainer = null;` (line 100):

```ts
    this.overlay = null;
    this.overlayItems = [];
```

- [ ] **Step 9: Run typecheck and the test suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all tests pass (currently 158 across 20 files).

- [ ] **Step 10: Manual browser verification**

Run: `npm run dev`
Expected:
- HP bars and village labels stay the same on-screen size while scrolling the wheel to zoom in/out (zoom range 0.5x–2x).
- Bars/labels stay glued to their units/villages while panning and during camera animations.
- Village labels still draw on top of hexes with their black semi-transparent background.
- Clicking a tile and using the wheel still works (overlay does not block input).

- [ ] **Step 11: Commit**

```bash
git add src/render/mapRenderer.ts src/controller/gameController.ts
git commit -m "feat: keep HP bars and village labels zoom-independent"
```
