import { Application, Container, FillGradient, Graphics, Sprite, Texture } from 'pixi.js';
import { axialKey, HEX_TILT } from '../game/hex';
import { GameMap, type BridgeDir } from '../game/mapGen';
import { isWaterType, TileType, TILE_TYPE_COLORS } from '../game/tileTypes';
import { TRIBES, Tribe } from '../game/tribes';
import { UnitType, UNIT_IMAGE_FILES, UNIT_TYPES } from '../game/units';
import { PortDirection } from '../game/buildings';
import { shadeColor } from '../util/color';
import { tileElevation } from './elevation';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

const TILE_IMAGE_FILES: Record<TileType, string> = {
  [TileType.GrasslandLand]: 'grassland-land.png',
  [TileType.GrasslandForest]: 'grassland-forest.png',
  [TileType.GrasslandMountain]: 'grassland-mountain.png',
  [TileType.DesertLand]: 'desert-land.png',
  [TileType.DesertForest]: 'desert-forest.png',
  [TileType.DesertMountain]: 'desert-mountain.png',
  [TileType.TundraLand]: 'tundra-land.png',
  [TileType.TundraForest]: 'tundra-forest.png',
  [TileType.TundraMountain]: 'tundra-mountain.png',
  [TileType.TaigaLand]: 'taiga-land.png',
  [TileType.TaigaForest]: 'taiga-forest.png',
  [TileType.TaigaMountain]: 'taiga-mountain.png',
  [TileType.RainforestLand]: 'rainforest-land.png',
  [TileType.RainforestForest]: 'rainforest-forest.png',
  [TileType.RainforestMountain]: 'rainforest-mountain.png',
  [TileType.Water]: 'water.png',
  [TileType.Settlement]: 'grassland-land.png',
};

const FOG_IMAGE_FILE = 'fog.png';
const FOG_LEFT_WALL = 0xd5bbdc;
const FOG_RIGHT_WALL = 0xc2a4ca;
const VILLAGE_CONNECTED_IMAGE_FILE = 'village-connected.png';
const SAWMILL_IMAGE_FILE = 'sawmill.png';
const MINE_IMAGE_FILE = 'mine.png';

const BRIDGE_IMAGE_FILES: Record<BridgeDir, string> = {
  nw: 'bridge-nw.png',
  ne: 'bridge-ne.png',
  we: 'bridge-we.png',
};
const VILLAGE_IMAGE_FILE = 'village.png';
const VILLAGE_LEVEL2_IMAGE_FILE = 'village-2.png';
const CAPTURE_IMAGE_FILE = 'capture-map.png';
const PIRATE_IMAGE_FILE = 'pirates-ship.png';

const PORT_IMAGE_FILES: Record<PortDirection, string> = {
  nw: 'port-nw.png',
  ne: 'port-ne.png',
  sw: 'port-sw.png',
  se: 'port-se.png',
  e: 'port-e.png',
  w: 'port-w.png',
};

const TEMPLE_IMAGE_FILES: Record<1 | 2 | 3 | 4, string> = {
  1: 'water-temple-1.png',
  2: 'water-temple-2.png',
  3: 'water-temple-3.png',
  4: 'water-temple-4.png',
};

const FOREST_TEMPLE_IMAGE_FILES: Record<1 | 2 | 3 | 4, string> = {
  1: 'forest-temple-1.png',
  2: 'forest-temple-2.png',
  3: 'forest-temple-3.png',
  4: 'forest-temple-4.png',
};

const IMAGE_HEX_W = 254;
const IMAGE_H = 448;
const IMAGE_HEX_CENTER_Y = 316;

export interface TileTexture {
  texture: Texture;
  anchorY: number;
}

