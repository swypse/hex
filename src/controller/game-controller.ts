import { Application, Container } from 'pixi.js';
import { Simulator, type Command } from '../game/simulator';
import { localizeVillageName } from '../i18n/lists';
import { t } from '../i18n';
import { GameStateSnapshot } from '../game/state';
import { GameEvent, BuildingKind } from '../game/events';
import type { HostMessage } from '../net/peer-session';
import { axialKey, hexDistance, hexToPixel } from '../game/hex';
import { TileType, isWaterType } from '../game/tile-types';
import { generateMap, type GameMap, type MapSize, type MapTile } from '../game/map-gen';
import { buildPlayers } from '../game/players';
import { AiDifficulty, DEFAULT_AI_DIFFICULTY } from '../game/ai-difficulty';
import { hasSkill, SKILLS, SkillId } from '../game/skills';
import { attackableTargets } from '../game/combat';
import { builderBuildable, type BuilderBuildKind } from '../game/buildings';
import { trapCells } from '../game/traps';
import { stormEligible } from '../game/storm';
import { adjacentEnemyVillages, isMoveStealthed } from '../game/stalker';
import { movePoints, canMove, canAttack, canDisband, makeUnit, PIRATE_OWNER, type Unit, type UnitType } from '../game/units';
import { cycleSelection, reachableTargets, tileAt } from '../game/selection';
import { shouldPromptWatch, type GameMode } from '../game/game-mode';
import { isExploredFor, initialExplorationFor } from '../game/explore';
import { exploreVillageSights } from '../game/village';
import { RESOURCE_CHEAT_AMOUNT } from '../game/cheats';
import { TRIBES, Tribe, tribeById } from '../game/tribes';
import { MapView, ZOOM_DETAIL_HIDE, type OverlayItem } from '../render/map-renderer';
import { pickTileAt } from '../render/tile-pick';
import { markDirty } from '../render/render-gate';
import { createTextures, destroyTextureSet } from '../render/texture-factory';
import { useGameStore, confirmLeaveGame } from '../store/game-store';
import { saveRepository } from '../storage/save-game';
import { activeMatchStore } from '../storage/active-match';
import { welcomeDismissed } from '../storage/settings';
import { sfx } from '../sound/sfx';
import { SeededRandom } from '../util/random';
import { setAiLogging, aiLoggingEnabled } from '../game/ai';
import { CameraController } from './camera-controller';
import { damagePreviewVictim } from './damage-preview';
import { HoldTimer } from './hold-timer';
import { type Viewport } from '../render/tile-signature';
import { EventPresenter } from './event-presenter';
import { NetworkController } from './network-controller';
import { TutorialDirector, type TutorialHost } from './tutorial-director';
import { STEP_CONFIG, skillPulseStep } from '../game/tutorial/tutorial-steps';
import {
  buildTutorialMap,
  buildTutorialPlayers,
  TUTORIAL_CAPITAL,
  TUTORIAL_ENEMY_SHIP_ID,
  TUTORIAL_ENEMY_WARRIOR_ID,
  TUTORIAL_START_WARRIOR_ID,
} from '../game/tutorial/tutorial-map';

const HEX_SIZE = 40;
const VILLAGE_START_OFFSET = 200;
const SPECTATE_ROUND_DELAY_MS = 500;
/** How long a press must be held (touch or mouse) before the damage preview
 *  shows, in ms. */
const DAMAGE_PREVIEW_HOLD_MS = 500;
/** Minimum interval between full viewport culling / edge-marker rebuilds while
 *  the camera is busy (drag / zoom / pan). These run per pointermove event
 *  otherwise; throttling them to one display frame keeps panning smooth. */
const VIEWPORT_SYNC_MS = 16;

class GameController {
  private app: Application | null = null;
  private mapRoot: Container | null = null;
  private edgeLayerTarget: Container | null = null;
  private sim: Simulator | null = null;
  private textures: Awaited<ReturnType<typeof createTextures>> | null = null;
  private mapView: MapView | null = null;
  private overlayItems: OverlayItem[] = [];
  private reachableKeys = new Set<string>();
  private attackableKeys = new Set<string>();
  private hiddenUnitIds = new Set<string>();
  /** Builder placement in progress: highlight candidate cells, wait for a tap. */
  private placementKeys = new Set<string>();
  private pendingPlacement: { unitId: string; kind: BuilderBuildKind } | null = null;
  private pendingTrap: { unitId: string } | null = null;
  /** Whether the last render hid detail (hp bars/labels) for the current zoom;
   *  kept so a zoom crossing the detail threshold forces a re-render. */
  private detailHidden = false;
  private knownTribeIds = new Set<number>();
  private taskQueue: Promise<void> = Promise.resolve();
  private network: NetworkController | null = null;
  private initToken = 0;
  private recovering = false;
  private startVillageIntroPending = false;
  private camera: CameraController | null = null;
  private lastViewportSyncAt = 0;
  private events: EventPresenter | null = null;
  private tutorial: TutorialDirector | null = null;
  private watchingLoopRunning = false;
  /** Set when the WebGL context has been lost but not yet recovered. */
  private contextLost = false;
  private damagePreviewHold: HoldTimer | null = null;
  private damagePreviewPress: { x: number; y: number } | null = null;
  private damagePreviewShown = false;
  private suppressNextTap = false;
  private damagePreviewWindowUp: ((e: PointerEvent) => void) | null = null;
  private damagePreviewWindowCancel: ((e: PointerEvent) => void) | null = null;

  init(app: Application, root: Container, edgeLayerTarget: Container | null = null): void {
    if (this.mapRoot) return;
    this.app = app;
    this.mapRoot = root;
    this.edgeLayerTarget = edgeLayerTarget;
    const token = ++this.initToken;
    const pending = useGameStore.getState().pendingSnapshot;
    const startIntro = pending !== null || this.startVillageIntroPending;
    this.startVillageIntroPending = false;
    if (pending) {
      useGameStore.getState().setPendingSnapshot(null);
      if (!this.sim) {
        this.sim = Simulator.fromSnapshot(pending);
        this.sim.drainEvents();
      }
    }
    if (this.sim) {
      this.applyFitToScreen();
      useGameStore.getState().setTexturesLoading(true);
      void createTextures(app, this.sim.map, HEX_SIZE * this.getCamera().qualityFactor, new Set(this.sim.players.map((p) => p.tribe))).then((textures) => {
        if (token === this.initToken) useGameStore.getState().setTexturesLoading(false);
        if (token !== this.initToken || !this.mapRoot) return;
        this.replaceTextures(textures);
        this.render();
        this.presentPendingClientEvents();
        if (startIntro) this.centerOnStartVillage();
      }).catch((e) => {
        // A bake that fails (e.g. the tab was backgrounded and the GL context
        // dropped mid-load) must not leave texturesLoading stuck, or recovery
        // would never be able to run.
        console.error('[init] texture bake failed', e);
        if (token === this.initToken) {
          useGameStore.getState().setTexturesLoading(false);
          if (this.sim) this.contextLost = true;
        }
      });
    }
  }

