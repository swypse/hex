import {
  Application, Container, Graphics, Sprite, Text, type TextStyleOptions, type Texture, type Ticker
} from 'pixi.js';
import { axialKey, compareTileY, hexCorners, hexEdge, hexEdgeNeighbor, hexToPixel, splitHexBorder } from '../game/hex';
import { GameMap, MapTile } from '../game/mapGen';
import { portDirection } from '../game/buildings';
import { Player } from '../game/players';
import { Selection } from '../game/selection';
import { TRIBES } from '../game/tribes';
import { UNIT_TYPES, PIRATE_COLOR, Unit } from '../game/units';
import { unitCanAct } from '../game/unitActions';
import { isExploredFor } from '../game/explore';
import { territoryColor } from '../game/discovery';
import { villageCapacity, unitsInVillage } from '../game/village';
import { isVillageRoadConnected } from '../game/roads';
import { SELECTION_COLOR } from '../config';
import { tileElevation } from './elevation';
import { type TextureSet, type TileTexture } from './textureFactory';
import { villageTextureFor } from './villageTexture';
import { tileSignature, tileInView, type Viewport } from './tileSignature';

export interface OverlayItem {
  el: Container;
  world: { x: number; y: number };
}

const FIRE_PARTICLE_COUNT = 12;
const FIRE_COLORS = [0xff5500, 0xff3300, 0xff2200, 0xff7700, 0xffaa00, 0xff8800];
const FIRE_SPREAD_X = 16;
const FIRE_RISE = 36;
export const FIRE_SIZE_MIN = 6;
export const FIRE_SIZE_MAX = 12;
const FIRE_BASE_Y = 6;
const SELECTED_BORDER_COLOR = 0xEB1F00;
const SELECTED_BORDER_ALPHA = 1;

interface FireParticle {
  g: Graphics;
  x: number;
  vy: number;
  size: number;
  color: number;
  life: number;
  rate: number;
}

interface FireEffect {
  el: Container;
  particles: FireParticle[];
}

interface TileView {
  el: Container;
  terrainSprite: Sprite;
  fogSprite: Sprite;
  villageSprite: Sprite | null;
  buildingSprite: Sprite | null;
  bridgeSprite: Sprite | null;
  bonusSprite: Sprite | null;
  unitSprite: Sprite | null;
  territory: Graphics;
  roadGraphics: Graphics | null;
  signature: string;
}

export class MapView {
  readonly container: Container;
  readonly overlay: Container;
  readonly overlayItems: OverlayItem[] = [];
  private map: GameMap | null = null;
  private tileIndex = new Map<string, MapTile>();
  private knownOwners = new Set<number>();
  private tileViews = new Map<string, TileView>();
  private exclamationBobs: Container[] = [];
  private exclamationAnimRemove: (() => void) | null = null;
  private bonusBobs: { sprite: Sprite; baseY: number }[] = [];
  private bonusAnimRemove: (() => void) | null = null;
  private fireEffects: FireEffect[] = [];
  private fireAnimRemove: (() => void) | null = null;
  private stopSelectedBorder: (() => void) | null = null;
  private stopTutorialMarkers: (() => void) | null = null;
  private tutorialMarkerParts: { g: Graphics; points: { x: number; y: number }[] }[] = [];
  private bounceRemove: (() => void) | null = null;
  private bounceSprite: Sprite | null = null;
  private bounceBaseY = 0;
  private hexBounceRemove: (() => void) | null = null;
  private hexBounceSprite: Sprite | null = null;
  private hexBounceBaseY = 0;
  private lastBouncedKey = '';
  private highlights: Graphics[] = [];
  private graphicsPool: Graphics[] = [];
  private textPool: Text[] = [];
  private hpOverrides = new Map<string, number>();
  private unitOverrides: Map<string, Unit | null> = new Map();
  private shipBobs: { sprite: Sprite; key: string; baseY: number }[] = [];
  private shipBobRemove: (() => void) | null = null;
  private shipBusy = new Set<string>();
  private unitFacings = new Map<string, 'left' | 'right'>();

  constructor(
    private readonly app: Application,
    private readonly textures: TextureSet,
    private readonly hexSize: number,
    private readonly spriteScale: number,
    private readonly textResolution: number,
  ) {
    this.container = new Container();
    this.container.sortableChildren = true;
    this.overlay = new Container();
  }

