import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Application, Container, Graphics, ImageSource, Sprite, Text, Texture } from 'pixi.js';
import { MapView, FIRE_SIZE_MIN, FIRE_SIZE_MAX, captureMarkerPoints } from '../src/render/mapRenderer';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import { Unit, UNIT_TYPES } from '../src/game/units';
import { axialKey, hexToPixel } from '../src/game/hex';
import { tileElevation } from '../src/render/elevation';
import { type TextureSet, type TileTexture } from '../src/render/textureFactory';
import { villageTexturesForTest } from './helpers/villageTextures';

const HEX = 40;
const SPRITE_SCALE = 0.5;
const TEX_H = 100;
const ANCHOR_Y = 0.7;

function tex(w: number, h: number): Texture {
  return new Texture({ source: new ImageSource({ width: w, height: h }) });
}

function tileTex(w: number, h: number, anchorY = 0.5): TileTexture {
  return { texture: tex(w, h), anchorY };
}

function buildTextures(map: GameMap): TextureSet {
  const unitTex = tileTex(TEX_H, TEX_H, ANCHOR_Y);
  const shipTex = { [Tribe.Cats]: { 1: unitTex, 2: unitTex, 3: unitTex } } as unknown as TextureSet['shipTextures'];
  return {
    tileTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTopTexture: tileTex(50, 50),
    villageTextures: villageTexturesForTest(tileTex(40, 40, 0.7), tileTex(40, 40, 0.7)),
    freeVillageTexture: tileTex(40, 40),
    unitTextures: {
      [Tribe.Cats]: { warrior: unitTex, rider: unitTex, archer: unitTex, swordsman: unitTex },
    } as unknown as TextureSet['unitTextures'],
    pirateTexture: unitTex,
    sawmillTexture: tileTex(50, 50),
    mineTexture: tileTex(50, 50),
    portTextures: {
      e: tileTex(40, 40, 0.7),
      ne: tileTex(40, 40, 0.7),
      nw: tileTex(40, 40, 0.7),
      w: tileTex(40, 40, 0.7),
      sw: tileTex(40, 40, 0.7),
      se: tileTex(40, 40, 0.7),
    },
    bridgeTextures: { nw: unitTex, ne: unitTex, we: unitTex },
    freePortTexture: tex(40, 40),
    templeTextures: {
      1: tileTex(40, 40, 0.7),
      2: tileTex(40, 40, 0.7),
      3: tileTex(40, 40, 0.7),
      4: tileTex(40, 40, 0.7),
    },
    forestTempleTextures: {
      1: tileTex(40, 40, 0.7),
      2: tileTex(40, 40, 0.7),
      3: tileTex(40, 40, 0.7),
      4: tileTex(40, 40, 0.7),
    },
    shipTextures: shipTex,
    bonusTexture: tileTex(50, 50),
    bottleTexture: tileTex(40, 40, 0.5),
    villageConnectedTexture: null,
    captureTexture: null,

    wallTexture: null,
    arrowTexture: tex(67, 13),
    cannonballTexture: tex(35, 15),
  };
}