  shutdown(): void {
    this.cancelDamagePreviewHold();
    this.damagePreviewShown = false;
    this.mapView?.hideDamagePreview();
    this.suppressNextTap = false;
    this.camera?.destroy();
    this.camera = null;
    this.initToken++;
    this.startVillageIntroPending = false;
    if (this.mapView) {
      this.mapView.destroy();
      this.mapView = null;
    }
    this.overlayItems = [];
    this.mapRoot = null;
    if (this.textures) {
      destroyTextureSet(this.textures);
      this.textures = null;
    }
    this.app = null;
    this.tutorial = null;
  }

  /** Swaps in a freshly baked TextureSet after the previous MapView (which held
   *  the old set) is gone, so the composited village textures of the discarded
   *  set are destroyed as soon as nothing references them. */
  private replaceTextures(textures: Awaited<ReturnType<typeof createTextures>>): void {
    if (this.mapView) {
      this.mapView.destroy();
      this.mapView = null;
    }
    const previous = this.textures;
    this.textures = textures;
    if (previous && previous !== textures) destroyTextureSet(previous);
  }

  getMap(): GameMap | null {
    return this.sim?.map ?? null;
  }

  getSim(): Simulator | null {
    return this.sim;
  }

  private syncStore(): void {
    const store = useGameStore.getState();
    if (!this.sim) return;
    store.setPlayers(
      this.sim.players.map((p) => ({
        ...p,
        resources: { ...p.resources },
        skills: [...p.skills],
        knownTribes: p.knownTribes ? [...p.knownTribes] : undefined,
        stats: p.stats ? { ...p.stats } : undefined,
        achievements: p.achievements ? [...p.achievements] : undefined,
      })),
    );
    store.setTurn(this.sim.turn);
    store.setCurrentPlayerIndex(this.sim.currentPlayerIndex);
    store.setGameOver(this.sim.gameOver);
    store.setWinnerIndex(this.sim.winnerIndex);
    store.setExpectedTurns(this.sim.expectedTurns);
    store.setBonusAwarded(this.sim.bonusAwarded);
  }

  private syncTutorialStore(): void {
    const store = useGameStore.getState();
    if (!this.tutorial) {
      store.setTutorialStep(null);
      store.setTutorialHighlightSkills([]);
      store.setTutorialHighlightEndTurn(false);
      return;
    }
    const step = this.tutorial.currentStep();
    const def = STEP_CONFIG[step];
    store.setTutorialStep(step);
    store.setTutorialHighlightSkills(def.highlightSkills);
    store.setTutorialHighlightEndTurn(def.highlightEndTurn);
  }

