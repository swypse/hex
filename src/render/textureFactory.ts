import { Application, ColorMatrixFilter, Container, FillGradient, Graphics, Sprite, Texture } from 'pixi.js';
import { axialKey, HEX_TILT, hexNeighbors } from '../game/hex';
import { GameMap, type BridgeDir, type MapTile } from '../game/mapGen';
import { isWaterType, TileType, TILE_TYPE_COLORS } from '../game/tileTypes';
import { TRIBES, Tribe } from '../game/tribes';
import { UnitType, UNIT_IMAGE_FILES, UNIT_TYPES } from '../game/units';
import { PortDirection } from '../game/buildings';
import { shadeColor } from '../util/color';
import { tileElevation } from './elevation';
import { ensureTerrainAtlas, terrainFrameTexture, TERRAIN_TILE_FILES, TERRAIN_FOG_FILE } from './terrainAtlas';
import { buildingTileTexture, ensureBuildingsAtlas } from './buildingsAtlas';
import { ensureTribeAtlas, tribeTileTexture } from './tribeAtlas';
import { ensureActionButtonAtlas, actionButtonFrameTexture } from '../ui/kit/actionButtonIcons';
import { ensureIcons32Atlas, icons32FrameTexture } from '../ui/kit/icons32';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

const FOG_LEFT_WALL = 0xd5bbdc;
const FOG_RIGHT_WALL = 0xc2a4ca;

/** Baked left/right vertical wall colours for each terrain group. */
const TERRAIN_SIDE_COLORS: Partial<Record<TileType, { left: number; right: number }>> = {
  [TileType.GrasslandLand]: { left: 0x7a952f, right: 0x4e640e },
  [TileType.GrasslandForest]: { left: 0x7a952f, right: 0x4e640e },
  [TileType.GrasslandMountain]: { left: 0x7a952f, right: 0x4e640e },
  [TileType.DesertLand]: { left: 0xb2a027, right: 0x978612 },
  [TileType.DesertForest]: { left: 0xb2a027, right: 0x978612 },
  [TileType.DesertMountain]: { left: 0xb2a027, right: 0x978612 },
  [TileType.TundraLand]: { left: 0x93508a, right: 0x671d76 },
  [TileType.TundraForest]: { left: 0x93508a, right: 0x671d76 },
  [TileType.TundraMountain]: { left: 0x93508a, right: 0x671d76 },
  [TileType.TaigaLand]: { left: 0x1d7777, right: 0x374e4e },
  [TileType.TaigaForest]: { left: 0x1d7777, right: 0x374e4e },
  [TileType.TaigaMountain]: { left: 0x1d7777, right: 0x374e4e },
  [TileType.RainforestLand]: { left: 0x859f1f, right: 0x1f3c08 },
  [TileType.RainforestForest]: { left: 0x859f1f, right: 0x1f3c08 },
  [TileType.RainforestMountain]: { left: 0x859f1f, right: 0x1f3c08 },
  [TileType.Water]: { left: 0x1f63a1, right: 0x174167 },
};

const BRIDGE_TILE_FILES: Record<BridgeDir, string> = {
  nw: 'bridge-nw',
  ne: 'bridge-ne',
  we: 'bridge-we',
};

const PORT_TILE_FILES: Record<PortDirection, string> = {
  nw: 'port-nw',
  ne: 'port-ne',
  sw: 'port-sw',
  se: 'port-se',
  e: 'port-e',
  w: 'port-w',
};

const TEMPLE_TILE_FILES: Record<1 | 2 | 3 | 4, string> = {
  1: 'water-temple-1',
  2: 'water-temple-2',
  3: 'water-temple-3',
  4: 'water-temple-4',
};

const FOREST_TEMPLE_TILE_FILES: Record<1 | 2 | 3 | 4, string> = {
  1: 'forest-temple-1',
  2: 'forest-temple-2',
  3: 'forest-temple-3',
  4: 'forest-temple-4',
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
  /** Owned village textures per tribe, resolved by the settlement owner's tribe. */
  villageTextures: Record<Tribe, { level1: TileTexture; level2: TileTexture }>;
  freeVillageTexture: TileTexture;
  bonusTexture: TileTexture;
  bottleTexture: TileTexture;
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
  wallTexture: TileTexture | null;
  /** arrow.png projectile texture used by the archer attack animation */
  arrowTexture: Texture | null;
  /** cannonball.png projectile texture used by ship attacks */
  cannonballTexture: Texture | null;
}

function hexagonPoints(size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(size * Math.cos(angle), size * Math.sin(angle) * HEX_TILT);
  }
  return points;
}

/** Brightness factor for coast-adjacent water tiles (subtle shallow tint). */
const COAST_WATER_BRIGHTNESS = 1.12;

/** Brightness factor for a tile's baked texture: coast water is lighter, every
 *  other tile keeps its natural colour (factor 1). `findNeighbor` resolves an
 *  axial coordinate to its tile, or `undefined` for off-map coords. */
