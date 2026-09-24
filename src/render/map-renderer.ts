import {
  Application, BitmapText, Circle, Container, Graphics, ImageSource, Sprite, Texture, type TextStyleOptions, type Ticker
} from 'pixi.js';
import { FONT_REGULAR } from '../ui/kit/bitmap-fonts';
import {
  axialKey, compareTileY, hexCorners, hexDistance, hexEdge, hexEdgeNeighbor, hexToPixel, splitHexBorder
} from '../game/hex';
import { tileMapByKey, type GameMap, type MapTile } from '../game/map-gen';
import { bridgeCoastOffsets } from '../game/bridges';
import { portDirection, buildingHp, BUILDING_MAX_HP } from '../game/buildings';
import { Player } from '../game/players';
import { Selection } from '../game/selection';
import { TRIBES, tribeById } from '../game/tribes';
import { UNIT_TYPES, PIRATE_COLOR, Unit } from '../game/units';
import { unitCanAct } from '../game/unit-actions';
import { isExploredFor } from '../game/explore';
import { territoryColor } from '../game/discovery';
import { villageCapacity, unitsInVillage } from '../game/village';
import { isVillageRoadConnected } from '../game/roads';
import { waterRouteEdges, portWaterClusterJumps } from '../game/water-roads';
import { tileElevation } from './elevation';
import { DamageBadgeLayer } from './damage-badge';
import { FireEffects } from './fire';
import {
  captureMarkerPoints,
  CAPTURE_EDGE_MARKER_ALPHA,
  CAPTURE_EDGE_MARKER_SIZE,
  CAPTURE_EDGE_MARKER_SLIDE,
  CAPTURE_EDGE_PULSE_MS,
  type CaptureMarkerSide,
} from './capture-marker';
import { type TextureSet, type TileTexture } from './texture-factory';
import { villageTextureFor, villageOwnerTribe } from './village-texture';
import { acquireVillageBuildTexture, releaseVillageBuildTexture } from './village-build-texture';
import { tileSignature, tileInView, type Viewport } from './tile-signature';
import { t } from '../i18n';
import { Tooltip } from '../ui/kit/tooltip';
import { THEME } from '../ui/kit/theme';
import { icons32FrameTexture } from '../ui/kit/icons32';

/** Diameter of a pirate-deal dot (screen px; the row does not scale with zoom). */
const PIRATE_DEAL_DOT = 8;
/** Horizontal gap between pirate-deal dots (screen px). */
const PIRATE_DEAL_GAP = 4;
/** Screen-px gap between the pirate's hp bar anchor and the deal-dot row. */
const PIRATE_DEAL_HPBAR_GAP = 4;
/** World offset of the hp bar anchor above/relative to the tile's unit top. */
const HP_BAR_ANCHOR_OFFSET = 40;

export interface OverlayItem {
  el: Container;
  world: { x: number; y: number };
}

/** Permanent selected-hex border: black, 50% alpha, 6px, aligned outside. */
const SELECTED_BORDER_COLOR = 0x000000;
const SELECTED_BORDER_ALPHA = 0.5;
const SELECTED_BORDER_WIDTH = 6;
/** Vertical squash applied to move/attack marker circles so they sit flat on
 *  the ground plane like the hexes. */
const MARKER_Y_SCALE = 0.72;
/** `viewport.zoomOut` above which hp bars/text and village names are hidden. */
export const ZOOM_DETAIL_HIDE = 0.4;
/** Delay between consecutive reachable/attackable marker rings (ms). */
const MARKER_STAGGER_DELAY_MS = 80;
/** Duration of the marker fade-in once its delay elapses (ms). */
const MARKER_STAGGER_FADE_MS = 120;

interface TileView {
  el: Container;
  terrainSprite: Sprite;
  fogSprite: Sprite;
  villageSprite: Sprite | null;
  wallSprite: Sprite | null;
  buildingSprite: Sprite | null;
  bridgeSprite: Sprite | null;
  bonusSprite: Sprite | null;
  bottleSprite: Sprite | null;
  unitSprite: Sprite | null;
  /** White silhouette glow shown behind the unit sprite while it is selected. */
  glowSprite: Sprite | null;
  territory: Graphics;
  roadGraphics: Graphics | null;
  /** Interactive row of 8px tribe-colored dots, one per active pirate deal. */
  dealCircles: Container | null;
  signature: string;
}