export interface TextureSet {
  tileTextures: Map<string, TileTexture>;
  fogTextures: Map<string, TileTexture>;
  fogTopTexture: TileTexture;
  villageTextures: { level1: TileTexture; level2: TileTexture };
  freeVillageTexture: TileTexture;
  bonusTexture: TileTexture;
  unitTextures: Record<Tribe, Record<UnitType, TileTexture>>;
  pirateTexture: TileTexture;
  sawmillTexture: TileTexture;
  mineTexture: TileTexture;
  bridgeTextures: Record<BridgeDir, TileTexture>;
  portTextures: Record<PortDirection, TileTexture>;
  freePortTexture: Texture;
  templeTextures: Record<1 | 2 | 3 | 4, TileTexture>;
  forestTempleTextures: Record<1 | 2 | 3 | 4, TileTexture>;
  shipTextures: Record<Tribe, Record<1 | 2 | 3, TileTexture>>;
  villageConnectedTexture: Texture | null;
  captureTexture: Texture | null;
}

function hexagonPoints(size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(size * Math.cos(angle), size * Math.sin(angle) * HEX_TILT);
  }
  return points;
}

function composeHexTexture(
  app: Application,
  hexSize: number,
  height: number,
  image: Texture | null,
  fill: number,
  opts: { walls: boolean; anchor: 'base' | 'topface'; sideColors?: { left: number; right: number } },
): TileTexture {
  const container = new Container();
  const g = new Graphics();
  if (opts.walls && height > 0) {
    const face = hexagonPoints(hexSize);
    const maxH = height;
    const left = opts.sideColors?.left ?? shadeColor(fill, 0.7);
    const right = opts.sideColors?.right ?? shadeColor(fill, 0.45);
    g.poly([
      face[8]!, face[9]!,
      face[10]!, face[11]!,
      face[4]!, face[5]! + maxH,
      face[6]!, face[7]! + maxH,
    ]).fill(left);
    g.poly([
      face[10]!, face[11]!,
      face[0]!, face[1]!,
      face[2]!, face[3]! + maxH,
      face[4]!, face[5]! + maxH,
    ]).fill(right);
  }
  if (image) {
    g.poly(hexagonPoints(hexSize)).fill(fill);
  } else {
    const gradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: -hexSize * HEX_TILT },
      end: { x: 0, y: hexSize * HEX_TILT },
      colorStops: [
        { offset: 0, color: shadeColor(fill, 1.35) },
        { offset: 1, color: fill },
      ],
      textureSpace: 'global',
    });
    g.poly(hexagonPoints(hexSize)).fill(gradient);
  }
  container.addChild(g);
  if (image) {
    const sprite = new Sprite(image);
    sprite.anchor.set(0.5, IMAGE_HEX_CENTER_Y / IMAGE_H);
    sprite.scale.set((Math.sqrt(3) * hexSize) / IMAGE_HEX_W);
    sprite.position.set(0, 0);
    container.addChild(sprite);
  }
  // Generate at resolution 1: the renderer resolution is the devicePixelRatio,
  // and qualityFactor already bakes the zoom/dpr supersampling into hexSize.
  // Rendering at the device resolution here multiplies texture memory by dpr^2
  // (e.g. 9x on a dpr-3 phone) and blocks the main thread on every
  // generateTexture + mipmap pass, which hangs low-memory mobile GPUs.
  const texture = app.renderer.generateTexture({ target: container, resolution: 1 });
  container.destroy({ children: true });

  const imageScale = (Math.sqrt(3) * hexSize) / IMAGE_HEX_W;
  const imageTop = IMAGE_HEX_CENTER_Y * imageScale;
  const imageBottom = (IMAGE_H - IMAGE_HEX_CENTER_Y) * imageScale;
  const wallBase = opts.walls
    ? Math.max(hexSize * HEX_TILT + height, imageBottom)
    : Math.max(hexSize * HEX_TILT, imageBottom);
  const textureHeight = imageTop + wallBase;
  const anchor =
    opts.anchor === 'base' ? (imageTop + height) / textureHeight : imageTop / textureHeight;
  return { texture, anchorY: anchor };
}

function loadImageTexture(url: string): Promise<Texture | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        resolve(Texture.from(img));
      } catch {
        console.error('[loadImageTexture] Texture.from failed for', url);
        resolve(null);
      }
    };
    img.onerror = () => {
      console.error('[loadImageTexture] onerror for', url);
      resolve(null);
    };
    img.src = url;
  });
}

