import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Application, Container, Graphics, ImageSource, Sprite, Text, Texture } from 'pixi.js';
import { MapView, FIRE_SIZE_MIN, FIRE_SIZE_MAX } from '../src/render/mapRenderer';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import { Unit, UNIT_TYPES } from '../src/game/units';
import { axialKey, hexToPixel } from '../src/game/hex';
import { tileElevation } from '../src/render/elevation';
import { type TextureSet, type TileTexture } from '../src/render/textureFactory';

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
    villageTextures: { level1: tileTex(40, 40, 0.7), level2: tileTex(40, 40, 0.7) },
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
    villageConnectedTexture: null,
    captureTexture: null,
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

  it('does not draw the red can-act dot on an own unit hp bar', () => {
    const el = hpBarItem().el;
    const graphicsCount = el.children.filter((c) => c instanceof Graphics).length;
    expect(graphicsCount).toBe(3);
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

  it('renders a directional port texture pointing at the nearest owned village', () => {
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
});

interface TileViewShape {
  bonusSprite: Sprite | null;
  buildingSprite: Sprite | null;
  unitSprite: Sprite | null;
}