  destroy(): void {
    this.clearFireEffects();
    this.stopShipBob();
    this.unitFacings.clear();
    if (this.exclamationAnimRemove) {
      this.exclamationAnimRemove();
      this.exclamationAnimRemove = null;
    }
    if (this.bonusAnimRemove) {
      this.bonusAnimRemove();
      this.bonusAnimRemove = null;
    }
    if (this.stopSelectedBorder) {
      this.stopSelectedBorder();
      this.stopSelectedBorder = null;
    }
    if (this.stopTutorialMarkers) {
      this.stopTutorialMarkers();
      this.stopTutorialMarkers = null;
    }
    this.tutorialMarkerParts = [];
    this.stopBounce();
    this.stopHexBounce();
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
    hiddenUnitIds: Set<string>,
    viewport: Viewport,
    tutorialMarkerKeys: Set<string> = new Set<string>(),
  ): void {
    if (this.tileViews.size === 0) this.buildTiles(map);
    this.map = map;
    if (this.unitOverrides.size > 0) {
      const tiles = map.tiles.map((t) => {
        if (!this.unitOverrides.has(axialKey(t))) return t;
        const u = this.unitOverrides.get(axialKey(t)) ?? null;
        if (!u) return { ...t, unit: null };
        return { ...t, unit: { ...u, q: t.q, r: t.r } };
      });
      map = { ...map, tiles };
    }
    this.tileIndex = new Map(map.tiles.map((t) => [axialKey(t), t]));
    const local = players[localPlayerIndex];
    const known = new Set<number>(local ? [local.tribe, ...(local.knownTribes ?? [])] : []);
    this.knownOwners = new Set(players.filter((p) => known.has(p.tribe)).map((p) => p.index));
    const reachableColor = local ? (TRIBES.find((t) => t.id === local.tribe)?.color ?? SELECTION_COLOR) : SELECTION_COLOR;
    this.clearFireEffects();
    this.releaseOverlay();
    this.clearHighlights();
    this.exclamationBobs = [];
    this.bonusBobs = [];
    const hpBars: { unit: Unit; position: { x: number; y: number }; canAct: boolean; color: number; hp: number }[] = [];
    const labels: { tile: MapTile; owner: number; el: Container; world: { x: number; y: number } }[] = [];
    const exclamations: { el: Container; world: { x: number; y: number } }[] = [];
    const shipBobs: { sprite: Sprite; key: string; baseY: number }[] = [];

    for (const tile of map.tiles) {
      const tv = this.tileViews.get(axialKey(tile))!;
      tv.el.visible = tileInView(tile, this.hexSize, viewport);
      const sig = tileSignature(tile, map, localPlayerIndex, hiddenUnitIds, this.knownOwners, this.tileIndex);
      if (sig !== tv.signature) {
        tv.signature = sig;
        this.applyTile(tv, tile, players, localPlayerIndex, hiddenUnitIds);
      }
      const p = hexToPixel(tile, this.hexSize);
      const y = p.y - tileElevation(tile, this.hexSize);
      const explored = isExploredFor(tile, localPlayerIndex);

      if (tile.bonus && explored && tv.bonusSprite) {
        this.bonusBobs.push({ sprite: tv.bonusSprite, baseY: y });
      }

      if (tile.unit && !hiddenUnitIds.has(tile.unit.id) && explored) {
        const unit = tile.unit;
        const color = unit.type === 'pirate'
          ? PIRATE_COLOR
          : TRIBES.find((t) => t.id === players[unit.owner]!.tribe)!.color;
        const center = this.unitTextureTop(unit, players);
        hpBars.push({
          unit,
          position: { x: p.x, y: y - center + 40 },
          canAct: unit.type === 'pirate' ? false : unitCanAct(map, tile, unit, players[unit.owner]!),
          color,
          hp: this.hpOverrides.get(unit.id) ?? unit.hp,
        });
        if (unit.type === 'pirate' || unit.shipLevel !== undefined) {
          const sprite = tv.unitSprite;
          if (sprite) shipBobs.push({ sprite, key: axialKey(tile), baseY: y });
        }
      }
      if (tile.settlement && tile.settlement.owner !== null && explored) {
        labels.push({
          tile,
          owner: tile.settlement.owner,
          el: new Container(),
          world: { x: p.x, y: y + this.hexSize * 0.35 }
        });
      }
      if (tile.settlement && tile.settlement.captureReady && tile.unit && tile.unit.owner !== tile.settlement.owner && explored) {
        const el = new Container();
        const bob = new Container();
        const tex = this.textures.captureTexture;
        let spriteH = 0;
        if (tex) {
          const sprite = new Sprite(tex);
          const size = this.hexSize * 1.05;
          sprite.anchor.set(0.5, 0.5);
          sprite.width = size;
          sprite.height = size * (tex.height / tex.width);
          spriteH = sprite.height;
          bob.addChild(sprite);
        }
        el.addChild(bob);
        this.exclamationBobs.push(bob);
        // Sit right on top of the unit's hp bar (anchored at y - top + 40) with
        // a 4px gap; the bar's top edge is 11px above its own anchor.
        const hpBarY = y - this.unitTextureTop(tile.unit, players) + 40;
        exclamations.push({ el, world: { x: p.x, y: hpBarY - (11 + 4 + spriteH / 2) / viewport.scale } });
      }
      if (
        tile.settlement &&
        tile.settlement.owner !== null &&
        tile.unit &&
        tile.unit.owner >= 0 &&
        tile.unit.owner !== tile.settlement.owner &&
        explored
      ) {
        this.addFireEffect(p.x, y);
      }
    }

    for (const l of labels) this.addVillageLabel(l.tile, l.owner, l.el, l.world, players);
    // HP bars come after village labels so a unit's bar + text always render on
    // top of a village name label on the same tile.
    for (const hp of hpBars) this.addHpBar(hp.unit, hp.position, hp.canAct, hp.color, localPlayerIndex, hp.hp);
    // Capture markers come last so the icon renders above the unit's hp bar and
    // its hp text.
    for (const ex of exclamations) {
      ex.el.position.set(0, 0);
      this.overlay.addChild(ex.el);
      this.overlayItems.push({ el: ex.el, world: ex.world });
    }
    this.drawHighlights(map, selection, reachableKeys, attackableKeys, reachableColor, tutorialMarkerKeys);
    this.shipBobs = shipBobs;
    this.startShipBob();
    this.startExclamationAnimation();
    this.startBonusAnimation();
    this.startFireAnimation();
    this.updateSelectedBounce(selection);
  }

