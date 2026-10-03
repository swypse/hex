import {
  Application, BlurFilter, ColorMatrixFilter, Container, FillGradient, Graphics, Rectangle, Sprite, Texture
} from 'pixi.js';
import { axialKey, HEX_TILT, hexNeighbors } from '../game/hex';
import { tileMapByKey, type BridgeDir, type GameMap, type MapTile } from '../game/map-gen';
import { isSolidGround, isWaterType, TileType, TILE_TYPE_COLORS } from '../game/tile-types';
import { TRIBES, Tribe } from '../game/tribes';
import { UnitType, UNIT_IMAGE_FILES, UNIT_TYPES } from '../game/units';
import { PortDirection } from '../game/buildings';
import { shadeColor } from '../util/color';
import { tileElevation } from './elevation';
import { ensureCanvasResource } from './image-texture';
import type { Season } from '../game/season';
import { countIceTiles } from '../game/ice';
import { ensureTerrainAtlas, terrainFrameTexture, terrainTileTexture, TERRAIN_TILE_FILES, TERRAIN_FOG_FILE } from './terrain-atlas';
import { buildingTileTexture, ensureBuildingsAtlas } from './buildings-atlas';
import { ensureTribeAtlas, tribeTileTexture } from './tribe-atlas';
import { ensureActionButtonAtlas, actionButtonFrameTexture } from '../ui/kit/action-button-icons';
import { ensureIcons32Atlas, icons32FrameTexture } from '../ui/kit/icons32';
import { VillageBuildTextureService } from './village-build-texture';

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
  [TileType.Ice]: { left: 0x8fb8d0, right: 0x6f93ad },
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

/** Granary tile art by adjacent farm count (1..6); 0 farms reuses the 1-farm art. */
export const GRANARY_MAX_FARMS = 6;
const granaryTileFile = (farms: number): string => (farms <= 1 ? 'granary' : `granary-${farms}`);

const IMAGE_HEX_W = 254;
const IMAGE_H = 448;
const IMAGE_HEX_CENTER_Y = 316;

export interface TileTexture {
  texture: Texture;
  anchorY: number;
}

export interface TextureSet {
  /** Season the terrain tile textures were baked for (spring when absent). */
  season?: Season;
  /** Number of ice tiles on the map when baked (0 when absent). */
  iceTiles?: number;
  /** Render textures baked for this set; freed by destroyTextureSet. */
  ownedTextures?: Texture[];
  tileTextures: Map<string, TileTexture>;
  fogTextures: Map<string, TileTexture>;
  fogTopTexture: TileTexture;
  freeVillageTexture: TileTexture;
  /** Lazily baked composite village textures, one service per composited
   *  tribe (currently villagers + warriors). */
  villageBuilds?: Partial<Record<Tribe, VillageBuildTextureService>>;
  bonusTexture: TileTexture;
  bottleTexture: TileTexture;
  unitTextures: Record<Tribe, Record<UnitType, TileTexture>>;
  pirateTexture: TileTexture;
  sawmillTexture: TileTexture;
  mineTexture: TileTexture;
  farmTexture: TileTexture;
  /** Black-and-white farm, shown while the farm yields nothing (winter). Baked so no per-frame filter pass is needed. */
  farmIdleTexture: TileTexture;
  /** Indexed by adjacent farm count, 1..GRANARY_MAX_FARMS (index 0 unused). */
  granaryTextures: TileTexture[];
  bridgeTextures: Record<BridgeDir, TileTexture>;
  portTextures: Record<PortDirection, TileTexture>;
  freePortTexture: Texture;
  templeTextures: Record<1 | 2 | 3 | 4, TileTexture>;
  forestTempleTextures: Record<1 | 2 | 3 | 4, TileTexture>;
  shipTextures: Record<Tribe, Record<1 | 2 | 3, TileTexture>>;
  /** White silhouette-following glow, keyed by the unit texture it decorates.
   *  Used as a steady selection highlight behind the selected unit's sprite. */
  glowFor: Map<Texture, TileTexture>;
  villageConnectedTexture: Texture | null;
  captureTexture: Texture | null;
  wallTexture: TileTexture | null;
  /** Thorn-trap tile (trap.png) from the buildings atlas. Optional: null until
   *  the tile is packed into the atlas, and the map then falls back to a plain
   *  red circle marker. */
  trapTexture?: TileTexture | null;
  /** arrow.png projectile texture used by the archer attack animation */
  arrowTexture: Texture | null;
  /** cannonball.png projectile texture used by ship attacks */
  cannonballTexture: Texture | null;
  /** attack-32 icon sliced from the icons-32 atlas (aura/rage hp-bar chip). */
  attackIconTexture: Texture | null;
  /** cannonbal-32 icon sliced from the icons-32 atlas (stun projectile). */
  cannonbalTexture: Texture | null;
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
const COAST_WATER_BRIGHTNESS = 1.5;

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
    if (nbr && isSolidGround(nbr.terrain)) return COAST_WATER_BRIGHTNESS;
  }
  return 1;
}