describe('MapView hp bar anchoring', () => {
  let map: GameMap;
  let players: Player[];
  let textures: TextureSet;
  let view: MapView;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });

    const unitTile: MapTile = {
      q: 0,
      r: 0,
      terrain: TileType.GrasslandLand,
      height: 0.1,
      settlement: null,
      building: null,
      roadOwner: null,
      unit: {
        id: 'u1',
        owner: 0,
        type: 'warrior',
        q: 0,
        r: 0,
        hasMoved: false,
        hasAttacked: false,
        hasHealed: false,
        hp: UNIT_TYPES.warrior.maxHp,
        attack: UNIT_TYPES.warrior.attack,
        attackDistance: UNIT_TYPES.warrior.attackDistance,
        spawnVillage: { q: 0, r: 0 },
      },
      ownedBy: 0,
      claimedByVillage: null,
      exploredBy: [0],
    };

    const neighbor = (q: number, r: number): MapTile => ({
      q,
      r,
      terrain: TileType.GrasslandLand,
      height: 0.1,
      settlement: null,
      building: null,
      roadOwner: null,
      unit: null,
      ownedBy: null,
      claimedByVillage: null,
      exploredBy: [0],
    });

    map = {
      radius: 1,
      spawns: [],
      tiles: [
        unitTile,
        neighbor(1, 0), neighbor(1, -1), neighbor(0, -1),
        neighbor(-1, 0), neighbor(-1, 1), neighbor(0, 1),
      ],
    };

    players = [
      { index: 0, tribe: Tribe.Cats, isHuman: true, name: 'Cats', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true },
    ];

    textures = buildTextures(map);

    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;

    view = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
  });

  afterEach(() => {
    view.destroy();
  });

  function hpBarItem(): { el: import('pixi.js').Container; world: { x: number; y: number } } {
    const item = view.overlayItems.find((o) => o.el.children[0] instanceof Graphics);
    if (!item) throw new Error('no hp bar overlay item found');
    return item;
  }

  function tileView(q: number, r: number): { capitalDot: unknown } {
    const tv = (view as unknown as { tileViews: Map<string, { capitalDot: unknown }> }).tileViews.get(axialKey({ q, r }));
    if (!tv) throw new Error('no tile view');
    return tv;
  }

  it('does not draw a dot on the starting (capital) village', () => {
    const tile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    tile.settlement = { owner: 0, level: 1, captureReady: false, capital: true };
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    expect(tileView(0, 0).capitalDot).toBeFalsy();
  });

  it('positions the capture icon 4px above the unit hp bar', () => {
    textures.captureTexture = tex(64, 64);
    const tile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    tile.settlement = { owner: null, level: 1, captureReady: true };
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    const ex = view.overlayItems.find((o) => o.el.children[0] instanceof Container && o.el.children[0].children.length > 0)!;
    expect(ex).toBeDefined();
    const p = hexToPixel(tile, HEX);
    const hpBarY = p.y - tileElevation(tile, HEX) - ANCHOR_Y * TEX_H * SPRITE_SCALE + 40;
    // The bar's top edge sits 11px above its anchor; the icon bottom must be 4px higher.
    const spriteH = HEX * 1.05;
    const gap = (hpBarY - ex.world.y) * 1 - 11 - spriteH / 2;
    expect(gap).toBeCloseTo(4, 5);
  });

  it('renders the capture icon above the unit hp bar and its hp text', () => {
    textures.captureTexture = tex(64, 64);
    const tile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    tile.settlement = { owner: null, level: 1, captureReady: true };
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    const hp = view.overlayItems.find((o) => o.el.children[0] instanceof Graphics)!;
    const ex = view.overlayItems.find(
      (o) => o.el.children[0] instanceof Container && o.el.children[0].children.length > 0,
    )!;
    expect(ex).toBeDefined();
    const overlay = view.overlay;
    expect(overlay.children.indexOf(ex.el)).toBeGreaterThan(overlay.children.indexOf(hp.el));
  });

  it('bobs a visible ship sprite up and down on the ticker', () => {
    const callbacks: Array<() => void> = [];
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (fn: () => void) => callbacks.push(fn), remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    const shipTile: MapTile = {
      q: 0, r: 0, terrain: TileType.Water, height: 0.1, settlement: null,
      building: null, roadOwner: null, unit: null, ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [shipTile] };
    const origNow = performance.now;
    let now = 0;
    (performance as { now: () => number }).now = () => now;
    try {
      shipTile.unit = {
        id: 'sh', owner: 0, type: 'warrior', q: 0, r: 0,
        hasMoved: false, hasAttacked: false, hasHealed: false,
        hp: 4, attack: 2, attackDistance: 1, spawnVillage: null, shipLevel: 1,
      };
      v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
        x: 400, y: 300, scale: 1, width: 800, height: 600,
      });
      const tvs = (v as unknown as { tileViews: Map<string, { unitSprite: Sprite | null }> }).tileViews;
      const sprite = tvs.get('0,0')!.unitSprite!;
      const shipFn = callbacks[0]!; // ship bob is registered first during update
      now = 0;
      shipFn();
      const y0 = sprite.position.y;
      now = 650; // quarter period -> +2.5px
      shipFn();
      expect(sprite.position.y).toBeCloseTo(y0 + 2.5, 5);
      now = 1950; // three-quarter period -> -2.5px
      shipFn();
      expect(sprite.position.y).toBeCloseTo(y0 - 2.5, 5);
    } finally {
      (performance as { now: () => number }).now = origNow;
      v.destroy();
    }
  });

  it('lungeUnit resolves only after the lunge animation completes', async () => {
    const callbacks: Array<() => void> = [];
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (fn: () => void) => callbacks.push(fn), remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    v.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });

    const origNow = performance.now;
    let now = 0;
    (performance as { now: () => number }).now = () => now;
    try {
      const p = v.lungeUnit(axialKey({ q: 0, r: 0 }), axialKey({ q: 1, r: 0 }), 5);
      let resolved = false;
      void p.then(() => { resolved = true; });
      const lungeFn = callbacks[callbacks.length - 1]!;

      for (const t of [0, 40, 80, 120]) {
        now = t;
        lungeFn();
        await Promise.resolve();
      }
      expect(resolved).toBe(false);

      now = 160;
      lungeFn();
      await p;
      expect(resolved).toBe(true);
    } finally {
      (performance as { now: () => number }).now = origNow;
      v.destroy();
    }
  });

  it('anchors the hp bar at a fixed world offset below the unit texture top', () => {
    const tile = map.tiles[0]!;
    const p = hexToPixel(tile, HEX);
    const topWorld = p.y - tileElevation(tile, HEX) - ANCHOR_Y * TEX_H * SPRITE_SCALE;
    expect(hpBarItem().world.y).toBeCloseTo(topWorld + 40, 5);
  });

  it('renders the hp label on an opaque black background with the label above', () => {
    const el = hpBarItem().el;
    const labelIndex = el.children.findIndex((c) => c instanceof Text);
    const labelBg = el.children[labelIndex - 1] as Graphics;
    const context = labelBg.context as unknown as {
      instructions: Array<{ action: string; data: { style: { color: number; alpha: number } } }>;
    };
    const fill = context.instructions.find((i) => i.action === 'fill')!.data.style;
    expect(fill.color).toBe(0x000000);
    expect(fill.alpha).toBe(1);
    const label = el.children[labelIndex];
    expect(labelIndex).toBeGreaterThan(el.children.indexOf(labelBg));
  });

  it('lays the village label text above its background', () => {
    const tile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    tile.settlement = { owner: 0, level: 1, captureReady: false, name: 'Testville' };
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    const item = view.overlayItems.find((o) =>
      o.el.children.some((c) => c instanceof Text && String((c as Text).text).includes('Testville')),
    );
    expect(item).toBeDefined();
    const el = item!.el;
    expect(el.sortableChildren).toBe(true);
    const label = el.children.find((c) => c instanceof Text)!;
    const labelBg = el.children.find((c) => c instanceof Graphics)!;
    expect(label.zIndex).toBeGreaterThan(labelBg.zIndex);
  });

  it('shows the village-connected icon when two own villages are joined by a road', () => {
    const ownVillage = (q: number, r: number): MapTile => ({
      q, r, terrain: TileType.GrasslandLand, height: 0.1, settlement: { owner: 0, level: 1, captureReady: false, name: `Own${q}` },
      building: null, roadOwner: null, unit: null, ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    });
    const roadTile: MapTile = {
      q: 1, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null,
      building: null, roadOwner: 0, unit: null, ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 2, spawns: [], tiles: [ownVillage(0, 0), roadTile, ownVillage(2, 0)] };
    const connectedTextures = buildTextures(m);
    connectedTextures.villageConnectedTexture = tex(16, 16);
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, connectedTextures, HEX, SPRITE_SCALE, 2);
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const items = (v as unknown as { overlayItems: { el: Container }[] }).overlayItems;
    const labels = items.filter((o) =>
      o.el.children.some((c) => c instanceof Text && String((c as Text).text).startsWith('Own')),
    );
    expect(labels.length).toBe(2);
    for (const l of labels) {
      expect(l.el.children.some((c) => c instanceof Sprite)).toBe(true);
    }
    v.destroy();
  });

  it('shows an edge capture marker while the capturable village is off-screen and hides it once visible', () => {
    const farVillage: MapTile = {
      q: 10, r: 0, terrain: TileType.GrasslandLand, height: 0.1,
      settlement: { owner: 1, level: 1, captureReady: true },
      building: null, roadOwner: null,
      unit: {
        id: 'cap', owner: 0, type: 'warrior', q: 10, r: 0,
        hasMoved: true, hasAttacked: false, hasHealed: false,
        hp: 50, attack: 2, attackDistance: 1, spawnVillage: null,
      },
      ownedBy: 1, claimedByVillage: null, exploredBy: [0, 1],
    };
    const m: GameMap = { radius: 11, spawns: [], tiles: [farVillage] };
    const markerTextures = buildTextures(m);
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const enemy: Player = {
      index: 1, tribe: Tribe.Warriors, isHuman: false, name: 'E',
      resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true,
    };
    const v = new MapView(app, markerTextures, HEX, SPRITE_SCALE, 2);
    v.update(m, [players[0]!, enemy], null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 120, height: 120,
    });
    const edge = (v as unknown as { edgeMarkers: Container }).edgeMarkers;
    v.repositionEdgeMarkers({ x: 0, y: 0, scale: 1, width: 120, height: 120 });
    expect(edge.children.length).toBe(1);
    v.repositionEdgeMarkers({ x: -400, y: 200, scale: 1, width: 800, height: 600 });
    expect(edge.children.length).toBe(0);
    v.destroy();
  });

  it('does not restart the edge marker animation on repeated marker rebuilds', () => {
    const farVillage: MapTile = {
      q: 10, r: 0, terrain: TileType.GrasslandLand, height: 0.1,
      settlement: { owner: 1, level: 1, captureReady: true },
      building: null, roadOwner: null,
      unit: {
        id: 'cap', owner: 0, type: 'warrior', q: 10, r: 0,
        hasMoved: true, hasAttacked: false, hasHealed: false,
        hp: 50, attack: 2, attackDistance: 1, spawnVillage: null,
      },
      ownedBy: 1, claimedByVillage: null, exploredBy: [0, 1],
    };
    const m: GameMap = { radius: 11, spawns: [], tiles: [farVillage] };
    const markerTextures = buildTextures(m);
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const enemy: Player = {
      index: 1, tribe: Tribe.Warriors, isHuman: false, name: 'E',
      resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true,
    };
    const v = new MapView(app, markerTextures, HEX, SPRITE_SCALE, 2);
    const viewport = { x: 0, y: 0, scale: 1, width: 120, height: 120 };
    v.update(m, [players[0]!, enemy], null, new Set(), new Set(), 0, new Set(), viewport);
    v.repositionEdgeMarkers(viewport);
    const edgePulseRunning = (): boolean =>
      (v as unknown as { stopEdgePulseFn: (() => void) | null }).stopEdgePulseFn !== null;
    expect(edgePulseRunning()).toBe(true);

    // An unrelated map/action update triggers a marker rebuild. The animation
    // ticker callback must NOT be taken down (its phase clock would reset and
    // the marker would visibly jump back to the start of the slide).
    v.repositionEdgeMarkers(viewport);
    v.repositionEdgeMarkers(viewport);
    expect(edgePulseRunning()).toBe(true);
    v.destroy();
    expect(edgePulseRunning()).toBe(false);
  });

  it('positions a top-edge capture marker at the village screen x', () => {
    const v: MapTile = {
      q: 5, r: -2, terrain: TileType.GrasslandLand, height: 0.1,
      settlement: { owner: 1, level: 1, captureReady: true },
      building: null, roadOwner: null,
      unit: {
        id: 'cap', owner: 0, type: 'warrior', q: 5, r: -2,
        hasMoved: false, hasAttacked: false, hasHealed: false,
        hp: 50, attack: 2, attackDistance: 1, spawnVillage: null,
      },
      ownedBy: 1, claimedByVillage: null, exploredBy: [0, 1],
    };
    const m: GameMap = { radius: 11, spawns: [], tiles: [v] };
    const markerTextures = buildTextures(m);
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const enemy: Player = {
      index: 1, tribe: Tribe.Warriors, isHuman: false, name: 'E',
      resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true,
    };
    const view = new MapView(app, markerTextures, HEX, SPRITE_SCALE, 2);
    const W = 800;
    const H = 600;
    const p = hexToPixel(v, HEX);
    view.update(m, [players[0]!, enemy], null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: W, height: H,
    });
    expect(p.y).toBeLessThan(0);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(W);
    view.repositionEdgeMarkers({ x: 0, y: 0, scale: 1, width: W, height: H });
    const parts = (view as unknown as { edgeMarkerParts: { side: 'l' | 'r' | 't' | 'b'; along: number; W: number; H: number }[] }).edgeMarkerParts;
    expect(parts.length).toBe(1);
    expect(parts[0]!.side).toBe('t');
    expect(parts[0]!.along).toBe(p.x);
    view.destroy();
  });

  it('positions a left-edge capture marker at the village screen y', () => {
    const v: MapTile = {
      q: -8, r: 3, terrain: TileType.GrasslandLand, height: 0.1,
      settlement: { owner: 1, level: 1, captureReady: true },
      building: null, roadOwner: null,
      unit: {
        id: 'cap', owner: 0, type: 'warrior', q: -8, r: 3,
        hasMoved: false, hasAttacked: false, hasHealed: false,
        hp: 50, attack: 2, attackDistance: 1, spawnVillage: null,
      },
      ownedBy: 1, claimedByVillage: null, exploredBy: [0, 1],
    };
    const m: GameMap = { radius: 11, spawns: [], tiles: [v] };
    const markerTextures = buildTextures(m);
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const enemy: Player = {
      index: 1, tribe: Tribe.Warriors, isHuman: false, name: 'E',
      resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true,
    };
    const view = new MapView(app, markerTextures, HEX, SPRITE_SCALE, 2);
    const W = 800;
    const H = 600;
    const p = hexToPixel(v, HEX);
    view.update(m, [players[0]!, enemy], null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: W, height: H,
    });
    expect(p.x).toBeLessThan(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(H);
    view.repositionEdgeMarkers({ x: 0, y: 0, scale: 1, width: W, height: H });
    const parts = (view as unknown as { edgeMarkerParts: { side: 'l' | 'r' | 't' | 'b'; along: number; W: number; H: number }[] }).edgeMarkerParts;
    expect(parts.length).toBe(1);
    expect(parts[0]!.side).toBe('l');
    expect(parts[0]!.along).toBe(p.y);
    view.destroy();
  });

  it('lays the hp label text above its black background', () => {
    const el = hpBarItem().el;
    expect(el.sortableChildren).toBe(true);
    const labelIndex = el.children.findIndex((c) => c instanceof Text);
    const labelBg = el.children[labelIndex - 1] as Graphics;
    const label = el.children[labelIndex] as Text;
    expect(label.zIndex).toBeGreaterThan(labelBg.zIndex);
  });

  it('dims the hp label background for an own unit with no actions', () => {
    const tile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    tile.unit = { ...tile.unit!, hasMoved: true, hasAttacked: true, hasHealed: true };
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    const el = hpBarItem().el;
    const labelIndex = el.children.findIndex((c) => c instanceof Text);
    const labelBg = el.children[labelIndex - 1] as Graphics;
    const context = labelBg.context as unknown as {
      instructions: Array<{ action: string; data: { style: { color: number; alpha: number } } }>;
    };
    const fill = context.instructions.find((i) => i.action === 'fill')!.data.style;
    expect(fill.color).toBe(0x000000);
    expect(fill.alpha).toBe(0.3);
  });

  it('keeps an own unit dimmed while it is not the local turn even if it can act', () => {
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    }, new Set(), false);
    const el = hpBarItem().el;
    const labelIndex = el.children.findIndex((c) => c instanceof Text);
    const labelBg = el.children[labelIndex - 1] as Graphics;
    const context = labelBg.context as unknown as {
      instructions: Array<{ action: string; data: { style: { color: number; alpha: number } } }>;
    };
    const fill = context.instructions.find((i) => i.action === 'fill')!.data.style;
    expect(fill.color).toBe(0x000000);
    expect(fill.alpha).toBe(0.3);
  });

  it('does not draw the red can-act dot on an own unit hp bar', () => {
    const el = hpBarItem().el;
    const graphicsCount = el.children.filter((c) => c instanceof Graphics).length;
    expect(graphicsCount).toBe(3);
  });

  it('draws move and attack markers in the marker layer above tiles and overlays', () => {
    const t00: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
      roadOwner: null, unit: null, ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const t10: MapTile = {
      q: 1, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
      roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0],
    };
    const t01: MapTile = {
      q: 0, r: 1, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
      roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [t00, t10, t01] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    const selection = { kind: 'unit', q: 0, r: 0 } as const;
    v.update(m, players, selection, new Set(['1,0']), new Set(['0,1']), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const markerLayer = v.markerLayer;
    expect(markerLayer.children.length).toBe(2);
    expect(markerLayer.children.some((c) => c instanceof Graphics)).toBe(true);
    // The container holds tiles but no ground marker dots.
    expect(v.container.children.every((c) => c instanceof Container)).toBe(true);
    // The marker layer is a dedicated sibling of the tile/scene layers, not a
    // child of either, so it can be mounted above the overlay by the host.
    expect(markerLayer).not.toBe(v.container);
    expect(markerLayer).not.toBe(v.overlay);
    expect(markerLayer.parent).toBeNull();
    v.destroy();
  });

  it('adds a larger unfilled white ring around the move marker dot', () => {
    const t00: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
      roadOwner: null, unit: null, ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const t10: MapTile = {
      q: 1, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
      roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [t00, t10] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    const selection = { kind: 'unit', q: 0, r: 0 } as const;
    v.update(m, players, selection, new Set(['1,0']), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const moveMarker = v.markerLayer.children[0] as Graphics;
    const ctx = moveMarker.context as unknown as { instructions: Array<{ action: string; data: { style: { width: number; color: number; alpha: number; alignment: number } } }> };
    const strokes = ctx.instructions.filter((i) => i.action === 'stroke');
    const fills = ctx.instructions.filter((i) => i.action === 'fill');
    // Inner filled circle + outer unfilled ring (two strokes, one fill).
    expect(strokes.length).toBe(2);
    expect(fills.length).toBe(1);
    // Both strokes sit outside the circle path so the ring outline does not
    // cover the filled dot.
    for (const s of strokes) expect(s.data.style.alignment).toBe(0);
    v.destroy();
  });

  it('keeps the selected tile el above same-row neighbors so the top border stays visible', () => {
    const t00: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
      roadOwner: null, unit: null, ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const t10: MapTile = {
      q: 1, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
      roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [t00, t10] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    const selection: import('../src/game/selection').Selection = { kind: 'terrain', q: 0, r: 0 };
    v.update(m, players, selection, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    const tvs = (v as unknown as { tileViews: Map<string, { el: Container }> }).tileViews;
    const idx00 = v.container.children.indexOf(tvs.get('0,0')!.el);
    const idx10 = v.container.children.indexOf(tvs.get('1,0')!.el);
    expect(idx00).toBeGreaterThan(idx10);
    v.destroy();
  });

  it('splits the selected border: top part layered in the tile, bottom part above everything', () => {
    const selection: import('../src/game/selection').Selection = { kind: 'terrain', q: 0, r: 0 };
    view.update(map, players, selection, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    const tv = (view as unknown as { tileViews: Map<string, { el: Container }> }).tileViews.get('0,0')!;
    const terrainSprite = tv.el.children.find((c) => (c as { zIndex: number }).zIndex === 0);
    const unitSprite = tv.el.children.find((c) => (c as { zIndex: number }).zIndex === 7);
    const tileGraphics = tv.el.children.filter((c) => c instanceof Graphics);
    expect(tileGraphics.length).toBe(2);
    const topPart = tileGraphics.find(
      (c) => (c as { zIndex: number }).zIndex > (terrainSprite as { zIndex: number }).zIndex && (c as { zIndex: number }).zIndex < (unitSprite as { zIndex: number }).zIndex,
    );
    expect(topPart).toBeDefined();
    const containerGraphics = view.container.children.filter((c) => c instanceof Graphics);
    expect(containerGraphics.length).toBe(1);
    expect(view.container.children[view.container.children.length - 1]).toBe(containerGraphics[0]);
  });

  it('draws the split selected border as open polylines without a closing segment', () => {
    const selection: import('../src/game/selection').Selection = { kind: 'terrain', q: 0, r: 0 };
    view.update(map, players, selection, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    const tv = (view as unknown as { tileViews: Map<string, { el: Container }> }).tileViews.get('0,0')!;
    const tileGraphics = tv.el.children.filter((c) => c instanceof Graphics) as Graphics[];
    const topPart = tileGraphics[tileGraphics.length - 1]!;
    const context = topPart.context as unknown as {
      instructions: Array<{ action: string; data: { path: { instructions: Array<{ action: string }> } } }>;
    };
    const stroke = context.instructions.find((i) => i.action === 'stroke')!;
    const actions = stroke.data.path.instructions.map((i) => i.action);
    expect(actions).toContain('moveTo');
    expect(actions).toContain('lineTo');
    expect(actions).not.toContain('poly');
    expect(actions).not.toContain('closePath');
  });

  it('renders a directional port texture pointing at the adjacent owned land', () => {
    const portTile: MapTile = {
      q: 0, r: 0, terrain: TileType.Water, height: 0.1, settlement: null,
      building: { kind: 'port', level: 1 }, roadOwner: null, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const villageTile: MapTile = {
      q: 1, r: 0, terrain: TileType.GrasslandLand, height: 0.1,
      settlement: { owner: 0, level: 1, captureReady: false }, building: null, roadOwner: null,
      unit: null, ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const portMap: GameMap = { radius: 1, spawns: [], tiles: [portTile, villageTile] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    v.update(portMap, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tv = (v as unknown as { tileViews: Map<string, { buildingSprite: Sprite | null }> }).tileViews.get('0,0')!;
    expect(tv.buildingSprite?.texture).toBe(textures.portTextures.e.texture);
    v.destroy();
  });

  it('renders the free port texture for a port with no owner', () => {
    const freePort: MapTile = {
      q: 0, r: 0, terrain: TileType.Water, height: 0.1, settlement: null,
      building: { kind: 'port', level: 1 }, roadOwner: null, unit: null,
      ownedBy: null, claimedByVillage: null, exploredBy: [0],
    };
    const portMap: GameMap = { radius: 1, spawns: [], tiles: [freePort] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    v.update(portMap, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tv = (v as unknown as { tileViews: Map<string, { buildingSprite: Sprite | null }> }).tileViews.get('0,0')!;
    expect(tv.buildingSprite?.texture).toBe(textures.freePortTexture);
    v.destroy();
  });

  it('renders the bridge texture matching its orientation', () => {
    const t: MapTile = {
      q: 0, r: 0, terrain: TileType.Water, height: 0.1, settlement: null,
      building: null, roadOwner: 0, bridge: { owner: 0, dir: 'we' }, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [t] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tv = (v as unknown as { tileViews: Map<string, { bridgeSprite: Sprite | null }> }).tileViews.get('0,0')!;
    expect(tv.bridgeSprite?.texture).toBe(textures.bridgeTextures.we.texture);
    v.destroy();
  });

  it('does not draw a road above a bridge even when it is roadOwner-connected', () => {
    const bridgeTile: MapTile = {
      q: 0, r: 0, terrain: TileType.Water, height: 0.1, settlement: null,
      building: null, roadOwner: 0, bridge: { owner: 0, dir: 'we' }, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const shoreTile: MapTile = {
      q: 1, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null,
      building: null, roadOwner: 0, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [bridgeTile, shoreTile] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tv = (v as unknown as { tileViews: Map<string, { roadGraphics: Graphics | null; bridgeSprite: Sprite | null }> }).tileViews.get('0,0')!;
    expect(tv.bridgeSprite).not.toBeNull();
    expect(tv.roadGraphics).toBeNull();
    v.destroy();
  });

  it('raises the bridge to the lower of its two coast elevations', () => {
    const bridgeTile: MapTile = {
      q: 0, r: 0, terrain: TileType.Water, height: 0.1, settlement: null,
      building: null, roadOwner: 0, bridge: { owner: 0, dir: 'we' }, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const lowCoast: MapTile = {
      q: -1, r: 0, terrain: TileType.GrasslandLand, height: 0.4, settlement: null,
      building: null, roadOwner: 0, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const highCoast: MapTile = {
      q: 1, r: 0, terrain: TileType.GrasslandLand, height: 0.9, settlement: null,
      building: null, roadOwner: 0, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [bridgeTile, lowCoast, highCoast] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tv = (v as unknown as { tileViews: Map<string, { bridgeSprite: Sprite | null }> }).tileViews.get('0,0')!;
    const p = hexToPixel({ q: 0, r: 0 }, HEX);
    expect(tv.bridgeSprite?.y).toBeCloseTo(p.y - tileElevation(lowCoast, HEX));
    expect(tileElevation(highCoast, HEX)).toBeGreaterThan(tileElevation(lowCoast, HEX));
    v.destroy();
  });

  it('renders the temple texture matching the temple level', () => {
    const t: MapTile = {
      q: 0, r: 0, terrain: TileType.Water, height: 0.1, settlement: null,
      building: { kind: 'temple', level: 3 }, roadOwner: null, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [t] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tv = (v as unknown as { tileViews: Map<string, { buildingSprite: Sprite | null }> }).tileViews.get('0,0')!;
    expect(tv.buildingSprite?.texture).toBe(textures.templeTextures[3].texture);
    v.destroy();
  });

  it('renders the forest temple texture matching the temple level', () => {
    const t: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandForest, height: 0.1, settlement: null,
      building: { kind: 'forestTemple', level: 3 }, roadOwner: null, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [t] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tv = (v as unknown as { tileViews: Map<string, { buildingSprite: Sprite | null }> }).tileViews.get('0,0')!;
    expect(tv.buildingSprite?.texture).toBe(textures.forestTempleTextures[3].texture);
    v.destroy();
  });

  function fireItem(): { el: Container } | undefined {
    return view.overlayItems.find((o) => o.el.children.filter((c) => c instanceof Graphics).length >= 10);
  }

  it('uses fire particle sizes that are 3x larger', () => {
    expect(FIRE_SIZE_MIN).toBe(6);
    expect(FIRE_SIZE_MAX).toBe(12);
  });

  it('renders fire in the unscaled overlay so particle size is zoom-independent', () => {
    players.push({ index: 1, tribe: Tribe.Cats, isHuman: true, name: 'Enemy', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true });
    const tile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    tile.settlement = { owner: 0, level: 1, captureReady: false };
    tile.unit = {
      id: 'e1', owner: 1, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    expect(fireItem()!.el.parent).toBe(view.overlay);
  });

  it('shows fire particles around a village occupied by an enemy unit', () => {
    players.push({ index: 1, tribe: Tribe.Cats, isHuman: true, name: 'Enemy', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true });
    const tile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    tile.settlement = { owner: 0, level: 1, captureReady: false };
    tile.unit = {
      id: 'e1', owner: 1, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    expect(fireItem()).toBeDefined();
  });

  it('does not show fire when the unit on a village is friendly or absent', () => {
    const tile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    tile.settlement = { owner: 0, level: 1, captureReady: false };
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    expect(fireItem()).toBeUndefined();
  });

  it('resets pooled graphics state before reuse so fire particles do not leak alpha/position into hp bars', () => {
    players.push({ index: 1, tribe: Tribe.Cats, isHuman: true, name: 'Enemy', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true });
    const tile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    tile.settlement = { owner: 0, level: 1, captureReady: false };
    tile.unit = {
      id: 'e1', owner: 1, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const viewport = { x: 400, y: 300, scale: 1, width: 800, height: 600 };
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), viewport);
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), viewport);
    for (const item of view.overlayItems) {
      if (fireItem() === item) continue;
      for (const child of item.el.children) {
        if (child instanceof Graphics) {
          expect(child.alpha).toBe(1);
          expect(child.position.x).toBe(0);
          expect(child.position.y).toBe(0);
        }
      }
    }
  });

  it('keeps the hp bar at a constant offset relative to the unit texture at any zoom', () => {
    const tile = map.tiles[0]!;
    const p = hexToPixel(tile, HEX);
    const topWorld = p.y - tileElevation(tile, HEX) - ANCHOR_Y * TEX_H * SPRITE_SCALE;
    const item = hpBarItem();
    const bg = item.el.children[0] as Graphics;
    const barBottom = bg.getBounds().maxY;
    // Screen gap between the bar and the texture top = worldOffset * scale + barLocal.
    const gapAt = (scale: number): number => barBottom + (item.world.y - topWorld) * scale;
    const worldOffset = (gapAt(2) - gapAt(0.5)) / (2 - 0.5);
    expect(worldOffset).toBeCloseTo(40, 5);
    // The bar therefore sits at the same spot on the unit at every zoom level.
    expect(item.world.y - topWorld).toBeCloseTo(40, 5);
  });

  it('shows an overridden hp value on the unit hp bar', () => {
    view.setHpOverride('u1', 2);
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    const item = hpBarItem();
    const label = item.el.children.find((c): c is Text => c instanceof Text);
    expect(label).toBeDefined();
    expect(label!.text).toBe('2/50');
    view.clearHpOverrides();
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    const item2 = hpBarItem();
    const label2 = item2.el.children.find((c): c is Text => c instanceof Text);
    expect(label2!.text).toBe('50/50');
  });

  it('flips a unit sprite to face its last attack direction and keeps it on re-render', () => {
    const t00: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null,
      building: null, roadOwner: null, unit: null, ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const t10: MapTile = {
      q: 1, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null,
      building: null, roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0],
    };
    const u1: Unit = {
      id: 'u1', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    t00.unit = u1;
    const m: GameMap = { radius: 1, spawns: [], tiles: [t00, t10] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    const viewport = { x: 400, y: 300, scale: 1, width: 800, height: 600 };
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), viewport);
    const tvs = (v as unknown as { tileViews: Map<string, { unitSprite: Sprite | null }> }).tileViews;
    const s0 = tvs.get('0,0')!.unitSprite!;
    expect(s0.scale.x).toBeGreaterThan(0);
    v.setUnitFacing('u1', 'left');
    expect(s0.scale.x).toBeLessThan(0);
    // Unit moves to another tile: the stored facing survives the re-render.
    t00.unit = null;
    t10.unit = u1;
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), viewport);
    const s1 = tvs.get('1,0')!.unitSprite!;
    expect(s1).toBeDefined();
    expect(s1.scale.x).toBeLessThan(0);
    v.destroy();
  });

  it('flips a unit to face left and shows the default right facing after a flip back', () => {
    const t00: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandLand, height: 0.1, settlement: null,
      building: null, roadOwner: null, unit: null, ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const u1: Unit = {
      id: 'u1', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    t00.unit = u1;
    const m: GameMap = { radius: 1, spawns: [], tiles: [t00] };
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    const viewport = { x: 400, y: 300, scale: 1, width: 800, height: 600 };
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), viewport);
    const tvs = (v as unknown as { tileViews: Map<string, { unitSprite: Sprite | null }> }).tileViews;
    const s0 = tvs.get('0,0')!.unitSprite!;
    v.setUnitFacing('u1', 'left');
    expect(s0.scale.x).toBeLessThan(0);
    v.setUnitFacing('u1', 'right');
    expect(s0.scale.x).toBeGreaterThan(0);
    v.destroy();
  });

  it('bobs a visible pirate ship sprite up and down on the ticker', () => {
    const callbacks: Array<() => void> = [];
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (fn: () => void) => callbacks.push(fn), remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    const tile: MapTile = {
      q: 0, r: 0, terrain: TileType.Water, height: 0.1, settlement: null,
      building: null, roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0],
    };
    tile.unit = {
      id: 'pir', owner: -1, type: 'pirate', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 15, attack: 3, attackDistance: 1, spawnVillage: null,
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [tile] };
    const origNow = performance.now;
    let now = 0;
    (performance as { now: () => number }).now = () => now;
    try {
      v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
        x: 400, y: 300, scale: 1, width: 800, height: 600,
      });
      const tvs = (v as unknown as { tileViews: Map<string, { unitSprite: Sprite | null }> }).tileViews;
      const sprite = tvs.get('0,0')!.unitSprite!;
      const fn = callbacks[0]!;
      now = 0;
      fn();
      const y0 = sprite.position.y;
      now = 650;
      fn();
      expect(sprite.position.y).toBeCloseTo(y0 + 2.5, 5);
    } finally {
      (performance as { now: () => number }).now = origNow;
      v.destroy();
    }
  });

  it('shows the wall sprite above the village once a wall is built', () => {
    const t: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandLand, height: 0.1,
      settlement: { owner: 0, level: 1, captureReady: false, wall: false },
      building: null, roadOwner: null, unit: null,
      ownedBy: 0, claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [t] };
    const settlement = t.settlement!;
    const wallTex = tileTex(256, 448, 0.705);
    textures.wallTexture = wallTex;
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    const v = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    const viewport = { x: 400, y: 300, scale: 1, width: 800, height: 600 };
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), viewport);
    const tvs = (v as unknown as { tileViews: Map<string, { wallSprite: Sprite | null }> }).tileViews;
    const tv = tvs.get('0,0')!;
    expect(tv.wallSprite).toBeNull();
    // Building the wall must trigger a re-render of the tile.
    settlement.wall = true;
    v.update(m, players, null, new Set(), new Set(), 0, new Set(), viewport);
    expect(tv.wallSprite).not.toBeNull();
    expect(tv.wallSprite!.texture).toBe(wallTex.texture);
    expect(tv.wallSprite!.anchor.y).toBeCloseTo(0.705, 5);
    expect(tv.wallSprite!.visible).toBe(true);
    const p = hexToPixel(t, HEX);
    const y = p.y - tileElevation(t, HEX);
    expect(tv.wallSprite!.position.x).toBeCloseTo(p.x, 5);
    expect(tv.wallSprite!.position.y).toBeCloseTo(y, 5);
    textures.wallTexture = null;
    v.destroy();
  });

  it('renders a bonus sprite above the hex, building and unit on the tile', () => {
    const bonusTile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    bonusTile.bonus = { kind: 'money', claimer: null, arrivalTurn: 0 };
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    const tvs = (view as unknown as { tileViews: Map<string, TileViewShape> }).tileViews;
    const tv = tvs.get(axialKey(bonusTile))!;
    expect(tv.bonusSprite).toBeDefined();
    expect(tv.bonusSprite!.visible).toBe(true);
    expect(tv.unitSprite).toBeDefined();
    const bonusZ = tv.bonusSprite!.zIndex;
    const buildingZ = tv.buildingSprite ? tv.buildingSprite.zIndex : 5;
    const unitZ = tv.unitSprite ? tv.unitSprite.zIndex : 7;
    expect(bonusZ).toBeGreaterThan(buildingZ);
    expect(bonusZ).toBeGreaterThan(unitZ);
    // Claiming removes the sprite.
    bonusTile.bonus = null;
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400,
      y: 300,
      scale: 1,
      width: 800,
      height: 600,
    });
    expect(tvs.get(axialKey(bonusTile))!.bonusSprite).toBeNull();
  });

  it('bounces the whole village hex up and back down like a selection', () => {
    const callbacks: Array<() => void> = [];
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (fn: () => void) => callbacks.push(fn), remove: (): void => {} },
    } as unknown as Application;
    const villageTile: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandLand, height: 0.1,
      settlement: { owner: 0, level: 1, captureReady: false },
      building: null, roadOwner: null, unit: null, ownedBy: 0,
      claimedByVillage: null, exploredBy: [0],
    };
    const m: GameMap = { radius: 1, spawns: [], tiles: [villageTile] };
    const texs = buildTextures(m);
    const v = new MapView(app, texs, HEX, SPRITE_SCALE, 2);
    const origNow = performance.now;
    let now = 0;
    (performance as { now: () => number }).now = () => now;
    try {
      v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
        x: 400, y: 300, scale: 1, width: 800, height: 600,
      });
      const tvs = (v as unknown as { tileViews: Map<string, { terrainSprite: Sprite; villageSprite: Sprite | null }> }).tileViews;
      const tv = tvs.get('0,0')!;
      expect(tv.villageSprite).not.toBeNull();

      v.bounceHex(0, 0);
      const bounceFn = callbacks[callbacks.length - 1]!;
      const terrainBase = tv.terrainSprite.position.y;
      const villageBase = tv.villageSprite!.position.y;

      now = 75; // half of the 150ms duration -> peak lift
      bounceFn();
      const amp = HEX * 0.2;
      expect(tv.terrainSprite.position.y).toBeCloseTo(terrainBase - amp, 5);
      expect(tv.villageSprite!.position.y).toBeCloseTo(villageBase - amp, 5);

      now = 200; // past the duration -> sprites restored
      bounceFn();
      expect(tv.terrainSprite.position.y).toBeCloseTo(terrainBase, 5);
      expect(tv.villageSprite!.position.y).toBeCloseTo(villageBase, 5);
    } finally {
      (performance as { now: () => number }).now = origNow;
      v.destroy();
    }
  });
});