  setViewport(viewport: Viewport): void {
    if (!this.map) return;
    for (const tile of this.map.tiles) {
      const tv = this.tileViews.get(axialKey(tile));
      if (tv) tv.el.visible = tileInView(tile, this.hexSize, viewport);
    }
  }

  private buildTiles(map: GameMap): void {
    const sorted = [...map.tiles].sort((a, b) => compareTileY(a, b, this.hexSize));
    for (const tile of sorted) {
      const p = hexToPixel(tile, this.hexSize);
      const el = new Container();

      const terrainTex = this.textures.tileTextures.get(axialKey(tile))!;
      const terrainSprite = new Sprite(terrainTex.texture);
      terrainSprite.anchor.set(0.5, terrainTex.anchorY);
      terrainSprite.scale.set(this.spriteScale);
      terrainSprite.position.set(p.x, p.y);
      terrainSprite.zIndex = 0;
      el.addChild(terrainSprite);

      const fogTex = this.textures.fogTextures.get(axialKey(tile))!;
      const fogSprite = new Sprite(fogTex.texture);
      fogSprite.anchor.set(0.5, fogTex.anchorY);
      fogSprite.scale.set(this.spriteScale);
      fogSprite.visible = false;
      fogSprite.position.set(p.x, p.y);
      fogSprite.zIndex = 1;
      el.addChild(fogSprite);

      const territory = new Graphics();
      territory.zIndex = 2;
      el.addChild(territory);

      el.sortableChildren = true;

      this.tileViews.set(axialKey(tile), {
        el,
        terrainSprite,
        fogSprite,
        villageSprite: null,
        buildingSprite: null,
        bridgeSprite: null,
        bonusSprite: null,
        unitSprite: null,
        territory,
        roadGraphics: null,
        signature: '',
      });
      this.container.addChild(el);
    }
  }

  private applyTile(tv: TileView, tile: MapTile, players: Player[], localPlayerIndex: number, hiddenUnitIds: Set<string>): void {
    const explored = isExploredFor(tile, localPlayerIndex);
    const p = hexToPixel(tile, this.hexSize);
    const y = p.y - tileElevation(tile, this.hexSize);

    tv.terrainSprite.visible = explored;
    tv.fogSprite.visible = !explored;

    const village = villageTextureFor(tile.settlement, this.textures);
    this.syncSprite(tv, 'villageSprite', village.texture, p.x, y, village.anchorY);
    if (tv.villageSprite) tv.villageSprite.visible = explored;

    const buildingIsPort = tile.building !== null && tile.building.kind === 'port';
    const buildingIsSawmill = tile.building !== null && tile.building.kind === 'sawmill';
    const buildingIsTemple = tile.building !== null && (tile.building.kind === 'temple' || tile.building.kind === 'forestTemple');
    const buildingTileTex = buildingIsSawmill
      ? this.textures.sawmillTexture
      : buildingIsTemple
        ? tile.building!.kind === 'forestTemple'
          ? this.textures.forestTempleTextures[tile.building!.level as 1 | 2 | 3 | 4]
          : this.textures.templeTextures[tile.building!.level as 1 | 2 | 3 | 4]
        : tile.building !== null && !buildingIsPort
          ? this.textures.mineTexture
          : null;
    const portTex = buildingIsPort ? this.portTileTexture(tile) : null;
    this.syncSprite(tv, 'buildingSprite', tile.building
      ? buildingIsPort
        ? portTex!.texture
        : buildingTileTex!.texture
      : null, p.x, y, buildingIsPort ? portTex!.anchorY : buildingTileTex?.anchorY ?? 0.5);
    if (tv.buildingSprite) tv.buildingSprite.visible = explored;

    const bridgeTex = tile.bridge ? this.textures.bridgeTextures[tile.bridge.dir] : null;
    this.syncSprite(tv, 'bridgeSprite', bridgeTex ? bridgeTex.texture : null, p.x, y, bridgeTex?.anchorY ?? 0.5);
    if (tv.bridgeSprite) tv.bridgeSprite.visible = explored;

    this.drawTileTerritory(tv.territory, tile, players, explored);
    tv.territory.visible = explored;

    this.drawRoad(tv, tile);

    const bonusTex = tile.bonus ? this.textures.bonusTexture : null;
    this.syncSprite(tv, 'bonusSprite', bonusTex ? bonusTex.texture : null, p.x, y, bonusTex?.anchorY ?? 0.5);
    if (tv.bonusSprite) tv.bonusSprite.visible = explored;

    const isShipUnit = tile.unit !== null && tile.unit.shipLevel !== undefined;
    const isPirateUnit = tile.unit !== null && tile.unit.type === 'pirate';
    const tribe = tile.unit ? players[tile.unit.owner]?.tribe : undefined;
    const unitTex = tile.unit
      ? isPirateUnit
        ? this.textures.pirateTexture
        : isShipUnit
          ? (this.textures.shipTextures[tribe!]?.[tile.unit.shipLevel ?? 1] ?? null)
          : (this.textures.unitTextures[tribe!]?.[tile.unit.type] ?? null)
      : null;
    const unitTexture = unitTex?.texture ?? null;
    const unitAnchorY = unitTex?.anchorY ?? 0.5;
    this.syncSprite(tv, 'unitSprite', unitTexture, p.x, y, unitAnchorY);
    if (tv.unitSprite) {
      tv.unitSprite.visible = explored && !(tile.unit && hiddenUnitIds.has(tile.unit.id));
      if (tile.unit) {
        this.faceUnitSprite(tv.unitSprite, this.unitFacings.get(tile.unit.id) ?? 'right');
      }
    }
  }