function composeHexTexture(
  app: Application,
  hexSize: number,
  height: number,
  image: Texture | null,
  fill: number,
  opts: {
    walls: boolean;
    anchor: 'base' | 'topface';
    sideColors?: { left: number; right: number };
    brightness?: number
  },
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
        const tex = Texture.from(img);
        ensureCanvasResource(tex);
        resolve(tex);
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

async function loadTileImages(season: Season): Promise<Map<string, Texture>> {
  await ensureTerrainAtlas();
  const map = new Map<string, Texture>();
  for (const [key, frameKey] of Object.entries(TERRAIN_TILE_FILES)) {
    const tex = terrainTileTexture(frameKey, season);
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

/** Baked-px padding around a glow texture so the blur (and its anchor math) is
 *  never clipped at the texture frame edge. */
const GLOW_PADDING = 4;
/** Baked-px blur radius of the unit selection glow. */
const GLOW_BLUR = 12;

/** Bakes a glow that hugs the non-empty pixels of a unit texture: the
 *  art is flattened to pure color, blurred outward by `GLOW_BLUR`, and baked
 *  with `GLOW_PADDING` spare room so nothing is clipped. The returned tile
 *  shares the base texture's footprint, re-anchored so both sprites align when
 *  placed at the unit's render position. */
/** Blank transparent tile used when a texture's source image is missing — no
 *  more hand-drawn geometry stand-ins. */
function blankTile(anchorY: number): TileTexture {
  return { texture: Texture.EMPTY, anchorY };
}

/** Bakes a black-and-white copy of a tile texture with identical footprint and anchor. */
function makeDesaturatedTexture(app: Application, base: TileTexture): TileTexture {
  if (base.texture === Texture.EMPTY) return base;
  const container = new Container();
  const sprite = new Sprite(base.texture);
  sprite.anchor.set(0.5, base.anchorY);
  const gray = new ColorMatrixFilter();
  gray.desaturate();
  sprite.filters = [gray];
  container.addChild(sprite);
  const W = base.texture.width;
  const H = base.texture.height;
  const frame = new Rectangle(-W / 2, -base.anchorY * H, W, H);
  const texture = app.renderer.generateTexture({ target: container, frame, resolution: 1 });
  container.destroy({ children: true });
  return { texture, anchorY: base.anchorY };
}

function makeUnitGlowTexture(app: Application, base: TileTexture): TileTexture {
  const W = base.texture.width;
  const H = base.texture.height;
  const pad = GLOW_PADDING;
  const container = new Container();
  const sprite = new Sprite(base.texture);
  sprite.anchor.set(0.5, base.anchorY);
  const blurColor = new ColorMatrixFilter();
  blurColor.matrix = [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1,
    0, 0, 0, 1, 0,
  ];
  const blur = new BlurFilter({ strength: GLOW_BLUR });
  sprite.filters = [blurColor, blur];
  container.addChild(sprite);
  // The frame is the sprite's own bounds plus padding; generateTexture sizes
  // its output from this instead of the (filter-unaware) local bounds.
  const frame = new Rectangle(-W / 2 - pad, -base.anchorY * H - pad, W + pad * 2, H + pad * 2);
  const texture = app.renderer.generateTexture({ target: container, frame, resolution: 1 });
  container.destroy({ children: true });
  const anchorY = (base.anchorY * H + pad) / (H + pad * 2);
  return { texture, anchorY };
}

export async function createTextures(
  app: Application,
  map: GameMap,
  hexSize = 40,
  /** Tribes present in this game. Only their atlases are loaded. */
  activeTribes: ReadonlySet<Tribe> = new Set(TRIBES.map((t) => t.id)),
  /** Season whose terrain tile variants are baked. */
  season: Season = 'spring',
): Promise<TextureSet> {
  // Every texture baked with generateTexture lives on the GPU until destroyed;
  // collect them so destroyTextureSet can free them when the set is replaced.
  const owned: Texture[] = [];
  const bakeApp = {
    renderer: {
      generateTexture: (opts: Parameters<Application['renderer']['generateTexture']>[0]): Texture => {
        const tex = app.renderer.generateTexture(opts);
        owned.push(tex);
        return tex;
      },
    },
  } as unknown as Application;
  const images = await loadTileImages(season);
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
    const tex = composeHexTexture(bakeApp, hexSize, heightPx, img, fill, {
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
  const tileByKey = tileMapByKey(map);
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
  const unitTextures = {} as Record<Tribe, Record<UnitType, TileTexture>>;
  const glowFor = new Map<Texture, TileTexture>();
  for (const tribe of TRIBES) {
    if (!activeTribes.has(tribe.id)) continue;
    await ensureTribeAtlas(tribe.code);
    const perTribe = {} as Record<UnitType, TileTexture>;
    for (const type of Object.keys(UNIT_TYPES) as UnitType[]) {
      if (type === 'pirate') continue;
      const frameKey = UNIT_IMAGE_FILES[tribe.id][type].replace(/\.png$/, '');
      const img = tribeTileTexture(tribe.code, frameKey);
      perTribe[type] = makeUnitImageTexture(bakeApp, img, hexSize) ?? blankTile(1);
      glowFor.set(perTribe[type].texture, makeUnitGlowTexture(bakeApp, perTribe[type]));
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
      shipTextures[tribe.id][level] = makeUnitImageTexture(bakeApp, img, hexSize) ?? blankTile(0.5);
      glowFor.set(shipTextures[tribe.id][level].texture, makeUnitGlowTexture(bakeApp, shipTextures[tribe.id][level]));
    }
  }
  const sawmillTexture =
    makeUnitImageTexture(bakeApp, buildingTileTexture('sawmill'), hexSize) ?? blankTile(0.5);
  const mineTexture =
    makeUnitImageTexture(bakeApp, buildingTileTexture('mine'), hexSize) ?? blankTile(0.5);
  const farmTexture =
    makeUnitImageTexture(bakeApp, buildingTileTexture('farm'), hexSize) ?? blankTile(0.5);
  const farmIdleTexture = makeDesaturatedTexture(bakeApp, farmTexture);
  const granaryTextures: TileTexture[] = [];
  for (let n = 0; n <= GRANARY_MAX_FARMS; n++) {
    granaryTextures[n] =
      makeUnitImageTexture(bakeApp, buildingTileTexture(granaryTileFile(n)), hexSize) ?? blankTile(0.5);
  }
  const bridgeTextures = {} as Record<BridgeDir, TileTexture>;
  for (const dir of Object.keys(BRIDGE_TILE_FILES) as BridgeDir[]) {
    const img = buildingTileTexture(BRIDGE_TILE_FILES[dir]);
    bridgeTextures[dir] =
      makeUnitImageTexture(bakeApp, img, hexSize) ?? blankTile(0.5);
  }
  const portTextures = {} as Record<PortDirection, TileTexture>;
  for (const dir of Object.keys(PORT_TILE_FILES) as PortDirection[]) {
    const img = buildingTileTexture(PORT_TILE_FILES[dir]);
    portTextures[dir] =
      makeUnitImageTexture(bakeApp, img, hexSize) ?? blankTile(0.5);
  }
  const freePortTexture = Texture.EMPTY;
  const templeTextures = {} as Record<1 | 2 | 3 | 4, TileTexture>;
  for (const lvl of [1, 2, 3, 4] as const) {
    const img = buildingTileTexture(TEMPLE_TILE_FILES[lvl]);
    templeTextures[lvl] =
      makeUnitImageTexture(bakeApp, img, hexSize) ?? blankTile(0.5);
  }
  const forestTempleTextures = {} as Record<1 | 2 | 3 | 4, TileTexture>;
  for (const lvl of [1, 2, 3, 4] as const) {
    const img = buildingTileTexture(FOREST_TEMPLE_TILE_FILES[lvl]);
    forestTempleTextures[lvl] =
      makeUnitImageTexture(bakeApp, img, hexSize) ?? blankTile(0.5);
  }
  await ensureIcons32Atlas();
  const villageConnectedTexture = icons32FrameTexture('village-connected-32');
  await ensureActionButtonAtlas();
  const captureTexture = actionButtonFrameTexture('action-capture-map');
  const arrowTexture = await loadImageTexture(TEXTURE_BASE + 'arrow.png');
  const cannonballTexture = await loadImageTexture(TEXTURE_BASE + 'cannonball.png');
  ensureIcons32Atlas();
  const cannonbalTexture = icons32FrameTexture('cannonbal-32');
  const attackIconTexture = icons32FrameTexture('attack-32');
  const wallImg = buildingTileTexture('wall');
  // Bake the wall at the same hex image-scale as villages/units so its on-map
  // footprint always matches the tile, regardless of the camera quality factor.
  const wallTexture = wallImg ? makeUnitImageTexture(bakeApp, wallImg, hexSize) : null;
  const trapImg = buildingTileTexture('trap');
  const trapTexture = trapImg ? makeUnitImageTexture(bakeApp, trapImg, hexSize) : null;
  const pirateTexture =
    makeUnitImageTexture(bakeApp, terrainFrameTexture('pirates-ship'), hexSize) ?? blankTile(0.5);
  glowFor.set(pirateTexture.texture, makeUnitGlowTexture(bakeApp, pirateTexture));
  const villageBuilds: Partial<Record<Tribe, VillageBuildTextureService>> = {};
  for (const [tribe, prefix] of [[Tribe.Cats, 'cats'], [Tribe.Villagers, 'villagers'], [Tribe.Warriors, 'warriors'], [Tribe.Aqua, 'aqua'], [Tribe.Forest, 'forest'], [Tribe.Sand, 'sand'], [Tribe.Barbarians, 'barbarians']] as const) {
    if (!activeTribes.has(tribe)) continue;
    const service = new VillageBuildTextureService(app, hexSize, prefix);
    villageBuilds[tribe] = service;
    await service.ensureLoaded();
  }
  return {
    season,
    iceTiles: countIceTiles(map),
    ownedTextures: owned,
    tileTextures,
    fogTextures,
    fogTopTexture: getTileTexture('fog', TileType.Water, 0, fogImage, 0x7a7a7a, 'topface'),
    villageBuilds,
    freeVillageTexture:
      makeUnitImageTexture(bakeApp, buildingTileTexture('village-empty'), hexSize) ?? blankTile(1),
    bonusTexture:
      makeUnitImageTexture(bakeApp, terrainFrameTexture('bonus'), hexSize) ?? blankTile(1),
    bottleTexture:
      makeUnitImageTexture(bakeApp, terrainFrameTexture('bottle-on-water'), hexSize) ?? blankTile(0.5),
    unitTextures,
    pirateTexture,
    sawmillTexture,
    mineTexture,
    farmTexture,
    farmIdleTexture,
    granaryTextures,
    bridgeTextures,
    portTextures,
    freePortTexture,
    templeTextures,
    forestTempleTextures,
    shipTextures,
    glowFor,
    villageConnectedTexture,
    captureTexture,
    wallTexture,
    trapTexture,
    arrowTexture,
    cannonballTexture,
    attackIconTexture,
    cannonbalTexture,
  };
}

/** Runs `fn`, dropping `console.warn` calls whose message contains `subset`.
 *
 *  Pixi's WebGPU batch bind groups cache each batched texture's *source*
 *  process-wide and never release it, so destroying any texture that has been
 *  rendered makes Pixi emit `[BindGroup] a 'textureSource' was destroyed while
 *  still bound to a shader…` from `BindGroup.onResourceChange`. That guard is
 *  benign (Pixi nulls the stale reference) and unavoidable from app code, so
 *  teardown silences it at the console boundary instead of leaking noise. */
export function suppressPixiWarnings(fn: () => void, subset: string): void {
  const original = console.warn;
  console.warn = (...args: unknown[]): void => {
    if (args.some((a) => typeof a === 'string' && a.includes(subset))) return;
    original(...args);
  };
  try {
    fn();
  } finally {
    console.warn = original;
  }
}

/** Releases the GPU/canvas memory of every texture baked by a TextureSet's
 *  village-build services (each village upgrade / owner switch creates new
 *  baked composites; the old ones must be destroyed once the set is discarded,
 *  e.g. on game teardown or re-bake after context loss). */
export function destroyTextureSet(textures: TextureSet, opts: { contextLost?: boolean } = {}): void {
  // After a GL context loss the baked textures' GPU data is already gone; the
  // JS objects are simply dropped instead of being destroyed through Pixi.
  if (!opts.contextLost) {
    suppressPixiWarnings(() => {
      for (const tex of textures.ownedTextures ?? []) {
        if (!tex.destroyed) tex.destroy(true);
      }
    }, 'was destroyed while still bound to a shader');
  }
  textures.ownedTextures = [];
  const builds = textures.villageBuilds;
  if (!builds) return;
  for (const service of Object.values(builds)) service?.destroy();
}