describe('MapView road fog visibility', () => {
  let map: GameMap;
  let players: Player[];
  let textures: TextureSet;
  let view: MapView;

  const roadTile = (q: number, r: number, exploredBy: number[]): MapTile => ({
    q, r, terrain: TileType.GrasslandLand, height: 0.1,
    settlement: null, building: null, roadOwner: 0, unit: null,
    ownedBy: 0, claimedByVillage: null, exploredBy,
  });

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    map = { radius: 1, spawns: [], tiles: [roadTile(0, 0, [0]), roadTile(1, 0, [1])] };
    players = [
      { index: 0, tribe: Tribe.Cats, isHuman: true, name: 'Cats', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true },
    ];
    textures = buildTextures(map);
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    view = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
  });

  afterEach(() => {
    view.destroy();
  });

  it('hides the road on an unexplored (fogged) tile', () => {
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tvs = (view as unknown as { tileViews: Map<string, { roadGraphics: Graphics | null }> }).tileViews;
    // The first tile is explored: road drawn.
    expect(tvs.get(axialKey({ q: 0, r: 0 }))!.roadGraphics).not.toBeNull();
    // The second tile is unexplored: road absent.
    const keys = [...tvs.keys()];
    const fogKey = keys.find((k) => k !== '0,0')!;
    expect(tvs.get(fogKey)!.roadGraphics).toBeNull();
  });

  it('reveals the road once the tile is explored', () => {
    // Initial fogged state.
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tvs = (view as unknown as { tileViews: Map<string, { roadGraphics: Graphics | null }> }).tileViews;
    const keys = [...tvs.keys()];
    const fogKey = keys.find((k) => k !== '0,0')!;
    expect(tvs.get(fogKey)!.roadGraphics).toBeNull();
    // Explore it.
    const fogTile = map.tiles.find((t) => `${t.q},${t.r}` === fogKey)!;
    fogTile.exploredBy!.push(0);
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    expect(tvs.get(fogKey)!.roadGraphics).not.toBeNull();
  });
});