async function loadTileImages(): Promise<Map<string, Texture>> {
  const map = new Map<string, Texture>();
  const entries = Object.entries(TILE_IMAGE_FILES) as [string, string][];
  const urls = entries.map(([key, file]) => ({ key, url: TEXTURE_BASE + file }));
  const fogUrl = TEXTURE_BASE + FOG_IMAGE_FILE;
  const textures = await Promise.all([
    ...urls.map((u) => loadImageTexture(u.url)),
    loadImageTexture(fogUrl),
  ]);
  urls.forEach((u, i) => {
    if (textures[i]) map.set(u.key, textures[i]!);
  });
  if (textures[urls.length]) map.set('fog', textures[urls.length]!);
  return map;
}

function makeUnitImageTexture(
  app: Application,
  image: Texture | null,
  hexSize: number,
): TileTexture | null {
  if (!image) return null;
  const container = new Container();
  const sprite = new Sprite(image);
  sprite.anchor.set(0.5, IMAGE_HEX_CENTER_Y / IMAGE_H);
  sprite.scale.set((Math.sqrt(3) * hexSize) / IMAGE_HEX_W);
  container.addChild(sprite);
  const texture = app.renderer.generateTexture({ target: container, resolution: 1 });
  container.destroy({ children: true });
  return { texture, anchorY: IMAGE_HEX_CENTER_Y / IMAGE_H };
}

function makeUnitFallbackTexture(
  app: Application,
  color: number,
  type: UnitType,
  hexSize: number,
): TileTexture {
  const g = new Graphics();
  const r = hexSize * 0.18;
  const shape = UNIT_TYPES[type].shape;
  if (shape === 'circle') {
    g.circle(0, 0, r).fill(color).stroke({ width: 2, color: 0x000000 });
  } else if (shape === 'triangle') {
    g.poly([0, -r, r, r, -r, r]).fill(color).stroke({ width: 2, color: 0x000000 });
  } else if (shape === 'swordsman') {
    g.rect(-r * 0.5, -r * 0.6, r, r * 1.2).fill(color).stroke({ width: 2, color: 0x000000 });
  } else {
    g.rect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4).fill(color).stroke({ width: 2, color: 0x000000 });
  }
  const texture = app.renderer.generateTexture({ target: g, resolution: 1 });
  g.destroy();
  return { texture, anchorY: 1 };
}

function makeVillageTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  g.poly(hexagonPoints(hexSize * 0.45)).fill(color).stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g, resolution: 1 });
  g.destroy();
  return texture;
}

function makeBuildingTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  const s = hexSize * 0.12;
  const gap = hexSize * 0.04;
  g.rect(-s - gap / 2, -s / 2, s, s).fill(color).stroke({ width: 2, color: 0x000000 });
  g.rect(gap / 2, -s / 2, s, s).fill(color).stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g, resolution: 1 });
  g.destroy();
  return texture;
}

function makePortTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  const s = hexSize * 0.34;
  g.poly([-s, 0, 0, -s * 0.55, s, 0, 0, s * 0.55]).fill(color).stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g, resolution: 1 });
  g.destroy();
  return texture;
}

function makeShipTexture(app: Application, color: number, hexSize: number, level3: boolean): Texture {
  const g = new Graphics();
  const r = hexSize * 0.2;
  g.poly([0, r, r, -r, -r, -r]).fill(color).stroke({ width: 3, color: 0x000000 });
  if (level3) {
    g.rect(-r * 0.9, -r - 7, r * 1.8, 3).fill(0x000000);
  }
  const texture = app.renderer.generateTexture({ target: g, resolution: 1 });
  g.destroy();
  return texture;
}

function makePirateTexture(app: Application, hexSize: number): TileTexture {
  const g = new Graphics();
  const s = hexSize * 0.07;
  const gap = hexSize * 0.04;
  const row = -s - gap / 2;
  for (const dx of [row, row + s + gap]) {
    for (const dy of [row, row + s + gap]) {
      g.rect(dx, dy, s, s).fill(0x000000).stroke({ width: 1, color: 0xbbbbbb });
    }
  }
  const texture = app.renderer.generateTexture({ target: g, resolution: 1 });
  g.destroy();
  return { texture, anchorY: 0.5 };
}

