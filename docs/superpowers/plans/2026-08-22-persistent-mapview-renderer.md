# Persistent MapView Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-rebuild `renderMap` with a persistent `MapView` that does dirty/incremental tile updates, pools `Text`/`Graphics`, and culls offscreen tiles.

**Architecture:** A `MapView` class owns a painter-sorted map `Container` plus an overlay `Container`. The constructor builds every tile once as a `TileView` (fixed sprites). `update()` compares per-tile render signatures, applies diffs only to changed tiles, rebuilds the overlay from pooled objects, and hides offscreen tiles. The controller holds one `MapView` for the game's lifetime.

**Tech Stack:** TypeScript, PixiJS 8, Vite, Vitest.

## Global Constraints

- No behavior or visual change; the renderer has no direct tests, so visual parity is manual.
- No change to `GameMap` shape or multiplayer wire payload.
- Existing 273 tests pass; `npm run typecheck` clean.
- Painter order must match current behavior: tiles sorted by `compareTileY`; within a tile the order is terrain, fog, village, capital dot, building, unit, territory (territory on top).
- No new dependencies.

---

### Task 1: Extract testable pure helpers

**Files:**
- Create: `src/render/tileSignature.ts`
- Test: `tests/tileSignature.test.ts`

**Interfaces:**
- Produces: `tileSignature(tile, map, localPlayerIndex, fogEnabled, hiddenUnitIds): string` and `tileInView(tile, hexSize, viewport): boolean`. Imported by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `tests/tileSignature.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateMap } from '../src/game/mapGen';
import { axialKey, hexNeighbors } from '../src/game/hex';
import { TileType } from '../src/game/tileTypes';
import { tileSignature, tileInView } from '../src/render/tileSignature';
import { Viewport } from '../src/render/tileSignature';

describe('tileSignature', () => {
  it('changes when terrain changes', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0];
    const a = tileSignature(t, map, 0, true, new Set());
    t.terrain = t.terrain === TileType.Water ? TileType.GrasslandLand : TileType.Water;
    const b = tileSignature(t, map, 0, true, new Set());
    expect(a).not.toBe(b);
  });

  it('changes when a unit appears', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0];
    const a = tileSignature(t, map, 0, true, new Set());
    t.unit = { id: 'u1', owner: 0, type: 'warrior', q: t.q, r: t.r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: t.q, r: t.r } };
    const b = tileSignature(t, map, 0, true, new Set());
    expect(a).not.toBe(b);
  });

  it('changes when the unit is hidden', () => {
    const map = generateMap(2, 42);
    const t = map.tiles.find((x) => x.unit);
    if (!t || !t.unit) return;
    const a = tileSignature(t, map, 0, true, new Set());
    const b = tileSignature(t, map, 0, true, new Set([t.unit.id]));
    expect(a).not.toBe(b);
  });

  it('changes when ownership changes', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0];
    const a = tileSignature(t, map, 0, true, new Set());
    t.ownedBy = 1;
    const b = tileSignature(t, map, 0, true, new Set());
    expect(a).not.toBe(b);
  });

  it('changes when a neighbor ownership changes', () => {
    const map = generateMap(2, 42);
    const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
    const withNeighbor = map.tiles.find((t) => hexNeighbors(t).some((n) => byKey.has(axialKey(n))))!;
    const a = tileSignature(withNeighbor, map, 0, true, new Set());
    const nb = hexNeighbors(withNeighbor)[0];
    const nbTile = byKey.get(axialKey(nb));
    if (!nbTile) return;
    nbTile.ownedBy = 1;
    const b = tileSignature(withNeighbor, map, 0, true, new Set());
    expect(a).not.toBe(b);
  });

  it('is stable for an unchanged tile', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0];
    expect(tileSignature(t, map, 0, true, new Set())).toBe(tileSignature(t, map, 0, true, new Set()));
  });
});

describe('tileInView', () => {
  const vp: Viewport = { x: 400, y: 300, scale: 1, width: 800, height: 600 };
  it('is true for the center tile', () => {
    const map = generateMap(2, 42);
    const center = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    expect(tileInView(center, 40, vp)).toBe(true);
  });
  it('is false for a far tile', () => {
    const map = generateMap(2, 42);
    const far = map.tiles[map.tiles.length - 1];
    expect(tileInView(far, 40, vp)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tileSignature.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `src/render/tileSignature.ts`:

```ts
import { axialKey, hexNeighbors, hexToPixel } from '../game/hex';
import { GameMap, MapTile } from '../game/mapGen';
import { isExploredFor } from '../game/explore';