  private tutorialMarkerKeys(): Set<string> {
    if (!this.tutorial || !this.sim) return new Set<string>();
    const step = this.tutorial.currentStep();
    const markers = new Set<string>();
    for (const m of STEP_CONFIG[step].markers) markers.add(axialKey(m));
    if (step === 'attackEnemy') {
      const enemy = this.sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_ENEMY_WARRIOR_ID);
      if (enemy) markers.add(axialKey(enemy));
    }
    if (step === 'boardShip') {
      const warrior = this.sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_START_WARRIOR_ID);
      if (warrior) markers.add(axialKey(warrior));
    }
    if (step === 'upgradeShip') {
      const ship = this.sim.map.tiles.find(
        (t) => t.unit && t.unit.owner === 0 && t.unit.shipLevel !== undefined,
      );
      if (ship) markers.add(axialKey(ship));
    }
    if (step === 'attackEnemyShip') {
      const ship = this.sim.map.tiles.find(
        (t) => t.unit && t.unit.owner === 0 && t.unit.shipLevel !== undefined,
      );
      if (ship) markers.add(axialKey(ship));
      const enemy = this.sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_ENEMY_SHIP_ID);
      if (enemy) markers.add(axialKey(enemy));
    }
    if (step === 'collectBonus') {
      const bonusTile = this.sim.map.tiles.find((t) => t.bonus !== undefined && t.bonus !== null);
      if (bonusTile) markers.add(axialKey(bonusTile));
    }
    if (step === 'approachFreeVillage' || step === 'captureFreeVillage') {
      const freeVillage = this.sim.map.tiles.find((t) => t.settlement && t.settlement.owner === null);
      if (freeVillage) markers.add(axialKey(freeVillage));
    }
    return markers;
  }

  exploredKeysFor(playerIndex: number): Set<string> {
    const keys = new Set<string>();
    if (!this.sim) return keys;
    for (const t of this.sim.map.tiles) {
      if (isExploredFor(t, playerIndex)) keys.add(axialKey(t));
    }
    return keys;
  }

  private deriveKnownTribes(): Set<number> {
    const store = useGameStore.getState();
    const local = this.sim?.players[store.localPlayerIndex];
    if (!local) return new Set<number>();
    return new Set<number>([local.tribe, ...(local.knownTribes ?? [])]);
  }

  private syncKnownTribes(notify: boolean): void {
    if (!this.sim) return;
    const current = this.deriveKnownTribes();
    const firstSync = this.knownTribeIds.size === 0;
    if (notify && !firstSync) {
      const newly = [...current].filter((id) => !this.knownTribeIds.has(id));
      newly.forEach((tribeId, i) => {
        const tribe = tribeById(tribeId);
        if (!tribe) return;
        setTimeout(() => useGameStore.getState().setCenterMessage(t('msg.meetTribe', { tribe: tribe.name }), `${tribe.code}-icon.png`), i * 1100);
      });
    }
    this.knownTribeIds = new Set<number>([...this.knownTribeIds, ...current]);
  }

  adoptSnapshot(snap: GameStateSnapshot): void {
    this.sim = Simulator.fromSnapshot(snap);
    this.syncStore();
    this.syncKnownTribes(true);
    this.hiddenUnitIds.clear();
    if (this.app) this.render();
  }

  saveGame(): void {
    if (!this.sim || useGameStore.getState().netMode !== 'single') return;
    if (useGameStore.getState().tutorial) return;
    saveRepository.save(this.sim.snapshot());
  }

  resumeGame(): void {
    const snap = saveRepository.load();
    if (!snap) return;
    this.sim = Simulator.fromSnapshot(snap);
    for (const tile of this.sim.map.tiles) {
      if (tile.settlement?.name) tile.settlement.name = localizeVillageName(tile.settlement.name);
    }
    const store = useGameStore.getState();
    this.tutorial = null;
    store.setTutorial(false);
    store.setTutorialStep(null);
    store.setTutorialHighlightSkills([]);
    store.setTutorialHighlightEndTurn(false);
    store.setPlayers(snap.players);
    store.setMode(snap.mode);
    store.setTurn(snap.turn);
    store.setCurrentPlayerIndex(snap.currentPlayerIndex);
    store.setGameOver(snap.gameOver);
    store.setWinnerIndex(snap.winnerIndex);
    store.setExpectedTurns(snap.expectedTurns);
    store.setBonusAwarded(snap.bonusAwarded);
    store.setLocalPlayerIndex(0);
    store.setNetMode('single');
    store.setAiActive(snap.currentPlayerIndex !== 0);
    store.setSelection(null);
    this.startVillageIntroPending = true;
    store.setScreen('game');
    this.syncKnownTribes(false);
  }

  /** Marks that the WebGL context was lost. Kept so a later foreground event can
   *  rebuild even if the browser never fires `webglcontextrestored`. */
  noteContextLost(): void {
    this.contextLost = true;
    markDirty();
  }

  /** Whether the GL context is currently reported as lost by Pixi. */
  private glContextLost(): boolean {
    const r = this.app?.renderer as
      | { context?: { isLost?: boolean }; gl?: { isContextLost?: () => boolean } }
      | undefined;
    if (!r) return false;
    if (r.context?.isLost) return r.context.isLost;
    if (r.gl && typeof r.gl.isContextLost === 'function') return r.gl.isContextLost();
    return false;
  }

  /** Called when the page comes back to the foreground. Some mobile browsers
   *  drop the WebGL context while backgrounded without delivering
   *  `webglcontextrestored` afterwards, so retrigger recovery whenever the
   *  context was lost. */
  recoverOnForeground(): void {
    if (this.contextLost || this.glContextLost()) {
      void this.recoverFromContextLoss();
    }
  }

  /** Mobile browsers drop the WebGL context while the tab is backgrounded.
   * Pixi restores its GL state on `webglcontextrestored`, and image/canvas
   * backed textures re-upload automatically, but textures made by
   * `renderer.generateTexture()` (every terrain/unit/building sprite) are
   * RenderTextures that live only on the GPU, so they come back blank. Rebuild
   * the TextureSet from the sim and recreate the MapView on top of it. */
  async recoverFromContextLoss(retries = 8): Promise<void> {
    if (this.recovering) return;
    if (!this.app || !this.sim || !this.textures || !this.mapView) return;
    this.recovering = true;
    const store = useGameStore.getState();
    store.setTexturesLoading(true);
    const token = this.initToken;
    try {
      // The callback may beat the browser actually handing the context back
      // (especially on the foreground fallback); wait until GL is usable.
      for (let i = 0; i < retries && this.glContextLost(); i++) {
        await new Promise((r) => setTimeout(r, 250));
      }
      if (this.glContextLost()) return;
      const hexSize = HEX_SIZE * this.getCamera().qualityFactor;
      const textures = await createTextures(this.app, this.sim.map, hexSize, new Set(this.sim.players.map((p) => p.tribe)));
      if (token !== this.initToken || !this.app || !this.mapRoot) return;
      this.overlayItems = [];
      this.replaceTextures(textures);
      this.contextLost = false;
      this.render();
    } catch (e) {
      // Keep the loss flag set so the next restore/foreground event retries
      // instead of leaving the map blank forever.
      console.error('[recover] texture rebuild failed', e);
    } finally {
      if (token === this.initToken) useGameStore.getState().setTexturesLoading(false);
      this.recovering = false;
    }
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.taskQueue.then(task, task);
    this.taskQueue = run.catch((e) => {
      console.error('[queue] task failed', e);
    });
    return run;
  }

  private presentPendingClientEvents(): void {
    this.getNetwork().presentPendingClientEvents();
  }

  runCommand(cmd: Command): Promise<void> {
    return this.enqueue(async () => {
      if (!this.sim || this.sim.gameOver) return;
      const store = useGameStore.getState();
      if (store.aiActive && cmd.type !== 'endTurn') return;
      const preExplored = this.exploredKeysFor(store.localPlayerIndex);
      const ok = this.sim.applyCommand(cmd);
      if (ok) this.saveGame();
      const events = this.sim.drainEvents();
      if (store.netMode === 'host') this.getNetwork().broadcastBatch(events);
      await this.presentEvents(events, preExplored);
      this.syncStore();
      const storeNow = useGameStore.getState();
      if (this.sim && shouldPromptWatch({
        netMode: storeNow.netMode,
        mode: storeNow.mode,
        gameOver: storeNow.gameOver,
        watching: storeNow.watching,
        localActive: this.sim.players[storeNow.localPlayerIndex]?.isActive ?? true,
        overlayKind: storeNow.overlay?.kind ?? null,
      })) {
        storeNow.setOverlay({ kind: 'watchingPrompt' });
      }
      this.render();
      if (useGameStore.getState().tutorial && this.tutorial) {
        const changed = this.tutorial.afterCommand(events);
        if (changed) {
          this.syncTutorialStore();
          const s = useGameStore.getState();
          // Once a skill step completes, close the skill tree so the player can
          // see the next banner/objective on the map.
          if (s.overlay?.kind === 'skill' && !skillPulseStep(s.tutorialStep)) {
            s.setOverlay(null);
          }
          this.render();
        }
      }
    });
  }

  async startGame(tribe: Tribe, enemyCount: number, mode: GameMode, difficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY, mapSize: MapSize = 'normal'): Promise<void> {
    const store = useGameStore.getState();
    this.tutorial = null;
    store.setTutorial(false);
    store.setTutorialStep(null);
    store.setTutorialHighlightSkills([]);
    store.setTutorialHighlightEndTurn(false);
    const players = buildPlayers(tribe, enemyCount, new SeededRandom(Math.floor(Math.random() * 100000)), difficulty);
    const map = generateMap(players.length, Math.floor(Math.random() * 100000), mapSize);
    for (const p of players) {
      initialExplorationFor(map, p.index);
      exploreVillageSights(map, p.index);
    }
    this.sim = new Simulator(map, players, mode);
    this.sim.startGame();
    this.sim.drainEvents();
    store.setPlayers(players);
    store.setMode(mode);
    store.setExpectedTurns(this.sim.expectedTurns);
    store.setGameOver(false);
    store.setWinnerIndex(null);
    store.setBonusAwarded(false);
    store.setLocalPlayerIndex(0);
    store.setNetMode('single');
    store.setTurn(1);
    store.setCurrentPlayerIndex(0);
    store.setAiActive(false);
    store.setSelection(null);
    store.setScreen('game');
    if (!welcomeDismissed()) store.setOverlay({ kind: 'welcome' });
    this.syncKnownTribes(false);
    const start = map.spawns[store.localPlayerIndex]!.start;
    store.setSelection({ kind: 'unit', q: start.q, r: start.r });
    if (this.app) {
      this.applyFitToScreen();
      this.replaceTextures(await createTextures(this.app, map, HEX_SIZE * this.getCamera().qualityFactor, new Set(this.sim!.players.map((p) => p.tribe))));
    }
    this.render();
    this.centerOnStartVillage();
    this.saveGame();
  }

  startTutorial(): Promise<void> {
    const store = useGameStore.getState();
    const players = buildTutorialPlayers();
    const map = buildTutorialMap();
    this.sim = new Simulator(map, players, 'turns30', { disablePirates: true });
    this.sim.startGame();
    this.sim.drainEvents();
    this.tutorial = new TutorialDirector({ sim: () => this.sim } satisfies TutorialHost);
    this.tutorial.start();
    store.setPlayers(players);
    store.setMode('turns30');
    store.setExpectedTurns(this.sim.expectedTurns);
    store.setGameOver(false);
    store.setWinnerIndex(null);
    store.setBonusAwarded(false);
    store.setLocalPlayerIndex(0);
    store.setNetMode('single');
    store.setTurn(1);
    store.setCurrentPlayerIndex(0);
    store.setAiActive(false);
    store.setSelection(null);
    store.setOverlay(null);
    store.setTutorial(true);
    this.syncTutorialStore();
    this.syncKnownTribes(false);
    store.setSelection({ kind: 'unit', q: TUTORIAL_CAPITAL.q, r: TUTORIAL_CAPITAL.r });
    this.startVillageIntroPending = true;
    store.setScreen('game');
    return Promise.resolve();
  }

  tutorialWelcomeClosed(): void {
    if (!this.tutorial) return;
    if (this.tutorial.welcomeClosed()) {
      this.syncTutorialStore();
      this.render();
    }
  }

  exitTutorial(): void {
    this.tutorial = null;
    useGameStore.getState().setOverlay(null);
    useGameStore.getState().setTutorial(false);
    useGameStore.getState().setTutorialStep(null);
    useGameStore.getState().setTutorialHighlightSkills([]);
    useGameStore.getState().setTutorialHighlightEndTurn(false);
    useGameStore.getState().setSelection(null);
    useGameStore.getState().setScreen('start');
  }

  private mapHeight(): number {
    if (!this.app) return 0;
    // The map always covers the full screen height (including under the
    // toolbar), regardless of screen width.
    return this.app.screen.height;
  }

  /** 0 at the default view (camera zoom 1), 1 at the farthest zoom-out
   *  (camera zoom 0.5). Used to hide detail text when zoomed out. */
  private zoomOut(): number {
    if (!this.camera) return 0;
    return Math.max(0, Math.min(1, (1 - this.camera.zoom) / 0.5));
  }

  private getCamera(): CameraController {
    if (!this.camera) {
      this.camera = new CameraController({
        app: this.app,
        hexSize: HEX_SIZE,
        screenWidth: () => this.app?.screen.width ?? 0,
        mapHeight: () => this.mapHeight(),
        mapRadius: () => this.sim?.map.radius ?? 0,
        onCameraChange: () => this.applyTransform(),
        onBusyChange: (busy) => this.mapView?.setCameraBusy(busy),
      });
    }
    return this.camera;
  }

  private getEvents(): EventPresenter {
    if (!this.events) {
      this.events = new EventPresenter({
        app: () => this.app,
        mapRoot: () => this.mapRoot,
        mapView: () => this.mapView,
        textures: () => this.textures,
        sim: () => this.sim,
        hiddenUnitIds: () => this.hiddenUnitIds,
        camera: () => this.getCamera(),
        render: () => this.render(),
        syncKnownTribes: (notify) => this.syncKnownTribes(notify),
        enqueue: (task) => this.enqueue(task),
        bringCellIntoView: (q, r) => this.bringCellIntoView(q, r),
        exploredKeysFor: (playerIndex) => this.exploredKeysFor(playerIndex),
        saveGame: () => this.saveGame(),
      });
    }
    return this.events;
  }

  presentEvents(events: GameEvent[], preExplored: Set<string>): Promise<void> {
    return this.getEvents().present(events, preExplored);
  }

  private getNetwork(): NetworkController {
    if (!this.network) {
      this.network = new NetworkController({
        app: () => this.app,
        sim: () => this.sim,
        setSim: (sim) => { this.sim = sim; },
        setTextures: (textures) => { this.replaceTextures(textures); },
        enqueue: (task) => this.enqueue(task),
        render: () => this.render(),
        syncStore: () => this.syncStore(),
        syncKnownTribes: (notify) => this.syncKnownTribes(notify),
        exploredKeysFor: (playerIndex) => this.exploredKeysFor(playerIndex),
        presentEvents: (events, pre) => this.presentEvents(events, pre),
        adoptSnapshot: (snap) => this.adoptSnapshot(snap),
        applyFitToScreen: () => this.applyFitToScreen(),
        centerOnStartVillage: () => this.centerOnStartVillage(),
        cameraQualityFactor: () => this.getCamera().qualityFactor,
        runCommand: (cmd) => this.runCommand(cmd),
      });
    }
    return this.network;
  }

  private applyFitToScreen(): void {
    if (!this.app || !this.sim) return;
    this.getCamera().applyFitToScreen();
  }

  /** Re-fit and re-render the map after the window/viewport is resized. */
  handleResize(): void {
    if (!this.app || !this.sim || !this.mapView || !this.camera) return;
    this.applyFitToScreen();
    this.applyTransform();
  }

  private applyTransform(): void {
    if (!this.mapView || !this.camera) return;
    markDirty();
    const camera = this.camera;
    const scale = camera.scale;
    this.mapView.container.scale.set(scale, scale);
    this.mapView.container.position.set(camera.pan.x, camera.pan.y);
    this.mapView.container.hitArea = camera.viewportRect();
    this.mapView.markerLayer.scale.set(scale, scale);
    this.mapView.markerLayer.position.set(camera.pan.x, camera.pan.y);
    this.mapView.badgeLayer.scale.set(scale, scale);
    this.mapView.badgeLayer.position.set(camera.pan.x, camera.pan.y);
    this.mapView.syncBadgePositions(camera.pan, scale);
    this.mapView.syncHpBarPositions(camera.pan, scale);
    for (const item of this.overlayItems) {
      item.el.position.set(camera.pan.x + item.world.x * scale, camera.pan.y + item.world.y * scale);
    }
    if (this.app) {
      const viewport: Viewport = {
        x: camera.pan.x,
        y: camera.pan.y,
        scale,
        width: this.app.screen.width,
        height: this.mapHeight(),
        zoomOut: this.zoomOut(),
      };
      // While the camera is busy (drag / zoom / pan) the viewport can jump at
      // pointermove rate; culling the whole tile map and rebuilding the edge
      // markers on every event steals frames, so throttle those to ~16ms and
      // always run them at rest.
      const nowMs = performance.now();
      if (!camera.isBusy || nowMs - this.lastViewportSyncAt >= VIEWPORT_SYNC_MS) {
        this.lastViewportSyncAt = nowMs;
        this.mapView.setViewport(viewport);
        this.mapView.repositionEdgeMarkers(viewport);
      }
    }
    // Zoom changes never re-render the overlay, so hp bars/labels stay stale
    // until the detail threshold is crossed; force a render then.
    const hidden = this.zoomOut() > ZOOM_DETAIL_HIDE;
    if (hidden !== this.detailHidden) {
      this.detailHidden = hidden;
      this.render();
    }
  }

  private async bringCellIntoView(q: number, r: number): Promise<void> {
    if (!this.app || !this.sim) return;
    const local = useGameStore.getState().localPlayerIndex;
    const tile = tileAt(this.sim.map, q, r);
    if (tile && !isExploredFor(tile, local)) return;
    const world = hexToPixel({ q, r }, HEX_SIZE);
    const camera = this.getCamera();
    if (camera.isWorldPointVisible(world)) return;
    const target = {
      x: this.app.screen.width / 2 - world.x * camera.scale,
      y: this.mapHeight() / 2 - world.y * camera.scale,
    };
    await camera.animateTo(target);
  }

  private centerOnStartVillage(): void {
    if (!this.app || !this.sim) return;
    const local = useGameStore.getState().localPlayerIndex;
    const spawn = this.sim.map.spawns[local];
    if (!spawn) return;
    const camera = this.getCamera();
    const world = hexToPixel(spawn.start, HEX_SIZE);
    const target = {
      x: this.app.screen.width / 2 - world.x * camera.scale,
      y: this.mapHeight() / 2 - world.y * camera.scale,
    };
    camera.pan = { x: target.x, y: target.y - VILLAGE_START_OFFSET };
    this.applyTransform();
    void camera.animateTo(target, false);
  }

  captureSelectedVillage(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const tile = tileAt(this.sim.map, selection.q, selection.r);
    if (!tile?.unit || !tile.settlement || tile.settlement.owner === tile.unit.owner || !tile.settlement.captureReady) return;
    store.setSelection(null);
    this.sendCommand({ type: 'capture', q: selection.q, r: selection.r, unitId: tile.unit.id });
  }

  async handleMapClick(q: number, r: number): Promise<void> {
    if (!this.sim || !this.app) return;
    const store = useGameStore.getState();
    if (store.gameOver) return;
    if (store.paused) return;
    const canAct = !store.aiActive;
    const tile = tileAt(this.sim.map, q, r);
    if (!tile) return;
    // Placement modes (builder / trapper): a tap on a highlighted cell commits
    // the build/trap; any other tap cancels the placement.
    if (this.pendingPlacement || this.pendingTrap) {
      if (this.placementKeys.has(axialKey(tile))) {
        if (this.pendingPlacement) this.buildAsBuilder(this.pendingPlacement.kind, q, r);
        else this.placeTrapOn(q, r);
        store.setSelection(null);
      } else {
        this.cancelPlacement();
      }
      this.render();
      return;
    }
    if (!isExploredFor(tile, store.localPlayerIndex)) {
      if (store.selection) {
        store.setSelection(null);
        this.render();
      }
      return;
    }

    const selection = store.selection;
    if (selection && selection.kind === 'unit' && canAct) {
      const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
      if (unit && unit.type === 'stunner' && this.attackableKeys.has(axialKey(tile))) {
        const dist = hexDistance({ q: selection.q, r: selection.r }, tile);
        if (dist === 2) {
          // Range-2 targets are always stunned.
          store.setSelection(null);
          this.sendCommand({ type: 'stun', unitId: unit.id, q, r });
          return;
        }
        store.setOverlay({ kind: 'stunChoice', target: { q: tile.q, r: tile.r } });
        return;
      }
      if (
        unit &&
        unit.owner === store.localPlayerIndex &&
        this.attackableKeys.has(axialKey(tile)) &&
        this.reachableKeys.has(axialKey(tile))
      ) {
        // The tile is both a siege/attack target and a reachable move
        // destination (a catapult next to an enemy building/village): let the
        // player pick move or attack instead of always attacking.
        store.setOverlay({ kind: 'moveAttack', target: { q: tile.q, r: tile.r } });
        return;
      }
      if (unit && unit.owner === store.localPlayerIndex && this.attackableKeys.has(axialKey(tile))) {
        // Attack immediately, no confirmation dialog.
        store.setSelection(null);
        this.sendCommand({ type: 'attack', unitId: unit.id, q, r });
        return;
      }
      if (unit && this.reachableKeys.has(axialKey(tile))) {
        // A stealthed stalker arriving beside an enemy village will be spotted:
        // ask before committing the move.
        if (this.sim && isMoveStealthed(unit) && adjacentEnemyVillages(this.sim.map, tile, unit.owner).length > 0) {
          store.setOverlay({ kind: 'stalkerReveal', target: { q: tile.q, r: tile.r } });
          return;
        }
        if (unit.shipLevel !== undefined && tile.terrain !== TileType.Water) {
          store.setOverlay({ kind: 'shipLanding', target: { q: tile.q, r: tile.r } });
          return;
        }
        this.sendCommand({ type: 'move', unitId: unit.id, q, r });
        store.setSelection({ kind: 'unit', q: tile.q, r: tile.r });
        sfx.play('click');
        return;
      }
    }

    if (!canAct && selection && selection.kind === 'unit' && selection.q === q && selection.r === r) return;

    const next = cycleSelection(selection, tile);
    store.setSelection(next);
    sfx.play('click');
    if (next.kind === 'unit') {
      const u = tileAt(this.sim.map, next.q, next.r)?.unit;
      if (u && u.owner === store.localPlayerIndex) this.mapView?.bounceUnit(next.q, next.r);
    }
    this.render();
  }

  /** Begins a long-press (touch hold / click-and-hold) on the map. If the
   *  pointer stays still for `DAMAGE_PREVIEW_HOLD_MS`, an expected-damage
   *  preview shows against the enemy under the press — even when it is not a
   *  reachable attack target. A quick tap is unaffected: the preview only fires
   *  after the hold delay, and any tap that follows a fired hold is swallowed so
   *  it does not also select/attack. */
  private beginDamagePreviewHold(e: { global: { x: number; y: number } }): void {
    this.cancelDamagePreviewHold();
    if (!this.mapView || !this.sim) return;
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver || store.paused) return;
    if (store.currentPlayerIndex !== store.localPlayerIndex) return;
    if (!this.textures) return;
    const local = this.mapView.container.toLocal(e.global);
    this.damagePreviewPress = { x: local.x, y: local.y };
    this.suppressNextTap = false;
    const hold = new HoldTimer(DAMAGE_PREVIEW_HOLD_MS);
    this.damagePreviewHold = hold;
    hold.start(() => this.fireDamagePreview());
    this.damagePreviewWindowUp = () => this.hideDamagePreview();
    this.damagePreviewWindowCancel = () => this.hideDamagePreview();
    window.addEventListener('pointerup', this.damagePreviewWindowUp);
    window.addEventListener('pointercancel', this.damagePreviewWindowCancel);
  }

  private fireDamagePreview(): void {
    if (!this.sim || !this.mapView) return;
    if (this.camera?.isDragging) return;
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver || store.paused) return;
    const press = this.damagePreviewPress;
    if (!press) return;
    const tile = pickTileAt(press.x, press.y, HEX_SIZE, this.sim.map.tiles);
    const victim = damagePreviewVictim(this.sim.map, store.selection, store.localPlayerIndex, tile);
    if (!victim || !victim.unit) return;
    const selection = store.selection!;
    const attacker = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!attacker) return;
    this.suppressNextTap = true;
    this.damagePreviewShown = true;
    this.mapView.showDamagePreview(attacker, victim, () => this.render());
    this.render();
  }

  private cancelDamagePreviewHold(): void {
    if (this.damagePreviewHold) {
      this.damagePreviewHold.cancel();
      this.damagePreviewHold = null;
    }
    this.damagePreviewPress = null;
    if (this.damagePreviewWindowUp) {
      window.removeEventListener('pointerup', this.damagePreviewWindowUp);
      this.damagePreviewWindowUp = null;
    }
    if (this.damagePreviewWindowCancel) {
      window.removeEventListener('pointercancel', this.damagePreviewWindowCancel);
      this.damagePreviewWindowCancel = null;
    }
  }

  private hideDamagePreview(): void {
    this.cancelDamagePreviewHold();
    if (!this.damagePreviewShown) return;
    this.damagePreviewShown = false;
    this.mapView?.hideDamagePreview();
    this.render();
  }

  upgradeSelectedVillage(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: 'upgradeVillage', q: selection.q, r: selection.r });
  }

  upgradeSelectedVillageFromToolbar(): void {
    this.upgradeSelectedVillage();
  }

  spawnSelectedVillage(type: UnitType): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: 'spawn', q: selection.q, r: selection.r, unitType: type });
    store.setOverlay(null);
  }

  healSelectedUnit(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex) return;
    this.sendCommand({ type: 'heal', unitId: unit.id });
    store.setSelection(null);
  }

  disbandSelectedUnit(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit' || !this.sim) return;
    const tile = tileAt(this.sim.map, selection.q, selection.r);
    const unit = tile?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex) return;
    if (!canDisband(unit)) return;
    store.setOverlay({ kind: 'disband', unitId: unit.id });
  }

  confirmDisband(): void {
    const store = useGameStore.getState();
    const pending = store.overlay?.kind === 'disband' ? store.overlay.unitId : null;
    store.setOverlay(null);
    if (!pending || !this.sim) return;
    const unit = this.sim.map.tiles.find((t) => t.unit?.id === pending)?.unit;
    if (!unit || !canDisband(unit)) return;
    this.sendCommand({ type: 'disband', unitId: pending });
    store.setSelection(null);
  }

  cancelDisband(): void {
    useGameStore.getState().setOverlay(null);
  }

  enableStealthSelected(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex) return;
    this.sendCommand({ type: 'enableStealth', unitId: unit.id });
    store.setSelection(null);
  }

  /** Builder: enter placement mode for `kind` once the kind was picked in the
   *  building popup. Highlighted cells are tapped to build. */
  beginBuilderPlacement(kind: BuilderBuildKind): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex || unit.type !== 'builder') return;
    this.pendingPlacement = { unitId: unit.id, kind };
    this.pendingTrap = null;
    store.setOverlay(null);
    this.render();
  }

  buildAsBuilder(kind: BuilderBuildKind, q: number, r: number): void {
    const pending = this.pendingPlacement;
    this.pendingPlacement = null;
    this.placementKeys.clear();
    if (!pending || !this.sim) return;
    this.sendCommand({ type: 'build', unitId: pending.unitId, q, r, kind });
  }

  cancelPlacement(): void {
    this.pendingPlacement = null;
    this.pendingTrap = null;
    this.placementKeys.clear();
    useGameStore.getState().setSelection(null);
    this.render();
  }

  /** Trapper: enter trap placement mode. */
  placeTrap(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex || unit.type !== 'trapper') return;
    this.pendingTrap = { unitId: unit.id };
    this.pendingPlacement = null;
    this.render();
  }

  placeTrapOn(q: number, r: number): void {
    const pending = this.pendingTrap;
    this.pendingTrap = null;
    this.placementKeys.clear();
    if (!pending || !this.sim) return;
    this.sendCommand({ type: 'trap', unitId: pending.unitId, q, r });
  }

  stormSelected(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.owner !== store.localPlayerIndex || !stormEligible(this.sim.map, unit)) return;
    this.sendCommand({ type: 'storm', unitId: unit.id });
    store.setSelection(null);
  }

  chooseStunFromDialog(): void {
    const store = useGameStore.getState();
    const pending = store.overlay?.kind === 'stunChoice' ? store.overlay.target : null;
    store.setOverlay(null);
    if (!pending) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit' || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit) return;
    store.setSelection(null);
    this.sendCommand({ type: 'stun', unitId: unit.id, q: pending.q, r: pending.r });
  }

  chooseRegularAttackFromStunDialog(): void {
    const store = useGameStore.getState();
    const pending = store.overlay?.kind === 'stunChoice' ? store.overlay.target : null;
    store.setOverlay(null);
    if (!pending) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit' || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit) return;
    store.setSelection(null);
    this.sendCommand({ type: 'attack', unitId: unit.id, q: pending.q, r: pending.r });
  }

  cancelStun(): void {
    useGameStore.getState().setOverlay(null);
  }

  buildSelectedBuilding(kind: BuildingKind): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: 'build', q: selection.q, r: selection.r, kind });
  }

  repairSelectedBuilding(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: 'repair', q: selection.q, r: selection.r });
  }

  destroySelectedBuilding(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: 'destroyBuilding', q: selection.q, r: selection.r });
  }

  buildSelectedWall(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: 'buildWall', q: selection.q, r: selection.r });
  }

  buildSelectedRoad(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: 'buildRoad', q: selection.q, r: selection.r });
  }

  buildSelectedBridge(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: 'buildBridge', q: selection.q, r: selection.r });
  }

  openSkill(id: SkillId): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    this.sendCommand({ type: 'openSkill', skill: id });
  }

  upgradeSelectedShip(): void {
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver) return;
    const selection = store.selection;
    if (!selection || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.shipLevel === undefined) return;
    this.sendCommand({ type: 'upgradeShip', unitId: unit.id });
  }

  dealWithSelectedPirate(): void {
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit' || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit || unit.type !== 'pirate') return;
    store.setSelection(null);
    this.sendCommand({ type: 'deal', unitId: unit.id });
  }

  /** Cheat (single-player only): grants the local player +100 of every
   *  resource. Returns true when granted. */
  cheatResources(): boolean {
    if (!this.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== 'game' || store.netMode !== 'single') return false;
    const local = this.sim.players[store.localPlayerIndex];
    if (!local) return false;
    local.resources = {
      wood: local.resources.wood + RESOURCE_CHEAT_AMOUNT,
      stone: local.resources.stone + RESOURCE_CHEAT_AMOUNT,
      money: local.resources.money + RESOURCE_CHEAT_AMOUNT,
      ore: local.resources.ore + RESOURCE_CHEAT_AMOUNT,
    };
    this.syncStore();
    this.saveGame();
    return true;
  }

  /** Cheat (single-player only): opens every skill for the local player.
   *  Returns true when granted. */
  cheatOpenAllSkills(): boolean {
    if (!this.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== 'game' || store.netMode !== 'single') return false;
    const local = this.sim.players[store.localPlayerIndex];
    if (!local) return false;
    local.skills = Object.keys(SKILLS) as SkillId[];
    this.syncStore();
    this.saveGame();
    return true;
  }

  /** Cheat (single-player only): reveals the whole map and all tribes for the
   *  local player. Returns true when applied. */
  cheatRemoveFog(): boolean {
    if (!this.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== 'game' || store.netMode !== 'single') return false;
    this.revealMapForLocal();
    return true;
  }

  /** Cheat (single-player only): eliminates every enemy tribe (villages, units
   *  and territory). The local player's next End Turn then resolves the
   *  capture-mode victory. Returns true when applied. */
  cheatWin(): boolean {
    if (!this.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== 'game' || store.netMode !== 'single') return false;
    const local = this.sim.players[store.localPlayerIndex];
    if (!local) return false;
    let any = false;
    for (const p of this.sim.players) {
      if (p.index === store.localPlayerIndex) continue;
      if (this.sim.eliminatePlayer(p.index)) any = true;
    }
    if (!any) return false;
    this.syncStore();
    this.saveGame();
    this.render();
    return true;
  }

  /** Reveal the whole map and every tribe for the local player. */
  private revealMapForLocal(): void {
    if (!this.sim) return;
    const store = useGameStore.getState();
    const local = this.sim.players[store.localPlayerIndex];
    if (!local) return;
    for (const tile of this.sim.map.tiles) {
      if (!(tile.exploredBy ?? []).includes(store.localPlayerIndex)) (tile.exploredBy ??= []).push(store.localPlayerIndex);
    }
    const tribes = this.sim.players.filter((p) => p.index !== local.index).map((p) => p.tribe);
    local.knownTribes = Array.from(new Set([...(local.knownTribes ?? []), ...tribes]));
    this.syncStore();
    this.saveGame();
    this.render();
  }

  /** Distance from `tile` to the AI's nearest own unit, settlement or port. */
  private nearestAiAssetDistance(aiIndex: number, tile: { q: number; r: number }): number {
    const map = this.sim!.map;
    let best = Infinity;
    for (const t of map.tiles) {
      const ownUnit = t.unit !== null && t.unit.owner === aiIndex;
      const ownSettlement = t.settlement !== null && t.settlement.owner === aiIndex;
      const ownPort = t.building !== null && t.building.kind === 'port' && t.ownedBy === aiIndex;
      if (ownUnit || ownSettlement || ownPort) {
        const d = hexDistance(tile, t);
        if (d < best) best = d;
      }
    }
    return best;
  }

  /** Pick an empty water tile the AI can see near its territory, falling back
   *  to any empty water tile. */
  private pirateSpawnTileFor(aiIndex: number): MapTile | null {
    const map = this.sim!.map;
    const water = map.tiles.filter(
      (t) => t.terrain === TileType.Water && !t.unit,
    );
    const explored = water.filter((t) => (t.exploredBy ?? []).includes(aiIndex));
    // Prefer water the AI has explored that sits 4-9 hexes from its assets:
    // close enough to trigger the naval response, far enough not to be an
    // instant ambush.
    const near = explored.filter((t) => {
      const d = this.nearestAiAssetDistance(aiIndex, t);
      return Number.isFinite(d) && d >= 4 && d <= 9;
    });
    const pool = near.length > 0 ? near : explored.length > 0 ? explored : water;
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }

  /** Next free pirate unit id (`pirate-N`), matching natural spawn ids. */
  private nextPirateId(): string {
    const used = new Set<string>();
    for (const t of this.sim!.map.tiles) if (t.unit && t.unit.type === 'pirate') used.add(t.unit.id);
    let n = 1;
    while (used.has(`pirate-${n}`)) n++;
    return `pirate-${n}`;
  }

  /** Cheat (single-player only): spawns 5 pirates near randomly chosen AI
   *  tribes so their naval response can be observed. Returns true when at
   *  least one pirate was placed. */
  cheatSpawnPirates(): boolean {
    if (!this.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== 'game' || store.netMode !== 'single') return false;
    const local = this.sim.players[store.localPlayerIndex];
    if (!local) return false;
    const ais = this.sim.players.filter(
      (p) => p.index !== local.index && p.isActive && !p.isHuman,
    );
    if (ais.length === 0) return false;
    const map = this.sim.map;
    let spawned = 0;
    for (let i = 0; i < 5; i++) {
      const ai = ais[Math.floor(Math.random() * ais.length)]!;
      const tile = this.pirateSpawnTileFor(ai.index);
      if (!tile) continue;
      tile.unit = makeUnit(PIRATE_OWNER, 'pirate', tile.q, tile.r, {
        id: this.nextPirateId(),
      });
      spawned++;
    }
    if (spawned === 0) return false;
    this.syncStore();
    this.saveGame();
    this.render();
    return true;
  }

  /** Cheat: toggles AI decision logging; returns the new on/off state. */
  cheatToggleAiLogs(): boolean {
    return setAiLogging(!aiLoggingEnabled());
  }

  confirmShipLanding(): void {
    const store = useGameStore.getState();
    const pending = store.overlay?.kind === 'shipLanding' ? store.overlay.target : null;
    store.setOverlay(null);
    if (!pending) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit' || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)!.unit;
    if (!unit) return;
    this.sendCommand({ type: 'shipLanding', unitId: unit.id, q: pending.q, r: pending.r });
    store.setSelection(null);
  }

  cancelShipLanding(): void {
    useGameStore.getState().setOverlay(null);
  }

  confirmStalkerApproach(): void {
    const store = useGameStore.getState();
    const pending = store.overlay?.kind === 'stalkerReveal' ? store.overlay.target : null;
    store.setOverlay(null);
    if (!pending) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit' || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit) return;
    this.sendCommand({ type: 'move', unitId: unit.id, q: pending.q, r: pending.r });
    store.setSelection({ kind: 'unit', q: pending.q, r: pending.r });
    sfx.play('click');
  }

  cancelStalkerApproach(): void {
    useGameStore.getState().setOverlay(null);
  }

  chooseMoveFromDialog(): void {
    const store = useGameStore.getState();
    const pending = store.overlay?.kind === 'moveAttack' ? store.overlay.target : null;
    store.setOverlay(null);
    if (!pending) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit' || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit) return;
    this.sendCommand({ type: 'move', unitId: unit.id, q: pending.q, r: pending.r });
    store.setSelection({ kind: 'unit', q: pending.q, r: pending.r });
    sfx.play('click');
  }

  chooseAttackFromDialog(): void {
    const store = useGameStore.getState();
    const pending = store.overlay?.kind === 'moveAttack' ? store.overlay.target : null;
    store.setOverlay(null);
    if (!pending) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit' || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
    if (!unit) return;
    store.setSelection(null);
    this.sendCommand({ type: 'attack', unitId: unit.id, q: pending.q, r: pending.r });
  }

  cancelMoveAttack(): void {
    useGameStore.getState().setOverlay(null);
  }

  endTurn(): void {
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver || store.paused) return;
    store.setAiActive(true);
    this.sendCommand({ type: 'endTurn' });
  }

  watchGame(): void {
    const store = useGameStore.getState();
    if (store.overlay?.kind === 'watchingPrompt') store.setOverlay(null);
    this.revealMapForLocal();
    store.setWatching(true);
    void this.runWatchLoop();
  }

  finishGameNow(): void {
    const store = useGameStore.getState();
    if (store.overlay?.kind === 'watchingPrompt') store.setOverlay(null);
    if (!this.sim) return;
    this.sim.endNow();
    this.syncStore();
  }

  exitWatching(): void {
    useGameStore.getState().setWatching(false);
    confirmLeaveGame();
  }

  private async runWatchLoop(): Promise<void> {
    if (this.watchingLoopRunning) return;
    this.watchingLoopRunning = true;
    try {
      while (useGameStore.getState().watching && this.sim && !this.sim.gameOver) {
        await this.runCommand({ type: 'endTurn' });
        await new Promise((resolve) => setTimeout(resolve, SPECTATE_ROUND_DELAY_MS));
      }
    } finally {
      this.watchingLoopRunning = false;
    }
  }

  hostGame(opts: { mode: GameMode; totalPlayers: number; aiCount: number; name: string; tribe: Tribe; mapSize?: MapSize }): string {
    return this.getNetwork().hostGame(opts);
  }

  cancelLobby(): void {
    this.getNetwork().cancelLobby();
  }

  pickHostTribe(tribe: Tribe): void {
    this.getNetwork().pickHostTribe(tribe);
  }

  startHostGame(): Promise<void> {
    return this.getNetwork().startHostGame();
  }

  handleClientClosed(peerId: string): void {
    this.getNetwork().handleClientClosed(peerId);
  }

  /** Host: dismiss the disconnect modal but keep the game paused (wait). */
  waitForDisconnected(): void {
    this.getNetwork().waitForDisconnected();
  }

  /** Host: hand the offline player's seat to the AI and resume. */
  giveDisconnectedToAI(): Promise<void> {
    const index = this.getNetwork().offlinePlayerIndex();
    if (index === null) {
      useGameStore.getState().setPaused(null);
      return Promise.resolve();
    }
    return this.getNetwork().giveDisconnectedToAI(index);
  }

  /** Host: forfeit the offline player and resume. */
  forfeitDisconnected(): Promise<void> {
    const index = this.getNetwork().offlinePlayerIndex();
    if (index === null) {
      useGameStore.getState().setPaused(null);
      return Promise.resolve();
    }
    return this.getNetwork().forfeitDisconnected(index);
  }

  joinGame(code: string, name: string, relayUrl?: string): void {
    this.getNetwork().joinGame(code, name, relayUrl);
  }

  /** Rejoins the last active multiplayer client match (if still fresh). */
  rejoinGame(): void {
    const match = activeMatchStore.loadFresh();
    if (match) this.getNetwork().joinGame(match.code, match.name, match.relayUrl);
  }

  pickClientTribe(tribe: Tribe): void {
    this.getNetwork().pickClientTribe(tribe);
  }

  readyUp(): void {
    this.getNetwork().readyUp();
  }

  claimBonus(): void {
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver) return;
    this.sendCommand({ type: 'claimBonus' });
  }

  getBottle(): void {
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver) return;
    this.sendCommand({ type: 'getBottle' });
  }

  private sendCommand(cmd: Command): void {
    const store = useGameStore.getState();
    if (store.netMode === 'client') {
      const network = this.getNetwork();
      if (!this.tryOptimisticClientCommand(cmd)) network.sendClientCommand(cmd);
    } else {
      void this.runCommand(cmd);
    }
  }

  /** Deterministic commands are predicted locally: the command is applied to a
   *  clone of the mirror and its events are presented immediately, so the map
   *  updates without waiting for the host round-trip. The authoritative reply is
   *  reconciled silently (see NetworkController.onHostMessage). Returns true when
   *  an optimistic prediction was made. */
  private tryOptimisticClientCommand(cmd: Command): boolean {
    const store = useGameStore.getState();
    if (!this.sim || this.sim.gameOver) return false;
    if (store.aiActive) return false;
    if (!this.app || !this.textures) return false;
    if (store.localPlayerIndex !== this.sim.currentPlayerIndex) return false;
    if (!Simulator.isPredictable(cmd)) return false;
    const preExplored = this.exploredKeysFor(store.localPlayerIndex);
    const predicted = Simulator.fromSnapshot(this.sim.snapshot());
    if (!predicted.applyCommand(cmd)) return false;
    const predictedEvents = predicted.drainEvents();
    const network = this.getNetwork();
    this.sim = predicted;
    this.syncStore();
    network.sendClientCommand(cmd);
    network.noteClientPrediction();
    void this.enqueue(async () => {
      if (useGameStore.getState().netMode !== 'client') return;
      await this.presentEvents(predictedEvents, preExplored);
      this.render();
    });
    return true;
  }

  private onHostMessage(msg: HostMessage): void {
    this.getNetwork().onHostMessage(msg);
  }

  private render(): void {
    if (!this.app || !this.sim || !this.textures) return;
    markDirty();
    const store = useGameStore.getState();

    if (!this.mapView) {
      const camera = this.getCamera();
      this.mapView = new MapView(this.app, this.textures, HEX_SIZE, 1 / camera.qualityFactor, camera.qualityFactor);
      this.mapView.container.eventMode = 'static';
      this.mapView.container.on('wheel', (e) => {
        if (!this.mapView) return;
        camera.handleWheel(e.deltaY, { x: e.global.x, y: e.global.y });
      });
      this.mapView.container.on('pointermove', (e) => {
        camera.handlePointerMove(e.pointerId, { x: e.global.x, y: e.global.y });
        if (camera.isDragging) this.hideDamagePreview();
      });
      this.mapView.container.on('pointerdown', (e) => {
        camera.handlePointerDown(e.pointerId, { x: e.global.x, y: e.global.y });
        this.beginDamagePreviewHold(e);
      });
      this.mapView.container.on('pointertap', (e) => {
        if (!this.mapView || camera.isDragging) return;
        // A hold that fired the damage preview swallows the tap that follows
        // its release, so releasing the hold does not also select/attack.
        if (this.suppressNextTap) {
          this.suppressNextTap = false;
          return;
        }
        const local = this.mapView.container.toLocal(e.global);
        const tile = pickTileAt(local.x, local.y, HEX_SIZE, this.sim!.map.tiles);
        if (tile) {
          this.handleMapClick(tile.q, tile.r);
        }
      });
      this.mapRoot!.addChild(this.mapView.container);
      this.mapRoot!.addChild(this.mapView.markerLayer);
      this.mapRoot!.addChild(this.mapView.overlay);
      this.mapRoot!.addChild(this.mapView.badgeLayer);
      if (this.edgeLayerTarget) this.mapView.attachEdgeLayerTo(this.edgeLayerTarget);
    }

    this.reachableKeys = new Set<string>();
    this.attackableKeys = new Set<string>();
    this.placementKeys = new Set<string>();
    if (this.pendingPlacement && store.selection) {
      const tile = tileAt(this.sim.map, store.selection.q, store.selection.r);
      const unit = tile?.unit;
      if (unit && unit.owner === store.localPlayerIndex) {
        const p = store.players[store.localPlayerIndex]!;
        this.placementKeys = new Set(builderBuildable(this.sim.map, tile!, this.pendingPlacement.kind, p).map((t) => axialKey(t)));
      }
    } else if (this.pendingTrap && store.selection) {
      const tile = tileAt(this.sim.map, store.selection.q, store.selection.r);
      const unit = tile?.unit;
      if (unit && unit.owner === store.localPlayerIndex) {
        this.placementKeys = new Set(trapCells(this.sim.map, tile!).map((t) => axialKey(t)));
      }
    }
    const isLocalTurn = store.currentPlayerIndex === store.localPlayerIndex && !store.aiActive;
    const selection = store.selection;
    if (isLocalTurn && selection && selection.kind === 'unit') {
      const tile = tileAt(this.sim.map, selection.q, selection.r);
      const unit = tile?.unit;
      if (unit && unit.owner === store.localPlayerIndex && canMove(unit)) {
        const canClimb = hasSkill(store.players[unit.owner]!, 'climbing');
        const canDock = hasSkill(store.players[unit.owner]!, 'navigation');
        this.reachableKeys = new Set(reachableTargets(this.sim.map, unit, movePoints(unit), canClimb, canDock, store.localPlayerIndex).map((t) => axialKey(t)));
      }
      if (unit && unit.owner === store.localPlayerIndex && canAttack(unit)) {
        this.attackableKeys = new Set(attackableTargets(this.sim.map, unit, store.localPlayerIndex).map((t) => axialKey(t)));
      }
    }

    this.mapView.update(
      this.sim.map,
      store.players,
      selection,
      this.reachableKeys,
      this.attackableKeys,
      store.localPlayerIndex,
      this.hiddenUnitIds,
      {
        x: this.camera!.pan.x,
        y: this.camera!.pan.y,
        scale: this.camera!.scale,
        width: this.app.screen.width,
        height: this.mapHeight(),
        zoomOut: this.zoomOut(),
      },
      this.tutorialMarkerKeys(),
      isLocalTurn,
      this.placementKeys.size > 0 ? this.placementKeys : undefined,
    );
    this.overlayItems = this.mapView.overlayItems;
    this.detailHidden = this.zoomOut() > ZOOM_DETAIL_HIDE;
    this.applyTransform();
  }
}

export const gameController = new GameController();