  /** Sets a unit's horizontal facing so its sprite looks toward its last
   * attacked enemy: flipped (left) or default (right). */
  private faceUnitSprite(sprite: Sprite, facing: 'left' | 'right'): void {
    sprite.scale.set(this.spriteScale * (facing === 'left' ? -1 : 1), this.spriteScale);
  }

  setUnitFacing(unitId: string, facing: 'left' | 'right'): void {
    this.unitFacings.set(unitId, facing);
    if (!this.map) return;
    const tile = this.map.tiles.find((t) => t.unit?.id === unitId);
    if (!tile) return;
    const sprite = this.tileViews.get(axialKey(tile))?.unitSprite;
    if (sprite) this.faceUnitSprite(sprite, facing);
  }

  /** Flips the sprite currently drawn on a tile without changing the stored
   * facing (used to keep staged combat sprites oriented while they animate). */
  faceUnitAtKey(key: string, facing: 'left' | 'right'): void {
    const sprite = this.tileViews.get(key)?.unitSprite;
    if (sprite) this.faceUnitSprite(sprite, facing);
  }

  private drawRoad(tv: TileView, tile: MapTile): void {
    const owner = tile.roadOwner;
    if (owner === undefined || owner === null) {
      if (tv.roadGraphics) {
        tv.el.removeChild(tv.roadGraphics);
        tv.roadGraphics.destroy();
        tv.roadGraphics = null;
      }
      return;
    }
    if (!tv.roadGraphics) {
      tv.roadGraphics = new Graphics();
      tv.roadGraphics.zIndex = 6;
      tv.el.addChild(tv.roadGraphics);
    }
    const g = tv.roadGraphics;
    g.clear();
    const p = hexToPixel(tile, this.hexSize);
    const cy = p.y - tileElevation(tile, this.hexSize);
    for (let e = 0; e < 6; e++) {
      const n = this.tileIndex.get(axialKey(hexEdgeNeighbor(tile, e)));
      const connected =
        (n?.settlement && n.settlement.owner === owner) ||
        n?.roadOwner === owner ||
        (n?.building && n.building.kind === 'port' && n.ownedBy === owner);
      if (!connected) continue;
      const seg = hexEdge(tile, e, this.hexSize);
      const mx = (seg.ax + seg.bx) / 2;
      const my = (seg.ay + seg.by) / 2 - tileElevation(tile, this.hexSize);
      g.moveTo(mx, my).lineTo(p.x, cy).stroke({ width: 3, color: 0xff8c00 });
    }
  }

  private portTileTexture(tile: MapTile): TileTexture {
    if (tile.ownedBy === null) return { texture: this.textures.freePortTexture, anchorY: 0.5 };
    const dir = portDirection(this.map!, tile);
    return this.textures.portTextures[dir ?? 'e'];
  }