describe('MapView water roads', () => {
  function waterTile(q: number, r: number, opts: { port?: boolean; ownedBy?: number | null } = {}): MapTile {
    return {
      q, r, terrain: TileType.Water, height: 0.1, settlement: null,
      building: opts.port ? { kind: 'port', level: 1 } : null, roadOwner: null, unit: null,
      ownedBy: opts.ownedBy !== undefined ? opts.ownedBy : null,
      claimedByVillage: null, exploredBy: [0],
    };
  }

  let map: GameMap;
  let players: Player[];
  let textures: TextureSet;
  let view: MapView;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    map = {
      radius: 1,
      spawns: [],
      tiles: [
        waterTile(0, 0, { port: true, ownedBy: 0 }),
        waterTile(1, 0, { ownedBy: 0 }),
        waterTile(2, 0, { port: true, ownedBy: 0 }),
      ],
    };
    players = [
      { index: 0, tribe: Tribe.Cats, isHuman: true, name: 'Cats', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true },
      { index: 1, tribe: Tribe.Aqua, isHuman: false, name: 'Aqua', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true },
    ];
    textures = buildTextures(map);
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    view = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
  });

  afterEach(() => {
    view.destroy();
  });

  it('draws a light-blue water road between connected own ports', () => {
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tvs = (view as unknown as { tileViews: Map<string, { roadGraphics: Graphics | null }> }).tileViews;
    const g = tvs.get('1,0')!.roadGraphics;
    expect(g).not.toBeNull();
    const ctx = g!.context as unknown as {
      instructions: Array<{ action: string; data: { style: { color: number } } }>;
    };
    const strokes = ctx.instructions.filter((i) => i.action === 'stroke');
    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes[0]!.data.style.color).toBe(0x7fd8f5);
  });

  it('does not draw a water road over an unowned gap', () => {
    map = {
      radius: 1,
      spawns: [],
      tiles: [
        waterTile(0, 0, { port: true, ownedBy: 0 }),
        waterTile(1, 0, { ownedBy: null }),
        waterTile(2, 0, { port: true, ownedBy: 0 }),
      ],
    };
    textures = buildTextures(map);
    view.destroy();
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    view = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tvs = (view as unknown as { tileViews: Map<string, { roadGraphics: Graphics | null }> }).tileViews;
    expect(tvs.get('1,0')!.roadGraphics).toBeNull();
  });

  it('reveals the water road once the route tiles become owned', () => {
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tvs = (view as unknown as { tileViews: Map<string, { roadGraphics: Graphics | null }> }).tileViews;
    expect(tvs.get('1,0')!.roadGraphics).not.toBeNull();
    // Simulate a border change: tile 1 passes to another player, splitting the
    // route; the road must disappear.
    map.tiles[1]!.ownedBy = 1;
    view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    expect(tvs.get('1,0')!.roadGraphics).toBeNull();
  });
});