export interface Viewport {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

export function tileSignature(
  tile: MapTile,
  map: GameMap,
  localPlayerIndex: number,
  fogEnabled: boolean,
  hiddenUnitIds: Set<string>,
): string {
  const explored = !fogEnabled || isExploredFor(tile, localPlayerIndex);
  const s = tile.settlement;
  const u = tile.unit;
  const hidden = u ? hiddenUnitIds.has(u.id) : false;
  const neighborOwners = hexNeighbors(tile)
    .map((n) => {
      const t = map.tiles.find((x) => x.q === n.q && x.r === n.r);
      return t ? (t.ownedBy ?? '-') : 'x';
    })
    .join(',');
  return [
    explored ? '1' : '0',
    tile.terrain,
    s ? (s.owner ?? 'f') : '-',
    s ? (s.capital ? 'c' : '') : '',
    u ? u.id : '-',
    u ? u.type : '',
    u ? u.owner : '',
    hidden ? 'h' : '',
    tile.building ? tile.building.kind : '',
    tile.ownedBy ?? '-',
    neighborOwners,
  ].join('|');
}

export function tileInView(tile: MapTile, hexSize: number, vp: Viewport): boolean {
  const p = hexToPixel(tile, hexSize);
  const sx = vp.x + p.x * vp.scale;
  const sy = vp.y + p.y * vp.scale;
  const margin = hexSize * vp.scale * 2;
  return sx >= -margin && sx <= vp.width + margin && sy >= -margin && sy <= vp.height + margin;
}
```

Note: `hexNeighbors` + linear `map.tiles.find` is O(6n) per tile per update, fine for n≤331.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tileSignature.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/tileSignature.ts tests/tileSignature.test.ts
git commit -m "feat: extract tile signature and viewport-cull helpers"
```

---

### Task 2: Add the MapView class alongside renderMap

**Files:**
- Modify: `src/render/mapRenderer.ts` (add class; keep `renderMap` intact for now)

**Interfaces:**
- Consumes: `tileSignature`, `tileInView`, `Viewport` from `./tileSignature`.
- Produces: `export class MapView` with:
  - `readonly container: Container`
  - `readonly overlay: Container`
  - `readonly overlayItems: OverlayItem[]`
  - `constructor(app, textures, hexSize, spriteScale, textResolution)`
  - `update(map, players, selection, reachableKeys, attackableKeys, localPlayerIndex, fogEnabled, hiddenUnitIds, viewport): void`
  - `destroy(): void`

- [ ] **Step 1: Add the MapView class to `src/render/mapRenderer.ts`**

Append the following class to the existing file (keep `renderMap` and all its helpers as-is — Task 3 removes them). Update the imports at the top of the file to add `hexEdgeNeighbor` and `type Texture`, and add the `tileSignature`, `tileInView`, `Viewport` imports:

```ts
import { Application, Container, Graphics, Sprite, Text, type Ticker } from 'pixi.js';
import { axialKey, compareTileY, hexCorners, hexEdge, hexEdgeNeighbor, hexToPixel } from '../game/hex';
import { GameMap, MapTile } from '../game/mapGen';
import { Player } from '../game/players';
import { Selection } from '../game/selection';
import { TRIBES } from '../game/tribes';
import { UNIT_TYPES, Unit } from '../game/units';
import { unitCanAct } from '../game/unitActions';
import { isExploredFor } from '../game/explore';
import { villageCapacity, unitsInVillage } from '../game/village';
import { SELECTION_COLOR } from '../config';
import { tileElevation } from './elevation';
import { type TextureSet } from './textureFactory';
import { tileSignature, tileInView, type Viewport } from './tileSignature';

export interface OverlayItem {
  el: Container;
  world: { x: number; y: number };
}

interface TileView {
  el: Container;
  terrainSprite: Sprite;
  fogSprite: Sprite;
  villageSprite: Sprite | null;
  capitalDot: Graphics | null;
  buildingSprite: Sprite | null;
  unitSprite: Sprite | null;
  territory: Graphics;
  signature: string;
}

export class MapView {
  readonly container: Container;
  readonly overlay: Container;
  readonly overlayItems: OverlayItem[] = [];
  private map: GameMap | null = null;
  private tileViews = new Map<string, TileView>();
  private exclamationBobs: Container[] = [];
  private exclamationAnimRemove: (() => void) | null = null;
  private stopSelectedBorder: (() => void) | null = null;
  private highlights: Graphics[] = [];
  private graphicsPool: Graphics[] = [];
  private textPool: Text[] = [];

  constructor(
    private readonly app: Application,
    private readonly textures: TextureSet,
    private readonly hexSize: number,
    private readonly spriteScale: number,
    private readonly textResolution: number,
  ) {
    this.container = new Container();
    this.overlay = new Container();
  }

  destroy(): void {
    if (this.exclamationAnimRemove) {
      this.exclamationAnimRemove();
      this.exclamationAnimRemove = null;
    }
    if (this.stopSelectedBorder) {
      this.stopSelectedBorder();
      this.stopSelectedBorder = null;
    }
    this.container.destroy({ children: true });
    this.overlay.destroy({ children: true });
    this.graphicsPool = [];
    this.textPool = [];
    this.tileViews.clear();
    this.overlayItems.length = 0;
    this.map = null;
  }

  update(
    map: GameMap,
    players: Player[],
    selection: Selection | null,
    reachableKeys: Set<string>,
    attackableKeys: Set<string>,
    localPlayerIndex: number,
    fogEnabled: boolean,
    hiddenUnitIds: Set<string>,
    viewport: Viewport,
  ): void {
    if (this.tileViews.size === 0) this.buildTiles(map);
    this.map = map;
    this.releaseOverlay();
    this.clearHighlights();
    this.exclamationBobs = [];
    const hpBars: { unit: Unit; position: { x: number; y: number }; canAct: boolean }[] = [];
    const labels: { tile: MapTile; owner: number; el: Container; world: { x: number; y: number } }[] = [];
    const exclamations: { el: Container; world: { x: number; y: number } }[] = [];

    for (const tile of map.tiles) {
      const tv = this.tileViews.get(axialKey(tile))!;
      tv.el.visible = tileInView(tile, this.hexSize, viewport);
      const sig = tileSignature(tile, map, localPlayerIndex, fogEnabled, hiddenUnitIds);
      if (sig !== tv.signature) {
        tv.signature = sig;
        this.applyTile(tv, tile, players, localPlayerIndex, fogEnabled);
      }
      if (!tv.el.visible) continue;
      const p = hexToPixel(tile, this.hexSize);
      const y = p.y - tileElevation(tile, this.hexSize);

      if (tile.unit && !hiddenUnitIds.has(tile.unit.id)) {
        const unit = tile.unit;
        hpBars.push({ unit, position: { x: p.x, y }, canAct: unitCanAct(map, tile, unit, players[unit.owner]) });
      }
      if (tile.settlement && tile.settlement.owner !== null) {
        labels.push({ tile, owner: tile.settlement.owner, el: new Container(), world: { x: p.x, y: y + this.hexSize * 0.35 } });
      }
      if (tile.settlement && tile.settlement.captureReady && tile.unit && tile.unit.owner !== tile.settlement.owner) {
        const el = new Container();
        const bob = new Container();
        const h = Math.sqrt(24 * 24 - 4 * 4);
        const mark = new Graphics();
        mark.poly([-4, -h / 2, 4, -h / 2, 0, h / 2]).fill(0xff0000).stroke({ width: 2, color: 0xffffff });
        bob.addChild(mark);
        el.addChild(bob);
        this.exclamationBobs.push(bob);
        exclamations.push({ el, world: { x: p.x, y: y - this.hexSize * 0.8 } });
      }
    }

    for (const hp of hpBars) this.addHpBar(hp.unit, hp.position, hp.canAct, localPlayerIndex);
    for (const l of labels) this.addVillageLabel(l.tile, l.owner, l.el, l.world, players);
    for (const ex of exclamations) {
      ex.el.position.set(0, 0);
      this.overlay.addChild(ex.el);
      this.overlayItems.push({ el: ex.el, world: ex.world });
    }
    this.drawHighlights(map, selection, reachableKeys, attackableKeys);
    this.startExclamationAnimation();
  }

  private buildTiles(map: GameMap): void {
    const sorted = [...map.tiles].sort((a, b) => compareTileY(a, b, this.hexSize));
    for (const tile of sorted) {
      const p = hexToPixel(tile, this.hexSize);
      const el = new Container();
      el.position.set(p.x, p.y);

      const terrainTex = this.textures.tileTextures.get(axialKey(tile))!;
      const terrainSprite = new Sprite(terrainTex.texture);
      terrainSprite.anchor.set(0.5, terrainTex.anchorY);
      terrainSprite.scale.set(this.spriteScale);
      el.addChild(terrainSprite);

      const fogTex = this.textures.fogTextures.get(axialKey(tile))!;
      const fogSprite = new Sprite(fogTex.texture);
      fogSprite.anchor.set(0.5, fogTex.anchorY);
      fogSprite.scale.set(this.spriteScale);
      fogSprite.visible = false;
      el.addChild(fogSprite);

      const territory = new Graphics();
      el.addChild(territory);

      this.tileViews.set(axialKey(tile), {
        el,
        terrainSprite,
        fogSprite,
        villageSprite: null,
        capitalDot: null,
        buildingSprite: null,
        unitSprite: null,
        territory,
        signature: '',
      });
      this.container.addChild(el);
    }
  }

  private applyTile(tv: TileView, tile: MapTile, players: Player[], localPlayerIndex: number, fogEnabled: boolean): void {
    const explored = !fogEnabled || isExploredFor(tile, localPlayerIndex);
    const p = hexToPixel(tile, this.hexSize);
    const y = p.y - tileElevation(tile, this.hexSize);

    tv.terrainSprite.visible = explored;
    tv.fogSprite.visible = !explored;

    this.syncSprite(tv, 'villageSprite', tile.settlement
      ? tile.settlement.owner === null
        ? this.textures.freeVillageTexture
        : this.textures.villageTextures[players[tile.settlement.owner].tribe]
      : null, p.x, y);
    if (tv.villageSprite) tv.villageSprite.visible = explored;

    if (tile.settlement && tile.settlement.capital) {
      if (!tv.capitalDot) {
        tv.capitalDot = new Graphics();
        tv.capitalDot.circle(p.x, y, this.hexSize * 0.08).fill(0x000000);
        tv.el.addChild(tv.capitalDot);
      }
      tv.capitalDot.visible = explored;
    } else if (tv.capitalDot) {
      tv.el.removeChild(tv.capitalDot);
      tv.capitalDot.destroy();
      tv.capitalDot = null;
    }

    this.syncSprite(tv, 'buildingSprite', tile.building
      ? tile.building.kind === 'port'
        ? this.textures.portTexture
        : tile.building.kind === 'factory'
          ? this.textures.factoryTexture
          : this.textures.mineTexture
      : null, p.x, y);
    if (tv.buildingSprite) tv.buildingSprite.visible = explored;

    const unitTexture = tile.unit && tile.unit.shipLevel !== undefined
      ? tile.unit.shipLevel === 3
        ? this.textures.shipTextures[players[tile.unit.owner].tribe].level3
        : this.textures.shipTextures[players[tile.unit.owner].tribe].base
      : tile.unit
        ? this.textures.unitTextures[players[tile.unit.owner].tribe][tile.unit.type]
        : null;
    this.syncSprite(tv, 'unitSprite', unitTexture, p.x, y);
    if (tv.unitSprite) tv.unitSprite.visible = explored;

    this.drawTileTerritory(tv.territory, tile, players);
    tv.el.addChild(tv.territory);
  }

  private syncSprite(
    tv: TileView,
    kind: 'villageSprite' | 'buildingSprite' | 'unitSprite',
    texture: Texture | null,
    x: number,
    y: number,
  ): void {
    const current = tv[kind];
    if (texture && !current) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(this.spriteScale);
      sprite.position.set(x, y);
      tv.el.addChild(sprite);
      tv[kind] = sprite;
    } else if (texture && current) {
      if (current.texture !== texture) current.texture = texture;
      current.position.set(x, y);
    } else if (current) {
      tv.el.removeChild(current);
      current.destroy();
      tv[kind] = null;
    }
  }

  private drawTileTerritory(g: Graphics, tile: MapTile, players: Player[]): void {
    g.clear();
    if (tile.ownedBy === null) return;
    const owner = tile.ownedBy;
    const tribe = TRIBES.find((t) => t.id === players[owner].tribe)!;
    const p = hexToPixel(tile, this.hexSize);
    const elev = tileElevation(tile, this.hexSize);
    const cx = p.x;
    const cy = p.y - elev;
    const insetFor = (x: number): number => (Math.abs(x - cx) < 0.5 ? 6 : 8);
    const byKey = new Map<string, MapTile>((this.map?.tiles ?? []).map((t) => [axialKey(t), t]));
    for (let e = 0; e < 6; e++) {
      const neighbor = byKey.get(axialKey(hexEdgeNeighbor(tile, e)));
      if (neighbor && neighbor.ownedBy === owner) continue;
      const seg = hexEdge(tile, e, this.hexSize);
      const ax = seg.ax;
      const ay = seg.ay - elev;
      const bx = seg.bx;
      const by = seg.by - elev;
      const axIn = ax - ((ax - cx) / (Math.hypot(ax - cx, ay - cy) || 1)) * insetFor(ax);
      const ayIn = ay - ((ay - cy) / (Math.hypot(ax - cx, ay - cy) || 1)) * insetFor(ax);
      const bxIn = bx - ((bx - cx) / (Math.hypot(bx - cx, by - cy) || 1)) * insetFor(bx);
      const byIn = by - ((by - cy) / (Math.hypot(bx - cx, by - cy) || 1)) * insetFor(bx);
      g.poly([ax, ay, bx, by, bxIn, byIn, axIn, ayIn]).fill(tribe.color);
    }
  }

  private drawHighlights(
    map: GameMap,
    selection: Selection | null,
    reachableKeys: Set<string>,
    attackableKeys: Set<string>,
  ): void {
    const selectedKey = selection ? axialKey(selection) : '';
    const dotRadius = this.hexSize * 0.08;
    for (const tile of map.tiles) {
      const key = axialKey(tile);
      const y = hexToPixel(tile, this.hexSize).y - tileElevation(tile, this.hexSize);
      if (reachableKeys.has(key) && key !== selectedKey) {
        const p = hexToPixel(tile, this.hexSize);
        const dot = this.takeGraphics();
        dot.circle(p.x, y, dotRadius).fill(SELECTION_COLOR);
        this.container.addChild(dot);
        this.highlights.push(dot);
        continue;
      }
      if (key === selectedKey && selection && selection.kind === 'unit' && tile.unit) {
        this.drawUnitShapeBorder(tile, y);
        continue;
      }
      if (key !== selectedKey && !attackableKeys.has(key)) continue;
      const points: number[] = [];
      for (const c of hexCorners(tile, this.hexSize)) points.push(c.x, c.y - tileElevation(tile, this.hexSize));
      const isSelected = key === selectedKey;
      const border = this.takeGraphics();
      border.poly(points).stroke({ width: 4, color: SELECTION_COLOR, alpha: isSelected ? 1 : 0.6 });
      this.container.addChild(border);
      this.highlights.push(border);
      if (isSelected) this.animateSelectedBorder(border, points);
    }
  }

  private drawUnitShapeBorder(tile: MapTile, y: number): void {
    const unit = tile.unit!;
    const p = hexToPixel(tile, this.hexSize);
    const r = this.hexSize * 0.2 + 3;
    const border = this.takeGraphics();
    if (unit.shipLevel !== undefined) {
      border.poly([p.x, y + r, p.x + r, y - r, p.x - r, y - r]).stroke({ width: 3, color: SELECTION_COLOR });
    } else if (UNIT_TYPES[unit.type].shape === 'square') {
      border.rect(p.x - r, y - r, r * 2, r * 2).stroke({ width: 3, color: SELECTION_COLOR });
    } else if (UNIT_TYPES[unit.type].shape === 'triangle') {
      border.poly([p.x, y - r, p.x + r, y + r, p.x - r, y + r]).stroke({ width: 3, color: SELECTION_COLOR });
    } else {
      border.circle(p.x, y, r).stroke({ width: 3, color: SELECTION_COLOR });
    }
    this.container.addChild(border);
    this.highlights.push(border);
  }

  private animateSelectedBorder(border: Graphics, points: number[]): void {
    if (this.stopSelectedBorder) {
      this.stopSelectedBorder();
      this.stopSelectedBorder = null;
    }
    const draw = (width: number): void => {
      border.clear();
      border.poly(points).stroke({ width, color: SELECTION_COLOR });
    };
    draw(4);
    const ticker = this.app.ticker;
    const start = performance.now();
    const fn = (t: Ticker) => {
      const phase = ((performance.now() - start) % 1200) / 1200;
      draw(2 + 4 * Math.abs(Math.sin(phase * Math.PI * 2)));
    };
    ticker.add(fn);
    this.stopSelectedBorder = () => ticker.remove(fn);
  }

  private startExclamationAnimation(): void {
    if (this.exclamationAnimRemove) return;
    const ticker = this.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (this.exclamationBobs.length === 0) {
        ticker.remove(fn);
        this.exclamationAnimRemove = null;
        return;
      }
      const phase = ((performance.now() - start) % 800) / 800;
      const offset = -Math.abs(Math.sin(phase * Math.PI * 2)) * 5;
      for (const bob of this.exclamationBobs) bob.position.y = offset;
    };
    ticker.add(fn);
    this.exclamationAnimRemove = () => ticker.remove(fn);
  }

  private takeGraphics(): Graphics {
    return this.graphicsPool.pop() ?? new Graphics();
  }

  private releaseGraphics(g: Graphics): void {
    g.clear();
    this.graphicsPool.push(g);
  }

  private takeText(text: string, style: { fontSize: number; fill: number | string; fontWeight?: string }): Text {
    const t = this.textPool.pop() ?? new Text({ text: '', style, resolution: this.textResolution });
    t.text = text;
    t.style = style;
    return t;
  }

  private releaseText(t: Text): void {
    this.textPool.push(t);
  }

  private releaseOverlay(): void {
    for (const item of this.overlayItems) {
      this.overlay.removeChild(item.el);
      for (const child of item.el.children) {
        if (child instanceof Graphics) this.releaseGraphics(child);
        else if (child instanceof Text) this.releaseText(child);
        else child.destroy();
      }
      item.el.destroy();
    }
    this.overlayItems.length = 0;
  }

  private clearHighlights(): void {
    for (const g of this.highlights) {
      this.container.removeChild(g);
      this.releaseGraphics(g);
    }
    this.highlights = [];
  }

  private addHpBar(unit: Unit, position: { x: number; y: number }, canAct: boolean, localPlayerIndex: number): void {
    const el = new Container();
    el.position.set(position.x, position.y);
    const barWidth = this.hexSize * 0.6;
    const barHeight = 5;
    const y = -this.hexSize * 0.6;
    const maxHp = UNIT_TYPES[unit.type].maxHp;

    const background = this.takeGraphics();
    background.rect(-barWidth / 2, y, barWidth, barHeight).fill(0xff0000);
    el.addChild(background);

    const ratio = Math.max(0, Math.min(1, unit.hp / maxHp));
    if (ratio > 0) {
      const fill = this.takeGraphics();
      fill.rect(-barWidth / 2, y, barWidth * ratio, barHeight).fill(0x00ff00);
      el.addChild(fill);
    }

    const label = this.takeText(`${unit.hp}/${maxHp}`, { fontSize: 20, fill: 0xffffff });
    label.anchor.set(0.5, 1);
    label.position.set(0, y - 2);

    const labelBg = this.takeGraphics();
    labelBg
      .rect(label.x - label.width / 2 - 2, label.y - label.height, label.width + 4, label.height)
      .fill({ color: 0x000000, alpha: 0.6 });
    el.addChild(labelBg);
    el.addChild(label);

    if (canAct && unit.owner === localPlayerIndex) {
      const dot = this.takeGraphics();
      dot.circle(barWidth / 2 + 9, y + barHeight / 2 - 4, 4).fill(0xff0000);
      el.addChild(dot);
    }

    this.overlay.addChild(el);
    this.overlayItems.push({ el, world: position });
  }

  private addVillageLabel(
    tile: MapTile,
    owner: number,
    el: Container,
    world: { x: number; y: number },
    players: Player[],
  ): void {
    const map = this.map!;
    const capacity = villageCapacity(tile.settlement!.level);
    const count = unitsInVillage(map, tile);
    const tribe = TRIBES.find((t) => t.id === players[owner].tribe)!;
    const label = this.takeText(`${tile.settlement!.name ?? ''} ${count}/${capacity}`.trim(), { fontSize: 13, fill: 0xffffff });
    label.anchor.set(0.5, 0);
    label.position.set(0, 0);

    const labelBg = this.takeGraphics();
    labelBg
      .rect(label.x - label.width / 2 - 2, label.y - 1, label.width + 4, label.height + 2)
      .fill(tribe.color);

    el.addChild(labelBg);
    el.addChild(label);
    el.position.set(world.x, world.y);
    this.overlay.addChild(el);
    this.overlayItems.push({ el, world });
  }
}
```

Note: `applyTile` uses `fogEnabled`/`localPlayerIndex` (passed from `update`) to compute `explored`; the `map` field is set before the tile loop so `drawTileTerritory` and `addVillageLabel` can read neighbor/unit info. The `Texture` type used in `syncSprite` is imported transitively via `pixi.js` (already in the import list). `isExploredFor` is imported and used by `applyTile`.

- [ ] **Step 2: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass. `renderMap` is still present and still used by the controller, so the build stays green; `MapView` is new, unused-but-compiling code.

- [ ] **Step 3: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: persistent MapView renderer with dirty updates, pooling, and culling"
```

---

### Task 3: Integrate MapView into the controller and remove renderMap

**Files:**
- Modify: `src/controller/gameController.ts`
- Modify: `src/render/mapRenderer.ts` (remove `renderMap` and its now-dead helpers)

**Interfaces:**
- Consumes: `MapView`, `OverlayItem` from `../render/mapRenderer`.
- Produces: controller uses `mapView.container`, `mapView.overlay`, `mapView.overlayItems`; `render()` calls `mapView.update(...)`; `renderMap`, `addHpBar`, `drawTileTerritory`, `startExclamationAnimation` (module fn), `drawUnitShapeBorder`, `animateSelectedBorder` (module fn), and `drawHighlights` (module fn) are deleted from `mapRenderer.ts`.

- [ ] **Step 1: Replace the import and fields in the controller**

In `gameController.ts`:
- Replace `import { renderMap, type OverlayItem } from '../render/mapRenderer';` with `import { MapView, type OverlayItem } from '../render/mapRenderer';`
- Replace `private mapContainer: Container | null = null;` with `private mapView: MapView | null = null;`
- Remove `private overlay: Container | null = null;`
- Keep `private overlayItems: OverlayItem[] = [];`

- [ ] **Step 2: Update `destroy()`**

In `destroy()` (currently lines 122-136), replace the `if (this.app) { ... }` block's map teardown with:

```ts
    if (this.mapView) {
      this.mapView.destroy();
      this.mapView = null;
    }
```

(Place it before `if (this.app)`.) Remove the `this.overlay = null;` line and keep `this.overlayItems = [];`.

- [ ] **Step 3: Update `applyTransform()`**

Replace the body of `applyTransform()` (lines 261-269):

```ts
  private applyTransform(): void {
    if (!this.mapView) return;
    const scale = this.baseScale * this.zoom;
    this.mapView.container.scale.set(scale, scale);
    this.mapView.container.position.set(this.pan.x, this.pan.y);
    for (const item of this.overlayItems) {
      item.el.position.set(this.pan.x + item.world.x * scale, this.pan.y + item.world.y * scale);
    }
  }
```

- [ ] **Step 4: Update `render()`**

Replace the body of `render()` (currently lines 1207-1288) with:

```ts
  private render(): void {
    if (!this.app || !this.sim || !this.textures) return;
    const store = useGameStore.getState();

    if (!this.mapView) {
      this.mapView = new MapView(this.app, this.textures, HEX_SIZE, 1 / this.qualityFactor, this.qualityFactor);
      this.mapView.container.eventMode = 'static';
      this.mapView.container.on('wheel', (e) => {
        if (!this.mapView) return;
        this.stopCameraAnimation();
        this.stopInertia();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const scale = this.baseScale * this.zoom;
        const nextZoom = clampZoom(this.zoom * factor, this.maxZoom);
        const nextScale = this.baseScale * nextZoom;
        this.pan = zoomAroundCursor({ x: e.global.x, y: e.global.y }, this.pan, scale, nextScale);
        this.zoom = nextZoom;
        this.applyTransform();
      });
      this.mapView.container.on('pointerdown', (e) => {
        this.stopCameraAnimation();
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
      this.mapView.container.on('pointertap', (e) => {
        if (!this.mapView || this.dragActive) return;
        const now = Date.now();
        const local = this.mapView.container.toLocal(e.global);
        const tile = pickTileAt(local.x, local.y, HEX_SIZE, this.sim!.map.tiles);
        if (now - this.lastTap < 400 && !tile) {
          this.lastTap = 0;
          this.resetView();
          return;
        }
        this.lastTap = now;
        if (tile) {
          this.handleMapClick(tile.q, tile.r);
        }
      });
      this.app.stage.addChild(this.mapView.container);
      this.app.stage.addChild(this.mapView.overlay);
    }

    this.reachableKeys = new Set<string>();
    this.attackableKeys = new Set<string>();
    const selection = store.selection;
    if (selection && selection.kind === 'unit') {
      const tile = tileAt(this.sim.map, selection.q, selection.r);
      const unit = tile?.unit;
      if (unit && unit.owner === store.localPlayerIndex && canMove(unit)) {
        const canClimb = hasSkill(store.players[unit.owner], 'climbing');
        const canDock = hasSkill(store.players[unit.owner], 'navigation');
        this.reachableKeys = new Set(reachableTargets(this.sim.map, unit, moveRange(unit), canClimb, canDock).map((t) => axialKey(t)));
      }
      if (unit && unit.owner === store.localPlayerIndex && canAttack(unit)) {
        this.attackableKeys = new Set(attackableTargets(this.sim.map, unit).map((t) => axialKey(t)));
      }
    }

    this.mapView.update(
      this.sim.map,
      store.players,
      selection,
      this.reachableKeys,
      this.attackableKeys,
      store.localPlayerIndex,
      store.fogEnabled,
      this.hiddenUnitIds,
      {
        x: this.pan.x,
        y: this.pan.y,
        scale: this.baseScale * this.zoom,
        width: this.app.screen.width,
        height: this.app.screen.height,
      },
    );
    this.overlayItems = this.mapView.overlayItems;
    this.applyTransform();
  }
```

- [ ] **Step 5: Update `animateMoveEvent`**

Replace the three `this.mapContainer` references in `animateMoveEvent` with `this.mapView.container`:
- Guard: `if (!this.app || !this.sim || !this.mapContainer || !this.textures) return;` → `... || !this.mapView || !this.textures) return;`
- `this.mapContainer.addChild(sprite);` → `this.mapView.container.addChild(sprite);`
- `this.mapContainer.removeChild(sprite);` → `this.mapView.container.removeChild(sprite);`

- [ ] **Step 6: Remove the dead `renderMap` code from `mapRenderer.ts`**

Delete these functions and the module-level globals from `src/render/mapRenderer.ts` (they are superseded by `MapView`):
- `let stopSelectedBorderAnimation`
- `let exclamationBobs`
- `let exclamationAnimRemove`
- `function startExclamationAnimation`
- `function addHpBar`
- `function drawTileTerritory`
- `export function renderMap`
- `function drawUnitShapeBorder`
- `function animateSelectedBorder`
- `function drawHighlights`

After deletion, the imports used only by those functions become unused: `hexCorners`, `hexEdge`, `hexEdgeNeighbor`, `unitCanAct`, `villageCapacity`, `unitsInVillage`, `isExploredFor`, `compareTileY`, `tileElevation`, `Text`, `Ticker`. Remove only the imports that TypeScript reports as unused after the deletion (run typecheck to see which). The `MapView` class uses: `axialKey`, `hexToPixel`, `hexEdge`, `hexEdgeNeighbor`, `hexCorners`, `compareTileY`, `tileElevation`, `isExploredFor`, `Text`, `Ticker`, `unitCanAct`, `villageCapacity`, `unitsInVillage`, `SELECTION_COLOR`, `UNIT_TYPES`, `Unit`, `TRIBES`, `tileSignature`, `tileInView`, `Viewport`, `Application`, `Container`, `Graphics`, `Sprite`, `Texture`.

- [ ] **Step 7: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass (green build restored; no unused-import errors).

- [ ] **Step 8: Commit**

```bash
git add src/controller/gameController.ts src/render/mapRenderer.ts
git commit -m "feat: wire persistent MapView into game controller, remove renderMap"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Run the dev server and verify visuals**

Run: `npm run dev`, start a single-player game with 4 players (largest map, radius 10, 331 tiles).
Check:
- Map renders identically: terrain, fog, villages, capitals, buildings, units, territory borders.
- Selection: reachable dots, attackable borders, pulsing selected border.
- Move a unit: sprite animates along path, appears at destination, painter order correct.
- HP bars, village labels, exclamation markers, score flyers, fog-reveal animations all appear and animate.
- Pan/zoom: offscreen tiles culled with no visual pop; camera animation and inertia work.
- Multiplayer: host + client snapshot adoption still renders.
- Perf tab while idle: exclamation ticker not running when no exclamations exist.