  private syncSprite(
    tv: TileView,
    kind: 'villageSprite' | 'buildingSprite' | 'bridgeSprite' | 'bonusSprite' | 'unitSprite',
    texture: Texture | null,
    x: number,
    y: number,
    anchorY = 0.5,
  ): void {
    const zIndex = kind === 'unitSprite' ? 7 : kind === 'buildingSprite' || kind === 'bridgeSprite' ? 5 : kind === 'bonusSprite' ? 8 : 3;
    const current = tv[kind];
    if (texture && !current) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, anchorY);
      sprite.scale.set(this.spriteScale);
      sprite.position.set(x, y);
      sprite.zIndex = zIndex;
      tv.el.addChild(sprite);
      tv[kind] = sprite;
    } else if (texture && current) {
      if (current.texture !== texture) {
        current.texture = texture;
        current.anchor.set(0.5, anchorY);
      }
      current.position.set(x, y);
    } else if (current) {
      tv.el.removeChild(current);
      current.destroy();
      tv[kind] = null;
    }
  }

  private drawTileTerritory(g: Graphics, tile: MapTile, players: Player[], explored: boolean): void {
    g.clear();
    if (!explored || tile.ownedBy === null) return;
    const owner = tile.ownedBy;
    const tribe = TRIBES.find((t) => t.id === players[owner]!.tribe)!;
    const p = hexToPixel(tile, this.hexSize);
    const elev = tileElevation(tile, this.hexSize);
    const cx = p.x;
    const cy = p.y - elev;
    const insetFor = (x: number): number => (Math.abs(x - cx) < 0.5 ? 6 : 8);
    for (let e = 0; e < 6; e++) {
      const neighbor = this.tileIndex.get(axialKey(hexEdgeNeighbor(tile, e)));
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
      g.poly([ax, ay, bx, by, bxIn, byIn, axIn, ayIn]).fill(territoryColor(tribe, this.knownOwners.has(owner)));
    }
  }

  private drawHighlights(
    map: GameMap,
    selection: Selection | null,
    reachableKeys: Set<string>,
    attackableKeys: Set<string>,
    reachableColor: number,
    tutorialMarkerKeys: Set<string> = new Set<string>(),
  ): void {
    this.tutorialMarkerParts = [];
    for (const tile of map.tiles) {
      if (!tutorialMarkerKeys.has(axialKey(tile))) continue;
      const corners = hexCorners(tile, this.hexSize).map((c) => ({
        x: c.x,
        y: c.y - tileElevation(tile, this.hexSize),
      }));
      const ring = this.takeGraphics();
      this.strokePolyline(ring, corners, 4, 0xffd700, 0.95);
      this.container.addChild(ring);
      this.highlights.push(ring);
      this.tutorialMarkerParts.push({ g: ring, points: corners });
    }
    this.startTutorialPulse();
    const selectedKey = selection ? axialKey(selection) : '';
    const dotRadius = this.hexSize * 0.16;
    for (const tile of map.tiles) {
      const key = axialKey(tile);
      const y = hexToPixel(tile, this.hexSize).y - tileElevation(tile, this.hexSize);
      if (reachableKeys.has(key) && key !== selectedKey) {
        const p = hexToPixel(tile, this.hexSize);
        const dot = this.takeGraphics();
        dot.circle(p.x, y, dotRadius).fill({ color: reachableColor, alpha: 0.5 }).stroke({
          width: 2,
          color: 0xffffff,
          alpha: 0.9
        });
        this.container.addChild(dot);
        this.highlights.push(dot);
        continue;
      }
      if (key === selectedKey && selection && selection.kind === 'unit' && tile.unit) {
        continue;
      }
      if (key !== selectedKey && !attackableKeys.has(key)) continue;
      const corners = hexCorners(tile, this.hexSize).map((c) => ({
        x: c.x,
        y: c.y - tileElevation(tile, this.hexSize)
      }));
      const isSelected = key === selectedKey;
      if (isSelected) {
        this.reorderSelectedTile(key);
        const split = splitHexBorder(corners);
        const topPart = this.takeGraphics();
        const bottomPart = this.takeGraphics();
        topPart.zIndex = 2;
        this.tileViews.get(key)!.el.addChild(topPart);
        this.strokePolyline(bottomPart, split.bottom, 4, SELECTED_BORDER_COLOR, SELECTED_BORDER_ALPHA);
        this.container.addChild(bottomPart);
        this.highlights.push(topPart, bottomPart);
        this.animateSelectedBorder([
          { g: topPart, points: split.top },
          { g: bottomPart, points: split.bottom },
        ]);
        continue;
      }
      // Attackable targets: a translucent red circle at the hex centre.
      const p = hexToPixel(tile, this.hexSize);
      const attackDot = this.takeGraphics();
      attackDot.circle(p.x, y, dotRadius).fill({ color: SELECTED_BORDER_COLOR, alpha: 0.7 });
      this.container.addChild(attackDot);
      this.highlights.push(attackDot);
    }
  }

  private strokePolyline(
    g: Graphics,
    points: { x: number; y: number }[],
    width: number,
    color: number,
    alpha = 1,
  ): void {
    g.clear();
    const first = points[0]!;
    g.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
    g.stroke({ width, color, alpha });
  }

  private reorderSelectedTile(key: string): void {
    const tv = this.tileViews.get(key);
    if (!tv) return;
    const el = tv.el;
    const siblings = this.container.children;
    const idx = siblings.indexOf(el);
    if (idx === -1) return;
    const y = (el.children[0] as Sprite).position.y;
    let insertAt = idx;
    while (insertAt + 1 < siblings.length) {
      const next = siblings[insertAt + 1] as Container;
      const nextY = (next.children[0] as Sprite).position.y;
      if (nextY > y) break;
      insertAt++;
    }
    if (insertAt === idx) return;
    this.container.removeChild(el);
    this.container.addChildAt(el, insertAt);
  }

  setHpOverride(unitId: string, hp: number | null): void {
    if (hp === null) this.hpOverrides.delete(unitId);
    else this.hpOverrides.set(unitId, hp);
  }

  clearHpOverrides(): void {
    this.hpOverrides.clear();
  }

  /** Temporarily render a different unit (or no unit) on specific tiles. Used
   * by the event presenter to stage pre-attack positions while combat animates;
   * the sim map itself is never mutated. Call with null/empty to stop staging. */
  setUnitOverrides(overrides: Map<string, Unit | null> | null): void {
    this.unitOverrides = overrides ? new Map(overrides) : new Map();
  }

  lungeUnit(fromKey: string, toKey: string, worldOffset: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.map) {
        resolve();
        return;
      }
      const sprite = this.tileViews.get(fromKey)?.unitSprite ?? null;
      if (!sprite || sprite.destroyed) {
        resolve();
        return;
      }
      const fromTile = this.tileIndex.get(fromKey);
      const toTile = this.tileIndex.get(toKey);
      if (!fromTile || !toTile) {
        resolve();
        return;
      }
      const a = hexToPixel(fromTile, this.hexSize);
      const b = hexToPixel(toTile, this.hexSize);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (dx / len) * worldOffset;
      const oy = (dy / len) * worldOffset;
      const baseX = sprite.position.x;
      const baseY = sprite.position.y;
      this.shipBusy.add(fromKey);
      this.shipBusy.add(toKey);
      const done = (): void => {
        this.shipBusy.delete(fromKey);
        this.shipBusy.delete(toKey);
        resolve();
      };
      const start = performance.now();
      const fn = (): void => {
        if (sprite.destroyed) {
          this.app.ticker.remove(fn);
          done();
          return;
        }
        const t = Math.min(1, (performance.now() - start) / 160);
        const k = Math.sin(t * Math.PI);
        sprite.position.set(baseX + ox * k, baseY + oy * k);
        if (t >= 1) {
          this.app.ticker.remove(fn);
          done();
        }
      };
      this.app.ticker.add(fn);
    });
  }

  slideUnit(fromKey: string, toKey: string, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const sprite = this.tileViews.get(fromKey)?.unitSprite ?? null;
      if (!sprite || sprite.destroyed) {
        resolve();
        return;
      }
      const fromTile = this.tileIndex.get(fromKey);
      const toTile = this.tileIndex.get(toKey);
      if (!fromTile || !toTile) {
        resolve();
        return;
      }
      const a = hexToPixel(fromTile, this.hexSize);
      const b = hexToPixel(toTile, this.hexSize);
      const toY = b.y - tileElevation(toTile, this.hexSize);
      const startX = sprite.position.x;
      const startY = sprite.position.y;
      this.shipBusy.add(fromKey);
      this.shipBusy.add(toKey);
      const done = (): void => {
        this.shipBusy.delete(fromKey);
        this.shipBusy.delete(toKey);
        resolve();
      };
      const start = performance.now();
      const fn = (): void => {
        if (sprite.destroyed) {
          this.app.ticker.remove(fn);
          done();
          return;
        }
        const t = Math.min(1, (performance.now() - start) / ms);
        sprite.position.set(startX + (b.x - startX) * t, startY + (toY - startY) * t);
        if (t >= 1) {
          this.app.ticker.remove(fn);
          done();
        }
      };
      this.app.ticker.add(fn);
    });
  }

  bounceUnit(q: number, r: number): void {
    this.stopBounce();
    if (!this.map) return;
    const tile = this.tileIndex.get(axialKey({ q, r }));
    if (!tile || !tile.unit) return;
    const sprite = this.tileViews.get(axialKey(tile))?.unitSprite ?? null;
    if (!sprite || sprite.destroyed) return;
    this.bounceSprite = sprite;
    this.bounceBaseY = sprite.position.y;
    const amp = this.hexSize * 0.15;
    const start = performance.now();
    const fn = (): void => {
      if (!this.bounceSprite || this.bounceSprite.destroyed) {
        this.stopBounce();
        return;
      }
      const t = Math.min(1, (performance.now() - start) / 300);
      this.bounceSprite.position.y = this.bounceBaseY - Math.sin(t * Math.PI) * amp;
      if (t >= 1) this.stopBounce();
    };
    this.app.ticker.add(fn);
    this.bounceRemove = () => this.app.ticker.remove(fn);
  }

  private stopBounce(): void {
    if (this.bounceRemove) {
      this.bounceRemove();
      this.bounceRemove = null;
    }
    this.bounceSprite = null;
  }

  private updateSelectedBounce(selection: Selection | null): void {
    if (!this.map) return;
    const key = selection ? axialKey(selection) : '';
    if (key === this.lastBouncedKey) return;
    this.lastBouncedKey = key;
    this.stopHexBounce();
    if (!key) return;
    const tv = this.tileViews.get(key);
    const sprite = tv?.terrainSprite ?? null;
    if (!sprite || sprite.destroyed) return;
    this.hexBounceSprite = sprite;
    this.hexBounceBaseY = sprite.position.y;
    const amp = this.hexSize * 0.2;
    const DURATION = 150;
    const start = performance.now();
    const fn = (): void => {
      if (!this.hexBounceSprite || this.hexBounceSprite.destroyed) {
        this.stopHexBounce();
        return;
      }
      const t = Math.min(1, (performance.now() - start) / DURATION);
      const p = t < 0.5 ? t * 2 : 2 - t * 2;
      this.hexBounceSprite.position.y = this.hexBounceBaseY - p * amp;
      if (t >= 1) this.stopHexBounce();
    };
    this.app.ticker.add(fn);
    this.hexBounceRemove = () => this.app.ticker.remove(fn);
  }

  private stopHexBounce(): void {
    if (this.hexBounceRemove) {
      this.hexBounceRemove();
      this.hexBounceRemove = null;
    }
    if (this.hexBounceSprite && !this.hexBounceSprite.destroyed) {
      this.hexBounceSprite.position.y = this.hexBounceBaseY;
    }
    this.hexBounceSprite = null;
  }

  private startTutorialPulse(): void {
    if (this.stopTutorialMarkers) {
      this.stopTutorialMarkers();
      this.stopTutorialMarkers = null;
    }
    const parts = this.tutorialMarkerParts;
    if (parts.length === 0) return;
    const draw = (width: number): void => {
      for (const p of parts) this.strokePolyline(p.g, p.points, width, 0xffd700, 0.95);
    };
    draw(4);
    const ticker = this.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (parts.length === 0) {
        ticker.remove(fn);
        this.stopTutorialMarkers = null;
        return;
      }
      const phase = ((performance.now() - start) % 900) / 900;
      draw(3 + 3 * Math.abs(Math.sin(phase * Math.PI * 2)));
    };
    ticker.add(fn);
    this.stopTutorialMarkers = () => ticker.remove(fn);
  }

  private animateSelectedBorder(parts: { g: Graphics; points: { x: number; y: number }[] }[]): void {
    if (this.stopSelectedBorder) {
      this.stopSelectedBorder();
      this.stopSelectedBorder = null;
    }
    const draw = (width: number): void => {
      for (const {
        g,
        points
      } of parts) this.strokePolyline(g, points, width, SELECTED_BORDER_COLOR, SELECTED_BORDER_ALPHA);
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

  private startBonusAnimation(): void {
    if (this.bonusAnimRemove) return;
    const ticker = this.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (this.bonusBobs.length === 0) {
        ticker.remove(fn);
        this.bonusAnimRemove = null;
        return;
      }
      const t = (performance.now() - start) / 500;
      const offset = Math.sin(t * Math.PI * 2) * 5;
      for (const b of this.bonusBobs) {
        b.sprite.position.y = b.baseY + offset;
      }
    };
    ticker.add(fn);
    this.bonusAnimRemove = () => ticker.remove(fn);
  }

  /** Permanent gentle up-down bob for player ship sprites. Skipped while a ship
   * is being slid or lunged by combat/movement animations. */
  private startShipBob(): void {
    if (this.shipBobRemove || this.shipBobs.length === 0) return;
    const ticker = this.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (this.shipBobs.length === 0) {
        ticker.remove(fn);
        this.shipBobRemove = null;
        return;
      }
      const phase = (performance.now() - start) / 2600;
      const offset = Math.sin(phase * Math.PI * 2) * 2.5;
      for (const b of this.shipBobs) {
        if (this.shipBusy.has(b.key) || b.sprite.destroyed) continue;
        b.sprite.position.y = b.baseY + offset;
      }
    };
    ticker.add(fn);
    this.shipBobRemove = () => ticker.remove(fn);
  }

  private stopShipBob(): void {
    if (this.shipBobRemove) {
      this.shipBobRemove();
      this.shipBobRemove = null;
    }
    this.shipBobs = [];
    this.shipBusy.clear();
  }

  spawnBonusClaim(x: number, y: number): void {
    this.addParticleBurst(x, y, 10, [0xc30505, 0xff6363]);
    this.startFireAnimation();
  }

  private addParticleBurst(x: number, y: number, count: number, colors: number[]): void {
    const el = new Container();
    const particles: FireParticle[] = [];
    for (let i = 0; i < count; i++) {
      const g = this.takeGraphics();
      const p: FireParticle = {
        g,
        x: (Math.random() - 0.5) * 2 * FIRE_SPREAD_X,
        vy: 24 + Math.random() * 24,
        size: FIRE_SIZE_MIN + Math.random() * (FIRE_SIZE_MAX - FIRE_SIZE_MIN),
        color: colors[i % colors.length]!,
        life: Math.random(),
        rate: 0.4 + Math.random() * 0.3,
      };
      el.addChild(g);
      particles.push(p);
      this.placeFireParticle(p);
    }
    this.fireEffects.push({ el, particles });
    this.overlay.addChild(el);
    this.overlayItems.push({ el, world: { x, y } });
  }

  private addFireEffect(x: number, y: number): void {
    this.addParticleBurst(x, y, FIRE_PARTICLE_COUNT, FIRE_COLORS);
  }

  private placeFireParticle(p: FireParticle): void {
    const t01 = p.life;
    const fadeIn = Math.min(1, t01 / 0.15);
    const fadeOut = t01 > 0.7 ? Math.max(0, (1 - t01) / 0.3) : 1;
    p.g.position.set(p.x + Math.sin(t01 * Math.PI * 3) * 3, FIRE_BASE_Y - t01 * FIRE_RISE);
    p.g.alpha = fadeIn * fadeOut;
    p.g.clear().rect(-p.size / 2, -p.size / 2, p.size, p.size).fill(p.color);
  }

  private clearFireEffects(): void {
    if (this.fireAnimRemove) {
      this.fireAnimRemove();
      this.fireAnimRemove = null;
    }
    this.fireEffects = [];
  }

  private startFireAnimation(): void {
    if (this.fireAnimRemove) return;
    const ticker = this.app.ticker;
    const fn = (t: Ticker): void => {
      if (this.fireEffects.length === 0) {
        ticker.remove(fn);
        this.fireAnimRemove = null;
        return;
      }
      const dt = Math.min(0.1, t.deltaMS / 1000);
      for (const fx of this.fireEffects) {
        for (const p of fx.particles) {
          p.life += p.rate * dt;
          if (p.life >= 1) {
            p.life = 0;
            p.x = (Math.random() - 0.5) * 2 * FIRE_SPREAD_X;
            p.vy = 24 + Math.random() * 24;
            p.size = FIRE_SIZE_MIN + Math.random() * (FIRE_SIZE_MAX - FIRE_SIZE_MIN);
            p.color = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)]!;
          }
          this.placeFireParticle(p);
        }
      }
    };
    ticker.add(fn);
    this.fireAnimRemove = () => ticker.remove(fn);
  }

  private takeGraphics(): Graphics {
    return this.graphicsPool.pop() ?? new Graphics();
  }

  private releaseGraphics(g: Graphics): void {
    g.clear();
    g.position.set(0, 0);
    g.scale.set(1, 1);
    g.alpha = 1;
    g.visible = true;
    g.zIndex = 0;
    this.graphicsPool.push(g);
  }

  private takeText(text: string, style: TextStyleOptions): Text {
    const t = this.textPool.pop() ?? new Text({ text: '', style, resolution: this.textResolution });
    t.text = text;
    t.style = style;
    return t;
  }

  private releaseText(t: Text): void {
    t.position.set(0, 0);
    t.scale.set(1, 1);
    t.alpha = 1;
    t.visible = true;
    t.zIndex = 0;
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
    if (this.stopSelectedBorder) {
      this.stopSelectedBorder();
      this.stopSelectedBorder = null;
    }
    if (this.stopTutorialMarkers) {
      this.stopTutorialMarkers();
      this.stopTutorialMarkers = null;
    }
    this.tutorialMarkerParts = [];
    for (const g of this.highlights) {
      g.parent?.removeChild(g);
      this.releaseGraphics(g);
    }
    this.highlights = [];
  }

  private unitTextureTop(unit: Unit, players: Player[]): number {
    if (unit.type === 'pirate') {
      const tex = this.textures.pirateTexture;
      return tex.anchorY * tex.texture.height * this.spriteScale;
    }
    const tribe = players[unit.owner]?.tribe;
    const tex =
      unit.shipLevel !== undefined && tribe !== undefined
        ? this.textures.shipTextures[tribe]?.[unit.shipLevel]
        : tribe !== undefined
          ? this.textures.unitTextures[tribe]?.[unit.type]
          : undefined;
    return tex ? tex.anchorY * tex.texture.height * this.spriteScale : this.hexSize * 0.5 * this.spriteScale;
  }

  private addHpBar(unit: Unit, position: {
    x: number;
    y: number
  }, canAct: boolean, tribeColor: number, localPlayerIndex: number, hp: number): void {
    const el = new Container();
    el.position.set(position.x, position.y);
    const barWidth = this.hexSize * 0.6;
    const barHeight = 5;
    const maxHp = UNIT_TYPES[unit.type].maxHp;
    const gap = 6;
    const up = -(gap + barHeight / 2);
    el.sortableChildren = true;

    const background = this.takeGraphics();
    background.zIndex = 0;
    background.rect(-barWidth / 2, -barHeight / 2 + up, barWidth, barHeight).fill(0xff0000);
    el.addChild(background);

    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    if (ratio > 0) {
      const fill = this.takeGraphics();
      fill.zIndex = 0;
      fill.rect(-barWidth / 2, -barHeight / 2 + up, barWidth * ratio, barHeight).fill(0x00ff00);
      el.addChild(fill);
    }

    const label = this.takeText(`${hp}/${maxHp}`, {
      fontSize: 13,
      fill: 0xffffff,
      fontFamily: 'Roboto, system-ui, sans-serif'
    });
    label.anchor.set(0.5, 1);
    label.position.set(0, -barHeight / 2 - 2 + up);
    label.zIndex = 1;

    const labelBg = this.takeGraphics();
    labelBg.zIndex = 0;
    const dim = unit.owner === localPlayerIndex && !canAct;
    labelBg
      .rect(label.x - label.width / 2 - 2, label.y - label.height, label.width + 4, label.height)
      .fill({ color: 0x000000, alpha: dim ? 0.3 : 1 });
    el.addChild(labelBg);
    el.addChild(label);

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
    const tribe = TRIBES.find((t) => t.id === players[owner]!.tribe)!;
    const connected = this.textures.villageConnectedTexture !== null && isVillageRoadConnected(map, tile);
    const icon = connected ? new Sprite(this.textures.villageConnectedTexture!) : null;
    const iconSize = 16;
    const gap = 4;
    const label = this.takeText(`${tile.settlement!.name ?? ''} ${count}/${capacity}`.trim(), {
      fontSize: 13,
      fill: 0xffffff,
      fontFamily: 'Roboto, system-ui, sans-serif'
    });
    label.anchor.set(0, 0.5);
    if (icon) {
      icon.anchor.set(0, 0.5);
      icon.width = iconSize;
      icon.height = iconSize;
    }
    const contentW = label.width + (icon ? iconSize + gap : 0);
    const x0 = -contentW / 2;
    if (icon) icon.position.set(x0, 0);
    label.position.set(x0 + (icon ? iconSize + gap : 0), 0);

    const labelBg = this.takeGraphics();
    labelBg.zIndex = 0;
    labelBg
      .rect(x0 - 2, -label.height / 2 - 1, contentW + 4, label.height + 2)
      .fill(territoryColor(tribe, this.knownOwners.has(owner)));

    label.zIndex = 1;
    if (icon) {
      icon.zIndex = 0;
      el.addChild(icon);
    }
    el.sortableChildren = true;
    el.addChild(labelBg);
    el.addChild(label);
    el.position.set(world.x, world.y);
    this.overlay.addChild(el);
    this.overlayItems.push({ el, world });
  }
}