describe('MapView bottles', () => {
  function waterTile(q: number, r: number, opts: { bottle?: boolean; explored?: boolean } = {}): MapTile {
    const t: MapTile = {
      q, r, terrain: TileType.Water, height: 0.1, settlement: null,
      building: null, roadOwner: null, unit: null,
      ownedBy: null, claimedByVillage: null,
      exploredBy: opts.explored !== undefined && opts.explored ? [0] : [],
    };
    if (opts.bottle) t.bottle = { bornTurn: 3, arrivalTurn: 0 };
    return t;
  }

  let players: Player[];
  let textures: TextureSet;
  let view: MapView;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    players = [
      { index: 0, tribe: Tribe.Cats, isHuman: true, name: 'Cats', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true },
    ];
    const map: GameMap = { radius: 1, spawns: [], tiles: [waterTile(0, 0, { bottle: true, explored: true }), waterTile(1, 0, { explored: true })] };
    textures = buildTextures(map);
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    view = new MapView(app, textures, HEX, SPRITE_SCALE, 2);
  });

  afterEach(() => {
    view.destroy();
  });

  it('shows a bottle sprite floating above an explored water tile with a bottle', () => {
    view.update({ radius: 1, spawns: [], tiles: [waterTile(0, 0, { bottle: true, explored: true }), waterTile(1, 0, { explored: true })] }, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tvs = (view as unknown as { tileViews: Map<string, { bottleSprite: Sprite | null }> }).tileViews;
    expect(tvs.get('0,0')!.bottleSprite).not.toBeNull();
    expect(tvs.get('1,0')!.bottleSprite).toBeNull();
  });

  it('hides the bottle sprite on an unexplored tile', () => {
    view.update({ radius: 1, spawns: [], tiles: [waterTile(0, 0, { bottle: true }), waterTile(1, 0, { explored: true })] }, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tvs = (view as unknown as { tileViews: Map<string, { bottleSprite: Sprite | null }> }).tileViews;
    expect(tvs.get('0,0')!.bottleSprite).toBeNull();
  });

  it('removes the bottle sprite once the bottle expires', () => {
    const tiles = [waterTile(0, 0, { bottle: true, explored: true }), waterTile(1, 0, { explored: true })];
    view.update({ radius: 1, spawns: [], tiles }, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    const tvs = (view as unknown as { tileViews: Map<string, { bottleSprite: Sprite | null }> }).tileViews;
    expect(tvs.get('0,0')!.bottleSprite).not.toBeNull();
    tiles[0]!.bottle = undefined;
    view.update({ radius: 1, spawns: [], tiles }, players, null, new Set(), new Set(), 0, new Set(), {
      x: 400, y: 300, scale: 1, width: 800, height: 600,
    });
    expect(tvs.get('0,0')!.bottleSprite).toBeNull();
  });
});

describe('captureMarkerPoints', () => {
  it('keeps the top-edge triangle visible, vertex on the edge pointing up at the village', () => {
    // Resting: vertex on the top edge (y=0) pointing UP at the village above,
    // base 20px below on-screen so the triangle body is visible.
    const rest = captureMarkerPoints('t', 100, 0, 800, 600);
    expect(rest[3]).toBe(0); // vertex on the top edge
    expect(rest[1]).toBe(20); // base inside the screen
    expect(Math.min(rest[1], rest[3], rest[5])).toBe(0); // vertex is the top-most point
    expect(rest[2]).toBe(100); // vertex sits at the village screen x
    // Slid: vertex moved 10px out past the edge; base still on-screen (10px).
    const slid = captureMarkerPoints('t', 100, 10, 800, 600);
    expect(slid[3]).toBe(-10);
    expect(slid[1]).toBe(10);
    expect(slid[2]).toBe(100);
  });

  it('keeps the bottom-edge triangle visible, vertex pointing down at the village', () => {
    const rest = captureMarkerPoints('b', 100, 0, 800, 600);
    expect(rest[3]).toBe(600); // vertex on the bottom edge
    expect(rest[1]).toBe(580); // base inside the screen
    expect(Math.max(rest[1], rest[3], rest[5])).toBe(600); // vertex is the bottom-most point
    expect(rest[2]).toBe(100);
    const slid = captureMarkerPoints('b', 100, 10, 800, 600);
    expect(slid[3]).toBe(610);
    expect(slid[1]).toBe(590);
  });

  it('keeps left/right triangles visible, vertex pointing toward the village', () => {
    const l = captureMarkerPoints('l', 50, 0, 800, 600);
    expect(l[2]).toBe(0); // vertex on the left edge
    expect(l[0]).toBe(20); // base inside the screen
    expect(Math.min(l[0], l[2], l[4])).toBe(0); // vertex is the left-most point
    expect(l[3]).toBe(50); // vertex sits at the village screen y
    const lSlid = captureMarkerPoints('l', 50, 10, 800, 600);
    expect(lSlid[2]).toBe(-10);
    expect(lSlid[0]).toBe(10);

    const r = captureMarkerPoints('r', 50, 0, 800, 600);
    expect(r[2]).toBe(800); // vertex on the right edge
    expect(r[0]).toBe(780); // base inside the screen
    expect(Math.max(r[0], r[2], r[4])).toBe(800); // vertex is the right-most point
    expect(r[3]).toBe(50);
    const rSlid = captureMarkerPoints('r', 50, 10, 800, 600);
    expect(rSlid[2]).toBe(810);
    expect(rSlid[0]).toBe(790);
  });
});

interface TileViewShape {
  bonusSprite: Sprite | null;
  buildingSprite: Sprite | null;
  unitSprite: Sprite | null;
}