export class MapView {
  readonly container: Container;
  readonly overlay: Container;
  /** World-space layer held above `overlay` where move/attack ground markers
   *  render, so they never sit under village labels, HP bars or buildings. */
  readonly markerLayer = new Container();
  /** World-space layer mounted above `markerLayer` for damage-preview badges,
   *  so they always draw over move/attack markers. */
  readonly badgeLayer = new Container();
  readonly overlayItems: OverlayItem[] = [];
  private map: GameMap | null = null;
  private tileIndex = new Map<string, MapTile>();
  private knownOwners = new Set<number>();
  private tileViews = new Map<string, TileView>();
  /** Adjacent own-water tile pairs (tileKey -> sorted neighbour keys) forming
   *  the port water routes, recomputed each update. */
  private waterRouteNeighbors = new Map<string, string[]>();
  /** Port keys reachable over own water (per cluster of two or more ports). */
  private waterJumps = new Map<string, Set<string>>();
  /** Tile whose `glowSprite` is currently visible (selection highlight). */
  private glowKey = '';
  /** Repeat-wrapped `dots-32` texture used for village-border tiles, tinted
   *  per tribe. Built lazily from the icons-32 atlas. */
  private dotsTileTexture: Texture | null = null;
  private exclamationBobs: Container[] = [];
  private exclamationAnimRemove: (() => void) | null = null;
  /** Fire particles over enemy-occupied villages (owned component). */
  readonly fireEffects: FireEffects;
  private stopTutorialMarkers: (() => void) | null = null;
  private tutorialMarkerParts: { g: Graphics; points: { x: number; y: number }[] }[] = [];
  private attackPulseParts: { g: Graphics; x: number; y: number; base: number }[] = [];
  private movePulseParts: { g: Graphics; x: number; y: number; base: number; color: number }[] = [];
  private bounceRemove: (() => void) | null = null;
  private bounceSprite: Sprite | null = null;
  private bounceBaseY = 0;
  private hexBounceRemove: (() => void) | null = null;
  private hexBounceSprites: { obj: Sprite | Graphics; baseY: number; delay: number }[] = [];
  /** The current selected-hex border parts (top in the tile el, bottom in the
   *  container); they bounce together with the hex on selection. */
  private selectedBorderParts: { g: Graphics; baseY: number }[] = [];
  private lastBouncedKey = '';
  private highlights: Graphics[] = [];
  private graphicsPool: Graphics[] = [];
  private textPool: BitmapText[] = [];
  private hpOverrides = new Map<string, number>();
  /** Height of the hp `hp/maxHp` label, measured when the first bar is drawn. */
  private hpLabelHeight = 0;
  private unitOverrides: Map<string, Unit | null> = new Map();
  private shipBobs: { sprite: Sprite; key: string; baseY: number }[] = [];
  private shipBobRemove: (() => void) | null = null;
  private shipBusy = new Set<string>();
  /** True while the camera is being moved (drag / zoom / pan); the decorative
   *  per-frame animations below freeze in place until it settles. */
  private cameraBusy = false;
  /** performance.now() when the busy pause began (0 while not busy). */
  private busyPauseStart = 0;
  /** Cumulative ms spent paused; subtracted from performance.now() so the
   *  decorative animations resume from exactly where they paused. */
  private pausedMs = 0;
  private unitFacings = new Map<string, 'left' | 'right'>();
  private dealTooltip: Tooltip | null = null;
  /** World anchor (hp bar point) + row width of each pirate-deal dot row. */
  private dealAnchors = new Map<string, { x: number; y: number; rowW: number }>();
  /** Expected-damage preview badges (owned component; renders over hp bars
   *  and village labels). */
  readonly damageBadges: DamageBadgeLayer;
  private viewport: Viewport | null = null;
  private lastLocalIndex = 0;
  /** Screen-space layer for edge capture markers. Kept out of `overlay` so a
   *  host can place it above every HUD element. */
  readonly edgeMarkers = new Container();
  private edgeMarkerParts: { g: Graphics; side: 'l' | 'r' | 't' | 'b'; along: number; W: number; H: number }[] = [];
  private stopEdgePulseFn: (() => void) | null = null;
  private edgePulseStart: number | null = null;

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
    this.overlay.sortableChildren = true;
    this.fireEffects = new FireEffects({
      app,
      overlay: this.overlay,
      overlayItems: this.overlayItems,
      takeGraphics: () => this.takeGraphics(),
    });
    this.damageBadges = new DamageBadgeLayer({
      app,
      overlay: this.overlay,
      hexSize,
      getMap: () => this.map,
      getTileIndex: () => this.tileIndex,
      getViewport: () => this.viewport,
      getHpLabelHeight: () => this.hpLabelHeight,
      unitTextureTop: (unit, players) => this.unitTextureTop(unit, players),
    });
  }

  /** Adds the edge-marker layer on top of everything (as the first child of
   *  `target`, so real overlays still render above it). */
  attachEdgeLayerTo(target: Container): void {
    this.edgeMarkers.removeFromParent();
    target.addChildAt(this.edgeMarkers, 0);
  }

  destroy(): void {
    this.clearFireEffects();
    this.stopShipBob();
    this.stopEdgePulse();
    this.unitFacings.clear();
    if (this.dealTooltip) {
      this.dealTooltip.destroy();
      this.dealTooltip = null;
    }
    if (this.exclamationAnimRemove) {
      this.exclamationAnimRemove();
      this.exclamationAnimRemove = null;
    }
    if (this.stopTutorialMarkers) {
      this.stopTutorialMarkers();
      this.stopTutorialMarkers = null;
    }
    this.tutorialMarkerParts = [];
    this.attackPulseParts = [];
    this.movePulseParts = [];
    this.stopMarkerRevealTick();
    this.markerRevealTimes.clear();
    this.markerRevealEls.clear();
    this.markerRevealSig = '';
    this.stopBounce();
    this.stopHexBounce();
    // Release every village build texture this view still references so the
    // service can destroy them once no tile holds them.
    for (const tv of this.tileViews.values()) {
      if (tv.villageSprite) releaseVillageBuildTexture(tv.villageSprite.texture);
    }
    this.container.destroy({ children: true });
    this.overlay.destroy({ children: true });
    this.markerLayer.destroy({ children: true });
    this.badgeLayer.destroy({ children: true });
    if (this.edgeMarkers.parent) this.edgeMarkers.parent.removeChild(this.edgeMarkers);
    this.edgeMarkers.destroy({ children: true });
    this.graphicsPool = [];
    this.textPool = [];
    this.tileViews.clear();
    this.dealAnchors.clear();
    this.overlayItems.length = 0;
    this.damageBadges.destroy();
    this.glowKey = '';
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
    localTurn = true,
    placementKeys?: Set<string>,
  ): void {
    if (this.tileViews.size === 0) this.buildTiles(map);
    this.map = map;
    this.viewport = viewport;
    this.lastLocalIndex = localPlayerIndex;
    if (this.unitOverrides.size > 0) {
      const tiles = map.tiles.map((t) => {
        if (!this.unitOverrides.has(axialKey(t))) return t;
        const u = this.unitOverrides.get(axialKey(t)) ?? null;
        if (!u) return { ...t, unit: null };
        return { ...t, unit: { ...u, q: t.q, r: t.r } };
      });
      map = { ...map, tiles };
    }
    this.tileIndex = tileMapByKey(map);
    this.waterRouteNeighbors = waterRouteEdges(map);
    this.waterJumps = portWaterClusterJumps(map);
    const local = players[localPlayerIndex];
    const known = new Set<number>(local ? [local.tribe, ...(local.knownTribes ?? [])] : []);
    this.knownOwners = new Set(players.filter((p) => known.has(p.tribe)).map((p) => p.index));
    // Capture edge markers only make sense on the acting player's own turn.
    this.edgeMarkers.visible = localTurn;
    const reachableColor = THEME.white;
    this.clearFireEffects();
    this.releaseOverlay();
    this.clearHighlights();
    this.exclamationBobs = [];
    // When zoomed out far enough the hp bars, hp text and village names are too
    // small to read; drop them to keep the map clean.
    const detailHidden = (viewport.zoomOut ?? 0) > ZOOM_DETAIL_HIDE;
    const hpBars: { unit: Unit; position: { x: number; y: number }; canAct: boolean; color: number; hp: number }[] = [];
    const buildingHpBars: { position: { x: number; y: number }; hp: number }[] = [];
    const labels: { tile: MapTile; owner: number; el: Container; world: { x: number; y: number } }[] = [];
    const exclamations: { el: Container; world: { x: number; y: number } }[] = [];
    const shipBobs: { sprite: Sprite; key: string; baseY: number }[] = [];

    for (const tile of map.tiles) {
      const tv = this.tileViews.get(axialKey(tile))!;
      tv.el.visible = tileInView(tile, this.hexSize, viewport);
      const sig = tileSignature(tile, map, localPlayerIndex, hiddenUnitIds, this.knownOwners, this.tileIndex, this.waterRouteNeighbors);
      if (sig !== tv.signature) {
        tv.signature = sig;
        this.applyTile(tv, tile, players, localPlayerIndex, hiddenUnitIds);
      }
      const p = hexToPixel(tile, this.hexSize);
      const y = p.y - tileElevation(tile, this.hexSize);
      const explored = isExploredFor(tile, localPlayerIndex);

      if (tile.unit && !hiddenUnitIds.has(tile.unit.id) && explored) {
        const unit = tile.unit;
        const color = unit.type === 'pirate'
          ? PIRATE_COLOR
          : tribeById(players[unit.owner]!.tribe)!.color;
        if (!detailHidden) {
          const center = this.unitTextureTop(unit, players);
          hpBars.push({
            unit,
            position: { x: p.x, y: y - center + 40 },
            canAct: unit.type === 'pirate' ? false : unitCanAct(map, tile, unit, players[unit.owner]!),
            color,
            hp: this.hpOverrides.get(unit.id) ?? unit.hp,
          });
        }
        if (unit.type === 'pirate' || unit.shipLevel !== undefined) {
          const sprite = tv.unitSprite;
          if (sprite) shipBobs.push({ sprite, key: axialKey(tile), baseY: y });
        }
      }
      // Damaged buildings (hp < max) show an hp bar + text like a unit's.
      const building = tile.building;
      if (building && explored && !detailHidden && buildingHp(building) < BUILDING_MAX_HP) {
        buildingHpBars.push({
          position: { x: p.x, y: y - this.hexSize * 0.6 },
          hp: buildingHp(building),
        });
      }
      if (tile.settlement && tile.settlement.owner !== null && explored && !detailHidden) {
        labels.push({
          tile,
          owner: tile.settlement.owner,
          el: new Container(),
          world: { x: p.x, y: y + this.hexSize * 0.35 + 15 }
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
    for (const hp of hpBars) this.addHpBar(hp.unit, hp.position, hp.canAct, hp.color, localPlayerIndex, hp.hp, localTurn);
    for (const b of buildingHpBars) this.addBuildingHpBar(b.position, b.hp);
    // Capture markers come last so the icon renders above the unit's hp bar and
    // its hp text.
    for (const ex of exclamations) {
      ex.el.position.set(0, 0);
      this.overlay.addChild(ex.el);
      this.overlayItems.push({ el: ex.el, world: ex.world });
    }
    this.drawHighlights(map, selection, reachableKeys, attackableKeys, reachableColor, localPlayerIndex, tutorialMarkerKeys, localTurn, placementKeys);
    this.shipBobs = shipBobs;
    this.startShipBob();
    this.startExclamationAnimation();
    this.startFireAnimation();
    this.updateSelectedBounce(selection);
    this.updateSelectedGlow(selection, hiddenUnitIds, localPlayerIndex, players);
    this.damageBadges.render(players, localPlayerIndex);
  }

  /** Arm an expected-damage preview from `attacker` (the local selected unit)
   *  against `target` (an enemy standing on a tile). The badges are rendered the
   *  next time `update` runs, so a caller usually arms then triggers a re-render.
   *  The counter-attack badge appears 100ms after the target badge.
   *  `onRender` is called after the delay to trigger the next render pass. */
  showDamagePreview(attacker: Unit, target: MapTile, onRender?: () => void): void {
    this.damageBadges.show(attacker, target, onRender);
  }

  /** Drop the expected-damage preview. Cleared again on the next update. */
  hideDamagePreview(): void {
    this.damageBadges.hide();
  }

  /** Update overlay badge positions to follow the camera. Called every frame
   *  from applyTransform so badges track world-anchored positions without
   *  being affected by zoom scaling. */
  syncBadgePositions(pan: { x: number; y: number }, scale: number): void {
    this.damageBadges.syncPositions(pan, scale);
  }

  /** Stagger reveal state for move/attack markers: tile key -> reveal start
   *  time (performance.now when the marker's distance ring is due to fade in). */
  private markerRevealTimes = new Map<string, number>();
  /** Anim-clock time before which newly-drawn move/attack markers stay hidden
   *  (set while a unit's move animation is running, so post-move markers wait
   *  for the mover to arrive before fading in). 0 = no deferral. */
  private markerDeferUntil = 0;
  /** Live marker graphics currently staged for a fade-in, keyed by tile key. */
  private markerRevealEls = new Map<string, Graphics>();
  private markerRevealRemove: (() => void) | null = null;
  /** Signature of the marker key set that the current reveal times belong to;
   *  when the selection changes we reset the stagger clock. */
  private markerRevealSig = '';

  /** Starts (or reuses) a ticker that fades in any marker whose reveal time
   *  has passed. Stops itself once no marker is still fading. */
  private ensureMarkerRevealTick(): void {
    if (this.markerRevealRemove) return;
    if (this.markerRevealEls.size === 0) return;
    const fn = (): void => {
      if (this.cameraBusy) return;
      const now = this.animNow();
      let allDone = true;
      for (const [key, g] of this.markerRevealEls) {
        if (g.destroyed) continue;
        const start = this.markerRevealTimes.get(key);
        if (start === undefined) continue;
        const t = (now - start) / MARKER_STAGGER_FADE_MS;
        g.alpha = Math.max(0, Math.min(1, t));
        if (t < 1) allDone = false;
      }
      if (allDone) this.stopMarkerRevealTick();
    };
    const remover = (): void => {
      this.app.ticker.remove(fn);
    };
    this.app.ticker.add(fn);
    this.markerRevealRemove = remover;
  }

  private stopMarkerRevealTick(): void {
    if (this.markerRevealRemove) {
      const fn = this.markerRevealRemove;
      this.markerRevealRemove = null;
      fn();
    }
  }

  /** Fades a marker in with a per-distance delay: the reveal for a tile at
   *  distance d from the selection starts at (d - 1) * MARKER_STAGGER_DELAY.
   *  While a move animation is running (`markerDeferUntil` in the future) the
   *  reveal additionally waits for it to finish. */
  private revealMarker(key: string, dist: number, g: Graphics): void {
    if (!this.markerRevealTimes.has(key)) {
      const base = Math.max(this.animNow(), this.markerDeferUntil) + (dist - 1) * MARKER_STAGGER_DELAY_MS;
      this.markerRevealTimes.set(key, base);
    }
    const start = this.markerRevealTimes.get(key)!;
    const t = (this.animNow() - start) / MARKER_STAGGER_FADE_MS;
    g.alpha = Math.max(0, Math.min(1, t));
    this.markerRevealEls.set(key, g);
  }

  /** Defer any marker revealed from now for `ms` (a unit move animation runs
   *  for that long), so attackable/reachable markers that only exist after the
   *  mover arrives wait for the animation to complete before fading in. */
  deferNewMarkers(ms: number): void {
    this.markerDeferUntil = Math.max(this.markerDeferUntil, this.animNow() + ms);
  }


  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
    if (!this.map) return;
    for (const key of this.dealAnchors.keys()) this.layoutDealCircles(key, viewport);
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
        wallSprite: null,
        buildingSprite: null,
        bridgeSprite: null,
        bonusSprite: null,
        bottleSprite: null,
        unitSprite: null,
        glowSprite: null,
        territory,
        roadGraphics: null,
        dealCircles: null,
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

    const prevVillageTexture = tv.villageSprite ? tv.villageSprite.texture : null;
    const village = villageTextureFor(
      tile.settlement,
      this.textures,
      villageOwnerTribe(tile.settlement, players),
      this.textures.villageBuilds,
    );
    this.syncSprite(tv, 'villageSprite', village.texture, p.x, y - 2, village.anchorY);
    // The previous baked composite texture is no longer used by this tile;
    // acquire the new one before releasing the old so a texture that serves
    // several tiles stays alive until the last one lets it go.
    if (village.texture && village.texture !== prevVillageTexture) acquireVillageBuildTexture(village.texture);
    if (prevVillageTexture && prevVillageTexture !== village.texture) releaseVillageBuildTexture(prevVillageTexture);
    if (tv.villageSprite) tv.villageSprite.visible = explored;
    const wallTex = tile.settlement?.wall ? this.textures.wallTexture : null;
    this.syncSprite(tv, 'wallSprite', wallTex?.texture ?? null, p.x, y - 2, wallTex?.anchorY ?? 0.5);
    if (tv.wallSprite) tv.wallSprite.visible = explored;

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
    this.syncSprite(tv, 'bridgeSprite', bridgeTex ? bridgeTex.texture : null, p.x, this.bridgeSpriteY(tile, y), bridgeTex?.anchorY ?? 0.5);
    if (tv.bridgeSprite) tv.bridgeSprite.visible = explored;

    this.drawTileTerritory(tv.territory, tile, players, explored);
    tv.territory.visible = explored;

    this.drawRoad(tv, tile, explored);

    const bonusTex = tile.bonus ? this.textures.bonusTexture : null;
    this.syncSprite(tv, 'bonusSprite', bonusTex ? bonusTex.texture : null, p.x, y, bonusTex?.anchorY ?? 0.5);
    if (tv.bonusSprite) tv.bonusSprite.visible = explored;

    const bottleVisible = explored && !!tile.bottle;
    this.syncSprite(tv, 'bottleSprite', bottleVisible ? this.textures.bottleTexture.texture : null, p.x, y, this.textures.bottleTexture.anchorY);
    if (tv.bottleSprite) tv.bottleSprite.visible = bottleVisible;

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

    this.syncDealCircles(tv, tile, players, explored, hiddenUnitIds);
  }

  /** Draws a row of 8px dots above the pirate, one per active deal, colored in
   *  the paid tribe's color. Each dot is interactive and shows a tooltip
   *  naming the tribe the deal protects. */
  private syncDealCircles(tv: TileView, tile: MapTile, players: Player[], explored: boolean, hiddenUnitIds: Set<string>): void {
    const unit = tile.unit;
    const paidBy = unit?.paidBy ?? [];
    const shouldDraw = unit !== null && unit.type === 'pirate' && explored && !(hiddenUnitIds.has(unit.id)) && paidBy.length > 0;
    if (!shouldDraw) {
      if (tv.dealCircles) {
        tv.el.removeChild(tv.dealCircles);
        tv.dealCircles.destroy({ children: true });
        tv.dealCircles = null;
        this.dealAnchors.delete(axialKey(tile));
      }
      return;
    }
    if (!this.dealTooltip) {
      this.dealTooltip = new Tooltip(this.app);
      this.app.stage.addChild(this.dealTooltip.el);
    }
    if (!tv.dealCircles) {
      tv.dealCircles = new Container();
      tv.dealCircles.eventMode = 'static';
      tv.dealCircles.zIndex = 9;
      tv.el.addChild(tv.dealCircles);
    } else {
      tv.dealCircles.removeChildren().forEach((c) => c.destroy({ children: true }));
    }
    const p = hexToPixel(tile, this.hexSize);
    const y = p.y - tileElevation(tile, this.hexSize);
    const top = this.unitTextureTop(unit, players);
    let x = 0;
    for (const ownerIndex of paidBy) {
      const holder = new Container();
      holder.eventMode = 'static';
      holder.hitArea = new Circle(PIRATE_DEAL_DOT / 2, PIRATE_DEAL_DOT / 2, PIRATE_DEAL_DOT / 2);
      holder.position.set(x, 0);
      const tribe = players[ownerIndex] ? TRIBES.find((trib) => trib.id === players[ownerIndex]!.tribe) : undefined;
      const g = new Graphics();
      g.circle(PIRATE_DEAL_DOT / 2, PIRATE_DEAL_DOT / 2, PIRATE_DEAL_DOT / 2).fill(tribe?.color ?? PIRATE_COLOR);
      holder.addChild(g);
      const player = players[ownerIndex];
      if (player && tribe) {
        holder.on('pointerover', () => this.showDealTooltip(holder, tribe.name));
        holder.on('pointerout', () => this.dealTooltip?.hide());
      }
      tv.dealCircles.addChild(holder);
      x += PIRATE_DEAL_DOT + PIRATE_DEAL_GAP;
    }
    this.dealAnchors.set(axialKey(tile), {
      x: p.x,
      y: y - top + HP_BAR_ANCHOR_OFFSET,
      rowW: x - PIRATE_DEAL_GAP,
    });
    if (this.viewport) this.layoutDealCircles(axialKey(tile), this.viewport);
  }

  /** Compensates the camera zoom so a pirate-deal dot row keeps a constant
   *  on-screen size, centered directly below the unit's hp bar. */
  private layoutDealCircles(key: string, viewport: Viewport): void {
    const anchor = this.dealAnchors.get(key);
    const tv = this.tileViews.get(key);
    if (!anchor || !tv?.dealCircles) return;
    const s = viewport.scale > 0 ? viewport.scale : 1;
    tv.dealCircles.scale.set(1 / s, 1 / s);
    tv.dealCircles.position.set(anchor.x - anchor.rowW / (2 * s), anchor.y + PIRATE_DEAL_HPBAR_GAP / s);
  }

  private showDealTooltip(target: Container, tribeName: string): void {
    if (!this.dealTooltip) return;
    this.dealTooltip.showFor(target, '', t('hud.pirateDealWith', { tribe: tribeName }));
  }

  /** Y for a bridge sprite: the deck rides at the height of the lower of the
   *  two coasts it spans, so it visually meets (not floats above) its shores. */
  private bridgeSpriteY(tile: MapTile, fallbackY: number): number {
    const dir = tile.bridge?.dir;
    if (!dir) return fallbackY;
    let min: number | null = null;
    for (const off of bridgeCoastOffsets(dir)) {
      const n = this.tileIndex.get(axialKey({ q: tile.q + off.q, r: tile.r + off.r }));
      if (!n) continue;
      const e = tileElevation(n, this.hexSize);
      if (min === null || e < min) min = e;
    }
    return min === null ? fallbackY : fallbackY - min;
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
    if (sprite) {
      this.faceUnitSprite(sprite, facing);
      this.syncGlowSprite(axialKey(tile));
    }
  }

  /** Flips the sprite currently drawn on a tile without changing the stored
   * facing (used to keep staged combat sprites oriented while they animate). */
  faceUnitAtKey(key: string, facing: 'left' | 'right'): void {
    const sprite = this.tileViews.get(key)?.unitSprite;
    if (sprite) {
      this.faceUnitSprite(sprite, facing);
      this.syncGlowSprite(key);
    }
  }

  private drawRoad(tv: TileView, tile: MapTile, explored: boolean): void {
    const isPort = tile.building?.kind === 'port';
    // Ports are road nodes in the game logic (roads connect up to their tile
    // edge), but the port cell itself never shows a road: no road strokes are
    // drawn from its centre.
    const owner = tile.roadOwner;
    const isBridge = tile.bridge !== undefined && tile.bridge !== null;
    const p = hexToPixel(tile, this.hexSize);
    const edgeMidY = (seg: { ay: number; by: number }): number =>
      (seg.ay + seg.by) / 2 - tileElevation(tile, this.hexSize);

    const orangeEdges: { x: number; y: number }[] = [];
    if (owner !== undefined && owner !== null && !isBridge && !isPort && explored) {
      for (let e = 0; e < 6; e++) {
        const n = this.tileIndex.get(axialKey(hexEdgeNeighbor(tile, e)));
        const connected =
          (n?.settlement && n.settlement.owner === owner) ||
          n?.roadOwner === owner ||
          (n?.building && n.building.kind === 'port' && n.ownedBy === owner);
        if (!connected) continue;
        const seg = hexEdge(tile, e, this.hexSize);
        orangeEdges.push({ x: (seg.ax + seg.bx) / 2, y: edgeMidY(seg) });
      }
    }

    const waterEdges: { x: number; y: number }[] = [];
    if (explored && this.waterRouteNeighbors.has(axialKey(tile))) {
      const route = this.waterRouteNeighbors.get(axialKey(tile))!;
      for (let e = 0; e < 6; e++) {
        if (!route.includes(axialKey(hexEdgeNeighbor(tile, e)))) continue;
        const seg = hexEdge(tile, e, this.hexSize);
        waterEdges.push({ x: (seg.ax + seg.bx) / 2, y: edgeMidY(seg) });
      }
    }

    if (orangeEdges.length === 0 && waterEdges.length === 0) {
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
    const cy = p.y - tileElevation(tile, this.hexSize);
    // Roads render like the village borders: a 4px-wide strip from the hex
    // edge midpoint to the tile centre, filled with the repeating dots texture
    // tinted to the road colour.
    const dots = this.ensureDotsTileTexture();
    const halfW = 2;
    const drawStrip = (ex: number, ey: number, color: number): void => {
      const dx = p.x - ex;
      const dy = cy - ey;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const quad = [
        p.x + nx * halfW, cy + ny * halfW,
        p.x - nx * halfW, cy - ny * halfW,
        ex - nx * halfW, ey - ny * halfW,
        ex + nx * halfW, ey + ny * halfW,
      ];
      if (dots) g.poly(quad).fill({ texture: dots, color, textureSpace: 'global' });
      else g.poly(quad).fill(color);
    };
    for (const e of orangeEdges) drawStrip(e.x, e.y, THEME.map.road);
    for (const e of waterEdges) drawStrip(e.x, e.y, THEME.map.waterRoad);
  }

  private portTileTexture(tile: MapTile): TileTexture {
    if (tile.ownedBy === null) return { texture: this.textures.freePortTexture, anchorY: 0.5 };
    const dir = portDirection(this.map!, tile);
    return this.textures.portTextures[dir ?? 'e'];
  }

  private syncSprite(
    tv: TileView,
    kind: 'villageSprite' | 'wallSprite' | 'buildingSprite' | 'bridgeSprite' | 'bonusSprite' | 'bottleSprite' | 'unitSprite',
    texture: Texture | null,
    x: number,
    y: number,
    anchorY = 0.5,
  ): void {
    const zIndex = kind === 'unitSprite' ? 7 : kind === 'buildingSprite' || kind === 'bridgeSprite' ? 5 : kind === 'wallSprite' ? 4 : kind === 'bonusSprite' || kind === 'bottleSprite' ? 8 : 3;
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
    const tribe = tribeById(players[owner]!.tribe)!;
    const color = territoryColor(tribe, this.knownOwners.has(owner));
    const dots = this.ensureDotsTileTexture();
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
      // Village-border tiles: a repeating dots texture at its original size and
      // aspect, tinted to the tribe color (falls back to the solid color while
      // the atlas is unavailable). `textureSpace: 'global'` maps 1 texture
      // pixel to 1 local unit, so the pattern tiles without stretching.
      const quad = [ax, ay, bx, by, bxIn, byIn, axIn, ayIn];
      if (dots) g.poly(quad).fill({ texture: dots, color, textureSpace: 'global' });
      else g.poly(quad).fill(color);
    }
  }

  /** Repeat-wrapping `dots-32` checkerboard used for village-border tiles and
   *  roads, tinted per tribe, at a quarter of the atlas size (the dots render
   *  2x smaller). Painted directly so the dots stay crisp; the atlas frame is
   *  only used as a gate (available art). Null until the atlas is loaded (or in
   *  headless environments). */
  private ensureDotsTileTexture(): Texture | null {
    if (this.dotsTileTexture) return this.dotsTileTexture;
    const frame = icons32FrameTexture('dots-32');
    if (!frame) return null;
    try {
      const resource = (frame.source as { resource?: unknown }).resource;
      const rect = frame.frame;
      if (!resource || !rect || rect.width <= 0 || typeof document === 'undefined') return null;
      const scale = 0.25;
      const w = Math.max(1, Math.round(rect.width * scale));
      const h = Math.max(1, Math.round(rect.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // Paint the `dots-32` checkerboard in single-pixel steps at the target
      // resolution instead of downscaling the atlas frame through the browser:
      // canvas drawImage smoothing (imageSmoothingEnabled) is not honoured
      // everywhere, and a downscale turns a hard checkerboard into soft gray
      // fringe. Nearest-pixel painting keeps the border dots crisp.
      const half = Math.max(1, Math.round(8 * scale));
      ctx.fillStyle = '#ffffff';
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if ((Math.floor(x / half) + Math.floor(y / half)) % 2 === 0) ctx.fillRect(x, y, 1, 1);
        }
      }
      const source = new ImageSource({ resource: canvas, addressMode: 'repeat' });
      this.dotsTileTexture = new Texture({ source });
    } catch {
      return null;
    }
    return this.dotsTileTexture;
  }

  private drawHighlights(
    map: GameMap,
    selection: Selection | null,
    reachableKeys: Set<string>,
    attackableKeys: Set<string>,
    reachableColor: number,
    localPlayerIndex: number,
    tutorialMarkerKeys: Set<string> = new Set<string>(),
    localTurn = true,
    placementKeys?: Set<string>,
  ): void {
    this.tutorialMarkerParts = [];
    this.attackPulseParts = [];
    this.movePulseParts = [];
    for (const tile of map.tiles) {
      if (!tutorialMarkerKeys.has(axialKey(tile))) continue;
      const corners = hexCorners(tile, this.hexSize).map((c) => ({
        x: c.x,
        y: c.y - tileElevation(tile, this.hexSize),
      }));
      const parts = this.addPulseBorder(axialKey(tile), corners, THEME.highlight);
      for (const p of parts) this.tutorialMarkerParts.push(p);
    }
    this.startTutorialPulse();
    const selectedKey = selection ? axialKey(selection) : '';
    // When the reachable/attackable key set changes (new selection), reset the
    // marker stagger clock so the new ring fades in from the start.
    const markerKeys = [...reachableKeys.values()].sort().join(',') + '|' + [...attackableKeys.values()].sort().join(',') + '|' + selectedKey;
    if (markerKeys !== this.markerRevealSig) {
      this.markerRevealSig = markerKeys;
      this.markerRevealTimes.clear();
    }
    const dotRadius = this.hexSize * 0.16;
    for (const tile of map.tiles) {
      const key = axialKey(tile);
      const y = hexToPixel(tile, this.hexSize).y - tileElevation(tile, this.hexSize);
      if (reachableKeys.has(key) && key !== selectedKey) {
        const p = hexToPixel(tile, this.hexSize);
        const dot = this.takeGraphics();
        this.drawMarkerShape(dot, p.x, y, dotRadius, reachableColor);
        this.markerLayer.addChild(dot);
        this.highlights.push(dot);
        this.movePulseParts.push({ g: dot, x: p.x, y, base: dotRadius, color: reachableColor });
        const dist = selection ? hexDistance({ q: selection.q, r: selection.r }, tile) : 1;
        this.revealMarker(key, dist, dot);
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
        if (localTurn && isExploredFor(tile, localPlayerIndex)) {
          this.addStaticSelectedBorder(key, corners);
        }
        continue;
      }
      // Attackable targets: a pulsing red circle at the hex centre.
      const p = hexToPixel(tile, this.hexSize);
      const attackDot = this.takeGraphics();
      this.attackPulseParts.push({ g: attackDot, x: p.x, y, base: dotRadius });
      const dist = selection ? hexDistance({ q: selection.q, r: selection.r }, tile) : 1;
      this.revealMarker(key, dist, attackDot);
      this.markerLayer.addChild(attackDot);
      this.highlights.push(attackDot);
    }
    this.startAttackPulse();
    this.startMovePulse();
    this.ensureMarkerRevealTick();
    if (placementKeys) {
      for (const tile of map.tiles) {
        const key = axialKey(tile);
        if (!placementKeys.has(key)) continue;
        const p = hexToPixel(tile, this.hexSize);
        const y = p.y - tileElevation(tile, this.hexSize);
        const dot = this.takeGraphics();
        this.drawMarkerShape(dot, p.x, y, this.hexSize * 0.16, 0xffd54a);
        this.markerLayer.addChild(dot);
        this.highlights.push(dot);
      }
    }
  }

  /** Draws the ground marker a move/attack target sits on: a filled hexagon
   *  with a 2x-large unfilled hexagon outline, both aligned to the tile hex
   *  ground plane. Only the centre colour differs between marker kinds, so
   *  this is the single source of truth for their look. */
  private drawMarkerShape(g: Graphics, x: number, y: number, radius: number, color: number): void {
    g.clear();
    const hex = (r: number): number[] => {
      const points: number[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        points.push(x + r * Math.cos(angle), y + r * Math.sin(angle) * MARKER_Y_SCALE);
      }
      return points;
    };
    g.poly(hex(radius))
      .fill({ color, alpha: 0.8 })
      .stroke({ width: 2, color, alpha: 0.8, alignment: 0 });
    g.poly(hex(radius * 2))
      .stroke({ width: 4, color, alpha: 0.8, alignment: 0 });
  }

  private startMovePulse(): void {
    for (const part of this.movePulseParts) {
      this.drawMarkerShape(part.g, part.x, part.y, part.base, part.color);
    }
  }

  private startAttackPulse(): void {
    for (const part of this.attackPulseParts) {
      this.drawMarkerShape(part.g, part.x, part.y, part.base, THEME.map.selected);
    }
  }

  /** Draws a permanent black border around the selected hex: 6px, 50% alpha,
   *  aligned outside the hex outline. No animation — the border is static and
   *  rebuilds with the markers on every update. Returns nothing (pure draw). */
  private addStaticSelectedBorder(
    key: string,
    corners: { x: number; y: number }[],
  ): void {
    this.reorderSelectedTile(key);
    const split = splitHexBorder(corners);
    const topPart = this.takeGraphics();
    const bottomPart = this.takeGraphics();
    topPart.zIndex = 2;
    this.tileViews.get(key)!.el.addChild(topPart);
    this.strokePolyline(topPart, split.top, SELECTED_BORDER_WIDTH, SELECTED_BORDER_COLOR, SELECTED_BORDER_ALPHA);
    this.strokePolyline(bottomPart, split.bottom, SELECTED_BORDER_WIDTH, SELECTED_BORDER_COLOR, SELECTED_BORDER_ALPHA);
    this.container.addChild(bottomPart);
    this.highlights.push(topPart, bottomPart);
    this.selectedBorderParts = [
      { g: topPart, baseY: topPart.position.y },
      { g: bottomPart, baseY: bottomPart.position.y },
    ];
  }

  /** Draws a pulsing hex border (structure identical to the selected-tile
   *  border) with the given color, returning the top/bottom parts so a caller
   *  can animate them (used by the tutorial highlighting). */
  private addPulseBorder(
    key: string,
    corners: { x: number; y: number }[],
    color: number,
  ): { g: Graphics; points: { x: number; y: number }[] }[] {
    this.reorderSelectedTile(key);
    const split = splitHexBorder(corners);
    const topPart = this.takeGraphics();
    const bottomPart = this.takeGraphics();
    topPart.zIndex = 2;
    this.tileViews.get(key)!.el.addChild(topPart);
    this.strokePolyline(bottomPart, split.bottom, 4, color, 1);
    this.container.addChild(bottomPart);
    this.highlights.push(topPart, bottomPart);
    return [
      { g: topPart, points: split.top },
      { g: bottomPart, points: split.bottom },
    ];
  }

  private strokePolyline(
    g: Graphics,
    points: { x: number; y: number }[],
    width: number,
    color: number,
    alpha = 1,
    alignment = 0,
  ): void {
    g.clear();
    const first = points[0]!;
    g.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
    g.stroke({ width, color, alpha, alignment });
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
        this.syncGlowSprite(fromKey);
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
        this.syncGlowSprite(fromKey);
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
    const key = axialKey({ q, r });
    const fn = (): void => {
      if (!this.bounceSprite || this.bounceSprite.destroyed) {
        this.stopBounce();
        return;
      }
      const t = Math.min(1, (performance.now() - start) / 300);
      this.bounceSprite.position.y = this.bounceBaseY - Math.sin(t * Math.PI) * amp;
      this.syncGlowSprite(key);
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
    if (!tv) return;
    const sprites: Sprite[] = [];
    const delayed = new Set<Sprite>();
    // The whole selected hex moves together: terrain, village and any surface
    // texture on it (building, bridge, port, temple).
    for (const s of this.hexSurfaceSprites(tv)) sprites.push(s);
    // When the selected cell is not a village itself but belongs to a village,
    // pulse that village's whole hex as well (like a selection) so its territory
    // is linked to it. It starts a moment later so the selected cell's own pulse
    // is seen first.
    const tile = this.tileIndex.get(key);
    if (tile && !tile.settlement) {
      const claim = tile.claimedByVillage;
      if (claim) {
        const claimView = this.tileViews.get(axialKey(claim));
        if (claimView) {
          for (const s of this.hexSurfaceSprites(claimView)) {
            sprites.push(s);
            delayed.add(s);
          }
        }
      }
    }
    if (sprites.length === 0) return;
    const CLAIM_DELAY_MS = 80;
    const entries: { obj: Sprite | Graphics; baseY: number; delay: number }[] = sprites.map((sprite) => ({
      obj: sprite,
      baseY: sprite.position.y,
      delay: delayed.has(sprite) ? CLAIM_DELAY_MS : 0,
    }));
    // The selected tile's border bounces with the hex itself.
    for (const part of this.selectedBorderParts) {
      if (part.g.destroyed) continue;
      entries.push({ obj: part.g, baseY: part.g.position.y, delay: 0 });
    }
    this.runHexBounce(entries);
  }

  bounceHex(q: number, r: number): void {
    if (!this.map) return;
    const tv = this.tileViews.get(axialKey({ q, r }));
    if (!tv) return;
    const sprites = this.hexSurfaceSprites(tv);
    if (sprites.length === 0) return;
    this.runHexBounce(sprites.map((sprite) => ({ obj: sprite, baseY: sprite.position.y, delay: 0 })));
  }

  /** The selection glow: a steady white Sprite hugging a selected unit's
   *  silhouette, kept just behind the unit sprite and hidden otherwise. */
  private updateSelectedGlow(
    selection: Selection | null,
    hiddenUnitIds: Set<string>,
    localPlayerIndex: number,
    players: Player[],
  ): void {
    const key = selection ? axialKey(selection) : '';
    if (key !== this.glowKey) {
      this.hideGlow();
      this.glowKey = key;
    }
    const tile = this.tileIndex.get(key);
    const tv = this.tileViews.get(key);
    const unit = tile?.unit ?? null;
    const shown =
      tv !== undefined &&
      tile !== undefined &&
      selection !== null &&
      selection.kind === 'unit' &&
      unit !== null &&
      selection.q === tile.q &&
      selection.r === tile.r &&
      isExploredFor(tile, localPlayerIndex) &&
      !hiddenUnitIds.has(unit.id);
    const unitTileTex = shown ? this.unitTextureFor(tile, players) : null;
    const glowTex = unitTileTex ? this.textures.glowFor.get(unitTileTex.texture) : undefined;
    if (!tv || !glowTex) {
      this.hideGlow();
      return;
    }
    let glow = tv.glowSprite;
    if (!glow || glow.destroyed) {
      glow = new Sprite(glowTex.texture);
      glow.anchor.set(0.5, glowTex.anchorY);
      glow.zIndex = 6;
      tv.el.addChild(glow);
      tv.glowSprite = glow;
    } else if (glow.texture !== glowTex.texture) {
      glow.texture = glowTex.texture;
      glow.anchor.set(0.5, glowTex.anchorY);
    }
    glow.visible = tv.unitSprite?.visible ?? true;
    this.syncGlowSprite(key);
  }

  private hideGlow(): void {
    const tv = this.glowKey ? this.tileViews.get(this.glowKey) : undefined;
    if (tv?.glowSprite) {
      tv.el.removeChild(tv.glowSprite);
      tv.glowSprite.destroy();
      tv.glowSprite = null;
    }
    this.glowKey = '';
  }

  /** Keeps a selected unit's glow sprite glued to the unit sprite while it is
   *  animated (facing flips, bounces, slides and lunges). */
  private syncGlowSprite(key: string): void {
    const tv = this.tileViews.get(key);
    const unit = tv?.unitSprite;
    const glow = tv?.glowSprite;
    if (!unit || !glow || unit.destroyed || glow.destroyed) return;
    glow.position.set(unit.position.x, unit.position.y);
    glow.scale.set(unit.scale.x, unit.scale.y);
  }

  /** The TileTexture currently decorating `tile`'s unit sprite, mirroring the
   *  lookup in `applyTile`. */
  private unitTextureFor(tile: MapTile, players: Player[]): TileTexture | null {
    const unit = tile.unit;
    if (!unit) return null;
    if (unit.type === 'pirate') return this.textures.pirateTexture;
    const tribe = players[unit.owner]?.tribe;
    if (unit.shipLevel !== undefined && tribe !== undefined) {
      return this.textures.shipTextures[tribe]?.[unit.shipLevel] ?? null;
    }
    if (tribe !== undefined) {
      return this.textures.unitTextures[tribe]?.[unit.type] ?? null;
    }
    return null;
  }

  private runHexBounce(entries: { obj: Sprite | Graphics; baseY: number; delay: number }[]): void {
    this.stopHexBounce();
    this.hexBounceSprites = entries;
    if (entries.length === 0) return;
    const amp = this.hexSize * 0.2;
    const DURATION = 150;
    const start = performance.now();
    const maxDelay = entries.reduce((m, e) => Math.max(m, e.delay), 0);
    const endAt = start + DURATION + maxDelay;
    const fn = (): void => {
      const active = this.hexBounceSprites.filter((e) => !e.obj.destroyed);
      if (active.length === 0) {
        this.stopHexBounce();
        return;
      }
      const elapsed = performance.now() - start;
      for (const e of active) {
        const local = elapsed - e.delay;
        if (local < 0) continue;
        const t = Math.min(1, local / DURATION);
        const p = t < 0.5 ? t * 2 : 2 - t * 2;
        e.obj.position.y = e.baseY - p * amp;
      }
      if (performance.now() >= endAt) this.stopHexBounce();
    };
    this.app.ticker.add(fn);
    this.hexBounceRemove = () => this.app.ticker.remove(fn);
  }

  /** The sprites that sit on top of a hex and move with it when its tile is
   *  bounced: terrain, village, and its surface textures (sawmill/mine/port/
   *  temple building, bridge). */
  private hexSurfaceSprites(tv: TileView): Sprite[] {
    const out: Sprite[] = [];
    for (const s of [tv.terrainSprite, tv.villageSprite, tv.buildingSprite, tv.bridgeSprite]) {
      if (s && !s.destroyed) out.push(s);
    }
    return out;
  }

  private stopHexBounce(): void {
    if (this.hexBounceRemove) {
      this.hexBounceRemove();
      this.hexBounceRemove = null;
    }
    for (const e of this.hexBounceSprites) {
      if (!e.obj.destroyed) e.obj.position.y = e.baseY;
    }
    this.hexBounceSprites = [];
  }

  private startTutorialPulse(): void {
    if (this.stopTutorialMarkers) {
      this.stopTutorialMarkers();
      this.stopTutorialMarkers = null;
    }
    const parts = this.tutorialMarkerParts;
    if (parts.length === 0) return;
    const draw = (width: number): void => {
      for (const p of parts) this.strokePolyline(p.g, p.points, width, THEME.highlight, 1);
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
      const phase = ((performance.now() - start) % 1200) / 1200;
      draw(2 + 4 * Math.abs(Math.sin(phase * Math.PI * 2)));
    };
    ticker.add(fn);
    this.stopTutorialMarkers = () => ticker.remove(fn);
  }

  private startExclamationAnimation(): void {
    if (this.exclamationAnimRemove) return;
    const ticker = this.app.ticker;
    const start = this.animNow();
    const fn = (): void => {
      if (this.cameraBusy) return;
      if (this.exclamationBobs.length === 0) {
        ticker.remove(fn);
        this.exclamationAnimRemove = null;
        return;
      }
      const phase = ((this.animNow() - start) % 800) / 800;
      const offset = -Math.abs(Math.sin(phase * Math.PI * 2)) * 5;
      for (const bob of this.exclamationBobs) bob.position.y = offset;
    };
    ticker.add(fn);
    this.exclamationAnimRemove = () => ticker.remove(fn);
  }

  /** Permanent gentle up-down bob for player ship sprites. Skipped while a ship
   * is being slid or lunged by combat/movement animations. */
  private startShipBob(): void {
    if (this.shipBobRemove || this.shipBobs.length === 0) return;
    const ticker = this.app.ticker;
    const start = this.animNow();
    const fn = (): void => {
      if (this.cameraBusy) return;
      if (this.shipBobs.length === 0) {
        ticker.remove(fn);
        this.shipBobRemove = null;
        return;
      }
      const phase = (this.animNow() - start) / 2600;
      const offset = Math.sin(phase * Math.PI * 2) * 2.5;
      for (const b of this.shipBobs) {
        if (this.shipBusy.has(b.key) || b.sprite.destroyed) continue;
        b.sprite.position.y = b.baseY + offset;
        this.syncGlowSprite(b.key);
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
    this.fireEffects.claimSparks(x, y);
  }

  private addFireEffect(x: number, y: number): void {
    this.fireEffects.add(x, y);
  }

  private clearFireEffects(): void {
    this.fireEffects.clear();
  }

  private startFireAnimation(): void {
    this.fireEffects.startTick();
  }

  /** Pauses the decorative per-frame animations (fire, spark bursts, bobs)
   *  while the camera is being moved, freeing the main thread for panning.
   *  Idempotent. */
  setCameraBusy(busy: boolean): void {
    if (this.cameraBusy === busy) return;
    this.cameraBusy = busy;
    if (busy) {
      this.busyPauseStart = performance.now();
    } else {
      this.pausedMs += performance.now() - this.busyPauseStart;
      this.busyPauseStart = 0;
    }
    this.fireEffects.setPaused(busy);
  }

  /** Animation clock with the camera-pause time excluded, so the decorative
   *  animations resume from exactly where they paused after a drag/zoom. */
  private animNow(): number {
    return performance.now() - this.pausedMs;
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

  private takeText(text: string, style: TextStyleOptions): BitmapText {
    const t = this.textPool.pop() ?? new BitmapText({ text: '', style });
    t.text = text;
    t.style = style;
    return t;
  }

  private releaseText(t: BitmapText): void {
    t.position.set(0, 0);
    t.scale.set(1, 1);
    t.alpha = 1;
    t.visible = true;
    t.zIndex = 0;
    this.textPool.push(t);
  }

  private releaseOverlay(): void {
    for (const item of this.overlayItems) {
      item.el.parent?.removeChild(item.el);
      for (const child of item.el.children) {
        if (child instanceof Graphics) this.releaseGraphics(child);
        else if (child instanceof BitmapText) this.releaseText(child);
        else child.destroy();
      }
      item.el.destroy();
    }
    this.overlayItems.length = 0;
    // Drop damage badges that are not mid-animation (a fade-out keeps running
    // across this rebuild in the badge layer; a live preview's badges stay so a
    // re-render does not blink them back to alpha 0).
    this.damageBadges.dropSettled();
  }

  private clearHighlights(): void {
    this.selectedBorderParts = [];
    if (this.stopTutorialMarkers) {
      this.stopTutorialMarkers();
      this.stopTutorialMarkers = null;
    }
    this.tutorialMarkerParts = [];
    this.attackPulseParts = [];
    this.movePulseParts = [];
    this.markerRevealEls.clear();
    this.stopMarkerRevealTick();
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
  }, canAct: boolean, tribeColor: number, localPlayerIndex: number, hp: number, localTurn: boolean): void {
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
      fontFamily: FONT_REGULAR
    });
    label.anchor.set(0.5, 1);
    label.position.set(0, -barHeight / 2 - 2 + up);
    label.zIndex = 1;
    this.hpLabelHeight = label.height;

    const labelBg = this.takeGraphics();
    labelBg.zIndex = 0;
    const dim = unit.owner === localPlayerIndex && (!localTurn || !canAct);
    labelBg
      .rect(label.x - label.width / 2 - 2, label.y - label.height, label.width + 4, label.height)
      .fill({ color: 0x000000, alpha: dim ? 0.3 : 1 });
    el.addChild(labelBg);
    el.addChild(label);

    this.overlay.addChild(el);
    this.overlayItems.push({ el, world: position });
  }

  /** HP bar + text for a damaged building, styled like a unit's (only shown
   *  below full hp). */
  private addBuildingHpBar(position: { x: number; y: number }, hp: number): void {
    const el = new Container();
    el.position.set(position.x, position.y);
    const barWidth = this.hexSize * 0.6;
    const barHeight = 5;
    const maxHp = BUILDING_MAX_HP;
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
      fontFamily: FONT_REGULAR,
    });
    label.anchor.set(0.5, 1);
    label.position.set(0, -barHeight / 2 - 2 + up);
    label.zIndex = 1;

    const labelBg = this.takeGraphics();
    labelBg.zIndex = 0;
    labelBg
      .rect(label.x - label.width / 2 - 2, label.y - label.height, label.width + 4, label.height)
      .fill({ color: 0x000000, alpha: 1 });
    el.addChild(labelBg);
    el.addChild(label);

    this.overlay.addChild(el);
    this.overlayItems.push({ el, world: position });
  }

  /** Recompute the screen-edge indicators for capturable villages that are
   *  currently off-screen. Called after every camera move so the markers always
   *  point at the villages' edges and vanish as soon as a village scrolls into
   *  view. */
  repositionEdgeMarkers(viewport: Viewport): void {
    this.syncEdgeMarkers(viewport);
  }

  private syncEdgeMarkers(viewport: Viewport): void {
    this.edgeMarkers.removeChildren().forEach((c) => c.destroy());
    this.edgeMarkerParts = [];
    if (!this.map || viewport.width <= 0 || viewport.height <= 0) {
      this.stopEdgePulse();
      return;
    }
    const W = viewport.width;
    const H = viewport.height;
    const parts: { g: Graphics; side: 'l' | 'r' | 't' | 'b'; along: number; W: number; H: number }[] = [];
    for (const tile of this.map.tiles) {
      const st = tile.settlement;
      if (!st || !st.captureReady) continue;
      const u = tile.unit;
      if (!u || u.owner === st.owner) continue;
      if (!isExploredFor(tile, this.lastLocalIndex)) continue;
      const w = hexToPixel(tile, this.hexSize);
      const sx = viewport.x + w.x * viewport.scale;
      const sy = viewport.y + w.y * viewport.scale;
      if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) continue;
      const dx = sx < 0 ? -sx : sx > W ? sx - W : 0;
      const dy = sy < 0 ? -sy : sy > H ? sy - H : 0;
      const side: 'l' | 'r' | 't' | 'b' = dx >= dy ? (sx < 0 ? 'l' : 'r') : sy < 0 ? 't' : 'b';
      // The marker sits exactly on the village's own screen coordinate along
      // the chosen edge: its x for top/bottom edges and its y for left/right
      // edges, so it points precisely at the off-screen village.
      const halfLen = CAPTURE_EDGE_MARKER_SIZE / 2;
      let along: number;
      if (side === 'l' || side === 'r') along = Math.max(halfLen, Math.min(H - halfLen, sy));
      else along = Math.max(halfLen, Math.min(W - halfLen, sx));
      const g = new Graphics();
      g.alpha = CAPTURE_EDGE_MARKER_ALPHA;
      this.edgeMarkers.addChild(g);
      parts.push({ g, side, along, W, H });
    }
    this.edgeMarkerParts = parts;
    if (parts.length === 0) {
      this.stopEdgePulse();
      return;
    }
    // The slide animation is continuous: rebuilding the marker set must not
    // restart its phase clock, or the marker would visibly jump back on every
    // unrelated map update. Just (re)draw at the current phase instead.
    this.redrawEdgeMarkers();
    this.startEdgePulse();
  }

  private drawEdgeMarkers(slide: number): void {
    const white = 0xffffff;
    for (const part of this.edgeMarkerParts) {
      part.g.clear();
      const pts = captureMarkerPoints(part.side, part.along, slide, part.W, part.H, CAPTURE_EDGE_MARKER_SIZE);
      part.g.poly(pts).fill(THEME.map.selected).stroke({ width: 2, color: white, alignment: 0 });
    }
  }

  /** Draw the markers at the animation phase in effect right now. */
  private redrawEdgeMarkers(): void {
    const t = ((performance.now() - (this.edgePulseStart ?? performance.now())) % CAPTURE_EDGE_PULSE_MS) / CAPTURE_EDGE_PULSE_MS;
    const slide = CAPTURE_EDGE_MARKER_SLIDE * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
    this.drawEdgeMarkers(slide);
  }

  private startEdgePulse(): void {
    if (this.stopEdgePulseFn) return; // already running — keep the same phase clock
    if (this.edgeMarkerParts.length === 0) return;
    const ticker = this.app.ticker;
    this.edgePulseStart = performance.now();
    const fn = (): void => {
      if (this.cameraBusy) return;
      if (this.edgeMarkerParts.length === 0) {
        ticker.remove(fn);
        this.stopEdgePulseFn = null;
        return;
      }
      const t = ((performance.now() - this.edgePulseStart!) % CAPTURE_EDGE_PULSE_MS) / CAPTURE_EDGE_PULSE_MS;
      const slide = CAPTURE_EDGE_MARKER_SLIDE * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
      this.drawEdgeMarkers(slide);
    };
    ticker.add(fn);
    this.stopEdgePulseFn = () => ticker.remove(fn);
  }

  private stopEdgePulse(): void {
    if (this.stopEdgePulseFn) {
      this.stopEdgePulseFn();
      this.stopEdgePulseFn = null;
    }
    this.edgePulseStart = null;
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
    const tribe = tribeById(players[owner]!.tribe)!;
    const connected = this.textures.villageConnectedTexture !== null && isVillageRoadConnected(map, tile, this.waterJumps);
    const icon = connected ? new Sprite(this.textures.villageConnectedTexture!) : null;
    const iconSize = 16;
    const gap = 4;
    const label = this.takeText(`${tile.settlement!.name ?? ''} ${count}/${capacity}`.trim(), {
      fontSize: 14,
      fill: 0xffffff,
      fontFamily: FONT_REGULAR
    });
    label.anchor.set(0, 0.5);
    if (icon) {
      icon.anchor.set(0, 0.5);
      icon.width = iconSize;
      icon.height = iconSize;
    }
    const contentW = label.width + (icon ? iconSize + gap : 0);
    const padX = 4;
    const x0 = -contentW / 2;
    if (icon) icon.position.set(x0, 0);
    label.position.set(x0 + (icon ? iconSize + gap : 0), 0);

    const labelBg = this.takeGraphics();
    labelBg.zIndex = 0;
    labelBg
      .roundRect(x0 - padX, -label.height / 2 - 1, contentW + padX * 2, label.height + 2, 2)
      .fill(territoryColor(tribe, this.knownOwners.has(owner)));

    label.zIndex = 1;
    if (icon) {
      icon.zIndex = 1;
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