export async function createTextures(app: Application, map: GameMap, hexSize = 40): Promise<TextureSet> {
  const images = await loadTileImages();
  const tileTextures = new Map<string, TileTexture>();
  const fogTextures = new Map<string, TileTexture>();
  const fogImage = images.get('fog') ?? null;
  const textureCache = new Map<string, TileTexture>();
  const getTileTexture = (
    layer: 'tile' | 'fog',
    terrain: TileType,
    heightPx: number,
    img: Texture | null,
    fill: number,
    anchor: 'base' | 'topface',
    sideColors?: { left: number; right: number },
  ): TileTexture => {
    const cacheKey = `${layer}|${terrain}|${heightPx}|${anchor}`;
    const cached = textureCache.get(cacheKey);
    if (cached) return cached;
    const tex = composeHexTexture(app, hexSize, heightPx, img, fill, {
      walls: anchor === 'base',
      anchor,
      sideColors,
    });
    textureCache.set(cacheKey, tex);
    return tex;
  };
  let maxHeightPx = 0;
  for (const tile of map.tiles) {
    maxHeightPx = Math.max(maxHeightPx, tileElevation(tile, hexSize));
  }
  for (const tile of map.tiles) {
    const fill = TILE_TYPE_COLORS[tile.terrain];
    const bottom = isWaterType(tile.terrain) ? shadeColor(fill, 0.7) : fill;
    const heightPx = tileElevation(tile, hexSize);
    const key = axialKey(tile);
    const img = images.get(String(tile.terrain)) ?? null;
    tileTextures.set(
      key,
      getTileTexture('tile', tile.terrain, heightPx, img, bottom, 'base'),
    );
    fogTextures.set(
      key,
      getTileTexture(
        'fog',
        tile.terrain,
        maxHeightPx,
        fogImage,
        0x7a7a7a,
        'base',
        { left: FOG_LEFT_WALL, right: FOG_RIGHT_WALL },
      ),
    );
  }
  const villageTexture1 =
    makeUnitImageTexture(app, await loadImageTexture(TEXTURE_BASE + VILLAGE_IMAGE_FILE), hexSize) ??
    { texture: makeVillageTexture(app, 0x9a9a9a, hexSize), anchorY: 1 };
  const villageTexture2 =
    makeUnitImageTexture(app, await loadImageTexture(TEXTURE_BASE + VILLAGE_LEVEL2_IMAGE_FILE), hexSize) ??
    { texture: makeVillageTexture(app, 0x6a6a6a, hexSize), anchorY: 1 };
  const villageTextures = { level1: villageTexture1, level2: villageTexture2 };
  const unitTextures = {} as Record<Tribe, Record<UnitType, TileTexture>>;
  for (const tribe of TRIBES) {
    const perTribe = {} as Record<UnitType, TileTexture>;
    for (const type of Object.keys(UNIT_TYPES) as UnitType[]) {
      if (type === 'pirate') continue;
      const img = await loadImageTexture(TEXTURE_BASE + UNIT_IMAGE_FILES[tribe.id][type]);
      const tex = makeUnitImageTexture(app, img, hexSize);
      perTribe[type] = tex ?? makeUnitFallbackTexture(app, tribe.color, type, hexSize);
    }
    unitTextures[tribe.id] = perTribe;
  }
  const shipTextures = {} as Record<Tribe, Record<1 | 2 | 3, TileTexture>>;
  for (const tribe of TRIBES) {
    const base = tribe.code;
    const shipNames = [`${base}-ship.png`, `${base}-ship-2.png`, `${base}-ship-3.png`];
    shipTextures[tribe.id] = {} as Record<1 | 2 | 3, TileTexture>;
    for (const level of [1, 2, 3] as const) {
      const img = await loadImageTexture(TEXTURE_BASE + shipNames[level - 1]);
      const tex = makeUnitImageTexture(app, img, hexSize);
      shipTextures[tribe.id][level] = tex ?? {
        texture: makeShipTexture(app, tribe.color, hexSize, level === 3),
        anchorY: 0.5,
      };
    }
  }
  const sawmillTexture =
    makeUnitImageTexture(app, await loadImageTexture(TEXTURE_BASE + SAWMILL_IMAGE_FILE), hexSize) ??
    { texture: makeBuildingTexture(app, 0x9aa3b5, hexSize), anchorY: 0.5 };
  const mineTexture =
    makeUnitImageTexture(app, await loadImageTexture(TEXTURE_BASE + MINE_IMAGE_FILE), hexSize) ??
    { texture: makeBuildingTexture(app, 0x7a5c3e, hexSize), anchorY: 0.5 };
  const bridgeTextures = {} as Record<BridgeDir, TileTexture>;
  for (const dir of Object.keys(BRIDGE_IMAGE_FILES) as BridgeDir[]) {
    const img = await loadImageTexture(TEXTURE_BASE + BRIDGE_IMAGE_FILES[dir]);
    bridgeTextures[dir] =
      makeUnitImageTexture(app, img, hexSize) ??
      { texture: makeBuildingTexture(app, 0x4a3620, hexSize), anchorY: 0.5 };
  }
  const portTextures = {} as Record<PortDirection, TileTexture>;
  for (const dir of Object.keys(PORT_IMAGE_FILES) as PortDirection[]) {
    const img = await loadImageTexture(TEXTURE_BASE + PORT_IMAGE_FILES[dir]);
    portTextures[dir] =
      makeUnitImageTexture(app, img, hexSize) ??
      { texture: makePortTexture(app, 0x9a9a9a, hexSize), anchorY: 0.5 };
  }
  const freePortTexture = makePortTexture(app, 0x9a9a9a, hexSize);
  const templeTextures = {} as Record<1 | 2 | 3 | 4, TileTexture>;
  for (const lvl of [1, 2, 3, 4] as const) {
    const img = await loadImageTexture(TEXTURE_BASE + TEMPLE_IMAGE_FILES[lvl]);
    templeTextures[lvl] =
      makeUnitImageTexture(app, img, hexSize) ??
      { texture: makeBuildingTexture(app, 0x3a6ea5, hexSize), anchorY: 0.5 };
  }
  const forestTempleTextures = {} as Record<1 | 2 | 3 | 4, TileTexture>;
  for (const lvl of [1, 2, 3, 4] as const) {
    const img = await loadImageTexture(TEXTURE_BASE + FOREST_TEMPLE_IMAGE_FILES[lvl]);
    forestTempleTextures[lvl] =
      makeUnitImageTexture(app, img, hexSize) ??
      { texture: makeBuildingTexture(app, 0x2e6b24, hexSize), anchorY: 0.5 };
  }
  const villageConnectedTexture = await loadImageTexture(TEXTURE_BASE + VILLAGE_CONNECTED_IMAGE_FILE);
  const captureTexture = await loadImageTexture(TEXTURE_BASE + CAPTURE_IMAGE_FILE);
  return {
    tileTextures,
    fogTextures,
    fogTopTexture: getTileTexture('fog', TileType.Water, 0, fogImage, 0x7a7a7a, 'topface'),
    villageTextures,
    freeVillageTexture:
      makeUnitImageTexture(app, await loadImageTexture(TEXTURE_BASE + 'village-empty.png'), hexSize) ??
      { texture: makeVillageTexture(app, 0x9a9a9a, hexSize), anchorY: 1 },
    bonusTexture:
      makeUnitImageTexture(app, await loadImageTexture(TEXTURE_BASE + 'bonus.png'), hexSize) ??
      { texture: makeVillageTexture(app, 0xffd700, hexSize), anchorY: 1 },
    unitTextures,
    pirateTexture:
      makeUnitImageTexture(app, await loadImageTexture(TEXTURE_BASE + PIRATE_IMAGE_FILE), hexSize) ??
      makePirateTexture(app, hexSize),
    sawmillTexture,
    mineTexture,
    bridgeTextures,
    portTextures,
    freePortTexture,
    templeTextures,
    forestTempleTextures,
    shipTextures,
    villageConnectedTexture,
    captureTexture,
  };
}