export function coastWaterBrightness(
  tile: { terrain: TileType; q: number; r: number },
  findNeighbor: (q: number, r: number) => { terrain: TileType } | undefined,
): number {
  if (!isWaterType(tile.terrain)) return 1;
  for (const n of hexNeighbors(tile)) {
    const nbr = findNeighbor(n.q, n.r);
    if (nbr && !isWaterType(nbr.terrain)) return COAST_WATER_BRIGHTNESS;
  }
  return 1;
}

function composeHexTexture(
  app: Application,
  hexSize: number,
  height: number,
  image: Texture | null,
  fill: number,
  opts: { walls: boolean; anchor: 'base' | 'topface'; sideColors?: { left: number; right: number }; brightness?: number },
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
  if (opts.brightness && opts.brightness !== 1) {
    const filter = new ColorMatrixFilter();
    filter.brightness(opts.brightness, false);
    container.filters = [filter];
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
  await ensureTerrainAtlas();
  const map = new Map<string, Texture>();
  for (const [key, frameKey] of Object.entries(TERRAIN_TILE_FILES)) {
    const tex = terrainFrameTexture(frameKey);
    if (tex) map.set(key, tex);
  }
  const fog = terrainFrameTexture(TERRAIN_FOG_FILE);
  if (fog) map.set('fog', fog);
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

export async function createTextures(
  app: Application,
  map: GameMap,
  hexSize = 40,
  /** Tribes present in this game. Only their atlases are loaded. */
  activeTribes: ReadonlySet<Tribe> = new Set(TRIBES.map((t) => t.id)),
): Promise<TextureSet> {
  const images = await loadTileImages();
  await ensureBuildingsAtlas();
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
    opts?: {
      sideColors?: { left: number; right: number };
      brightness?: number;
    },
  ): TileTexture => {
    const brightness = opts?.brightness ?? 1;
    const cacheKey = `${layer}|${terrain}|${heightPx}|${anchor}|${brightness}`;
    const cached = textureCache.get(cacheKey);
    if (cached) return cached;
    const tex = composeHexTexture(app, hexSize, heightPx, img, fill, {
      walls: anchor === 'base',
      anchor,
      sideColors: opts?.sideColors,
      brightness,
    });
    textureCache.set(cacheKey, tex);
    return tex;
  };
  let maxHeightPx = 0;
  for (const tile of map.tiles) {
    maxHeightPx = Math.max(maxHeightPx, tileElevation(tile, hexSize));
  }
  const tileByKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
  const findNeighbor = (q: number, r: number): MapTile | undefined => tileByKey.get(axialKey({ q, r }));
  for (const tile of map.tiles) {
    const fill = TILE_TYPE_COLORS[tile.terrain];
    const bottom = isWaterType(tile.terrain) ? shadeColor(fill, 0.7) : fill;
    const heightPx = tileElevation(tile, hexSize);
    const key = axialKey(tile);
    const img = images.get(String(tile.terrain)) ?? null;
    const brightness = coastWaterBrightness(tile, findNeighbor);
    tileTextures.set(
      key,
      getTileTexture('tile', tile.terrain, heightPx, img, bottom, 'base', {
        sideColors: TERRAIN_SIDE_COLORS[tile.terrain],
        brightness,
      }),
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
        { sideColors: { left: FOG_LEFT_WALL, right: FOG_RIGHT_WALL } },
      ),
    );
  }
  const villageTextures = {} as Record<Tribe, { level1: TileTexture; level2: TileTexture }>;
  for (const tribe of TRIBES) {
    // Villages always use the tribe's own art from its atlas. Tribes outside
    // the current game never own villages (their atlas stays unloaded per the
    // active-tribes rule), so a tinted placeholder keeps the record total.
    if (!activeTribes.has(tribe.id)) {
      villageTextures[tribe.id] = {
        level1: { texture: makeVillageTexture(app, tribe.color, hexSize), anchorY: 1 },
        level2: { texture: makeVillageTexture(app, shadeColor(tribe.color, 0.6), hexSize), anchorY: 1 },
      };
      continue;
    }
    await ensureTribeAtlas(tribe.code);
    villageTextures[tribe.id] = {
      level1: makeUnitImageTexture(app, tribeTileTexture(tribe.code, `${tribe.code}-village`), hexSize) ??
        { texture: makeVillageTexture(app, tribe.color, hexSize), anchorY: 1 },
      level2: makeUnitImageTexture(app, tribeTileTexture(tribe.code, `${tribe.code}-village-2`), hexSize) ??
        { texture: makeVillageTexture(app, shadeColor(tribe.color, 0.6), hexSize), anchorY: 1 },
    };
  }
  const unitTextures = {} as Record<Tribe, Record<UnitType, TileTexture>>;
  for (const tribe of TRIBES) {
    if (!activeTribes.has(tribe.id)) continue;
    await ensureTribeAtlas(tribe.code);
    const perTribe = {} as Record<UnitType, TileTexture>;
    for (const type of Object.keys(UNIT_TYPES) as UnitType[]) {
      if (type === 'pirate') continue;
      const frameKey = UNIT_IMAGE_FILES[tribe.id][type].replace(/\.png$/, '');
      const img = tribeTileTexture(tribe.code, frameKey);
      perTribe[type] = makeUnitImageTexture(app, img, hexSize) ?? makeUnitFallbackTexture(app, tribe.color, type, hexSize);
    }
    unitTextures[tribe.id] = perTribe;
  }
  const shipTextures = {} as Record<Tribe, Record<1 | 2 | 3, TileTexture>>;
  for (const tribe of TRIBES) {
    if (!activeTribes.has(tribe.id)) continue;
    await ensureTribeAtlas(tribe.code);
    shipTextures[tribe.id] = {} as Record<1 | 2 | 3, TileTexture>;
    for (const level of [1, 2, 3] as const) {
      const suffix = level === 1 ? 'ship' : `ship-${level}`;
      const img = tribeTileTexture(tribe.code, `${tribe.code}-${suffix}`);
      shipTextures[tribe.id][level] = makeUnitImageTexture(app, img, hexSize) ?? {
        texture: makeShipTexture(app, tribe.color, hexSize, level === 3),
        anchorY: 0.5,
      };
    }
  }
  const sawmillTexture =
    makeUnitImageTexture(app, buildingTileTexture('sawmill'), hexSize) ??
    { texture: makeBuildingTexture(app, 0x9aa3b5, hexSize), anchorY: 0.5 };
  const mineTexture =
    makeUnitImageTexture(app, buildingTileTexture('mine'), hexSize) ??
    { texture: makeBuildingTexture(app, 0x7a5c3e, hexSize), anchorY: 0.5 };
  const bridgeTextures = {} as Record<BridgeDir, TileTexture>;
  for (const dir of Object.keys(BRIDGE_TILE_FILES) as BridgeDir[]) {
    const img = buildingTileTexture(BRIDGE_TILE_FILES[dir]);
    bridgeTextures[dir] =
      makeUnitImageTexture(app, img, hexSize) ??
      { texture: makeBuildingTexture(app, 0x4a3620, hexSize), anchorY: 0.5 };
  }
  const portTextures = {} as Record<PortDirection, TileTexture>;
  for (const dir of Object.keys(PORT_TILE_FILES) as PortDirection[]) {
    const img = buildingTileTexture(PORT_TILE_FILES[dir]);
    portTextures[dir] =
      makeUnitImageTexture(app, img, hexSize) ??
      { texture: makePortTexture(app, 0x9a9a9a, hexSize), anchorY: 0.5 };
  }
  const freePortTexture = makePortTexture(app, 0x9a9a9a, hexSize);
  const templeTextures = {} as Record<1 | 2 | 3 | 4, TileTexture>;
  for (const lvl of [1, 2, 3, 4] as const) {
    const img = buildingTileTexture(TEMPLE_TILE_FILES[lvl]);
    templeTextures[lvl] =
      makeUnitImageTexture(app, img, hexSize) ??
      { texture: makeBuildingTexture(app, 0x3a6ea5, hexSize), anchorY: 0.5 };
  }
  const forestTempleTextures = {} as Record<1 | 2 | 3 | 4, TileTexture>;
  for (const lvl of [1, 2, 3, 4] as const) {
    const img = buildingTileTexture(FOREST_TEMPLE_TILE_FILES[lvl]);
    forestTempleTextures[lvl] =
      makeUnitImageTexture(app, img, hexSize) ??
      { texture: makeBuildingTexture(app, 0x2e6b24, hexSize), anchorY: 0.5 };
  }
  await ensureIcons32Atlas();
  const villageConnectedTexture = icons32FrameTexture('village-connected-32');
  await ensureActionButtonAtlas();
  const captureTexture = actionButtonFrameTexture('action-capture-map');
  const arrowTexture = await loadImageTexture(TEXTURE_BASE + 'arrow.png');
  const cannonballTexture = await loadImageTexture(TEXTURE_BASE + 'cannonball.png');
  const wallImg = buildingTileTexture('wall');
  // Bake the wall at the same hex image-scale as villages/units so its on-map
  // footprint always matches the tile, regardless of the camera quality factor.
  const wallTexture = wallImg ? makeUnitImageTexture(app, wallImg, hexSize) : null;
  return {
    tileTextures,
    fogTextures,
    fogTopTexture: getTileTexture('fog', TileType.Water, 0, fogImage, 0x7a7a7a, 'topface'),
    villageTextures,
    freeVillageTexture:
      makeUnitImageTexture(app, buildingTileTexture('village-empty'), hexSize) ??
      { texture: makeVillageTexture(app, 0x9a9a9a, hexSize), anchorY: 1 },
    bonusTexture:
      makeUnitImageTexture(app, terrainFrameTexture('bonus'), hexSize) ??
      { texture: makeVillageTexture(app, 0xffd700, hexSize), anchorY: 1 },
    bottleTexture:
      makeUnitImageTexture(app, terrainFrameTexture('bottle-on-water'), hexSize) ??
      { texture: makeBuildingTexture(app, 0x7fd8f5, hexSize), anchorY: 0.5 },
    unitTextures,
    pirateTexture:
      makeUnitImageTexture(app, terrainFrameTexture('pirates-ship'), hexSize) ??
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
    wallTexture,
    arrowTexture,
    cannonballTexture,
  };
}
