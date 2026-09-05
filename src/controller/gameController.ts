import { Application, Container } from 'pixi.js';
import { Simulator, type Command } from '../game/simulator';
import { GameStateSnapshot } from '../game/state';
import { GameEvent, BuildingKind } from '../game/events';
import type { HostMessage } from '../net/peerSession';
import { axialKey, hexToPixel } from '../game/hex';
import { TileType } from '../game/tileTypes';
import { generateMap, type GameMap } from '../game/mapGen';
import { buildPlayers } from '../game/players';
import { AiDifficulty, DEFAULT_AI_DIFFICULTY } from '../game/aiDifficulty';
import { hasSkill, SkillId } from '../game/skills';
import { attackableTargets } from '../game/combat';
import { moveRange, canMove, canAttack, type UnitType } from '../game/units';
import { cycleSelection, reachableTargets, tileAt } from '../game/selection';
import { type GameMode } from '../game/gameMode';
import { isExploredFor, initialExplorationFor } from '../game/explore';
import { TRIBES, Tribe } from '../game/tribes';
import { MapView, type OverlayItem } from '../render/mapRenderer';
import { pickTileAt } from '../render/tilePick';
import { createTextures } from '../render/textureFactory';
import { useGameStore } from '../store/gameStore';
import { TOOLBAR_HEIGHT } from '../ui/layout';
import { saveRepository } from '../storage/saveGame';
import { attackConfirmationEnabled } from '../storage/settings';
import { SeededRandom } from '../util/random';
import { CameraController } from './cameraController';
import { EventPresenter } from './eventPresenter';
import { NetworkController } from './networkController';
import { TutorialDirector, type TutorialHost } from './tutorialDirector';
import { STEP_CONFIG, skillPulseStep } from '../game/tutorial/tutorialSteps';
import {
  buildTutorialMap,
  buildTutorialPlayers,
  TUTORIAL_CAPITAL,
  TUTORIAL_ENEMY_SHIP_ID,
  TUTORIAL_ENEMY_WARRIOR_ID,
  TUTORIAL_START_WARRIOR_ID,
} from '../game/tutorial/tutorialMap';

const HEX_SIZE = 40;
const VILLAGE_START_OFFSET = 200;

class GameController {
  private app: Application | null = null;
  private mapRoot: Container | null = null;
  private sim: Simulator | null = null;
  private textures: Awaited<ReturnType<typeof createTextures>> | null = null;
  private mapView: MapView | null = null;
  private overlayItems: OverlayItem[] = [];
  private reachableKeys = new Set<string>();
  private attackableKeys = new Set<string>();
  private hiddenUnitIds = new Set<string>();
  private knownTribeIds = new Set<number>();
  private taskQueue: Promise<void> = Promise.resolve();
  private network: NetworkController | null = null;
  private initToken = 0;
  private startVillageIntroPending = false;
  private camera: CameraController | null = null;
  private events: EventPresenter | null = null;
  private tutorial: TutorialDirector | null = null;
  private lastTap = 0;

  init(app: Application, root: Container): void {
    if (this.mapRoot) return;
    this.app = app;
    this.mapRoot = root;
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
      void createTextures(app, this.sim.map, HEX_SIZE * this.getCamera().qualityFactor).then((textures) => {
        if (token === this.initToken) useGameStore.getState().setTexturesLoading(false);
        if (token !== this.initToken || !this.mapRoot) return;
        this.textures = textures;
        this.render();
        this.presentPendingClientEvents();
        if (startIntro) this.centerOnStartVillage();
      });
    }
  }

  shutdown(): void {
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
    this.app = null;
    this.tutorial = null;
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
    store.setPlayers([...this.sim.players]);
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
        const tribe = TRIBES.find((t) => t.id === tribeId);
        if (!tribe) return;
        setTimeout(() => useGameStore.getState().setCenterMessage(`You meet ${tribe.name}!`), i * 1100);
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
      this.syncStore();
      if (ok) this.saveGame();
      const events = this.sim.drainEvents();
      if (store.netMode === 'host') this.getNetwork().broadcastBatch(events);
      await this.presentEvents(events, preExplored);
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

  async startGame(tribe: Tribe, enemyCount: number, mode: GameMode, difficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY): Promise<void> {
    const store = useGameStore.getState();
    this.tutorial = null;
    store.setTutorial(false);
    store.setTutorialStep(null);
    store.setTutorialHighlightSkills([]);
    store.setTutorialHighlightEndTurn(false);
    const players = buildPlayers(tribe, enemyCount, new SeededRandom(Math.floor(Math.random() * 100000)), difficulty);
    const map = generateMap(players.length, Math.floor(Math.random() * 100000));
    for (const p of players) initialExplorationFor(map, p.index);
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
    store.setOverlay({ kind: 'welcome' });
    this.syncKnownTribes(false);
    const start = map.spawns[store.localPlayerIndex]!.start;
    store.setSelection({ kind: 'unit', q: start.q, r: start.r });
    if (this.app) {
      this.applyFitToScreen();
      this.textures = await createTextures(this.app, map, HEX_SIZE * this.getCamera().qualityFactor);
    }
    this.render();
    this.centerOnStartVillage();
    this.saveGame();
  }

  startTutorial(): Promise<void> {
    const store = useGameStore.getState();
    const players = buildTutorialPlayers();
    const map = buildTutorialMap();
    this.sim = new Simulator(map, players, 'turns30');
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
    return this.app ? this.app.screen.height - TOOLBAR_HEIGHT : 0;
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
        setTextures: (textures) => { this.textures = textures; },
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

  private applyTransform(): void {
    if (!this.mapView || !this.camera) return;
    const camera = this.camera;
    const scale = camera.scale;
    this.mapView.container.scale.set(scale, scale);
    this.mapView.container.position.set(camera.pan.x, camera.pan.y);
    this.mapView.container.hitArea = camera.viewportRect();
    for (const item of this.overlayItems) {
      item.el.position.set(camera.pan.x + item.world.x * scale, camera.pan.y + item.world.y * scale);
    }
    if (this.app) {
      this.mapView.setViewport({
        x: camera.pan.x,
        y: camera.pan.y,
        scale,
        width: this.app.screen.width,
        height: this.mapHeight(),
      });
    }
  }

  private resetView(): void {
    this.getCamera().resetView();
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
    if (store.aiActive || store.gameOver) return;
    const tile = tileAt(this.sim.map, q, r);
    if (!tile) return;
    if (!isExploredFor(tile, store.localPlayerIndex)) {
      if (store.selection) {
        store.setSelection(null);
        this.render();
      }
      return;
    }

    const selection = store.selection;
    if (selection && selection.kind === 'unit') {
      const unit = tileAt(this.sim.map, selection.q, selection.r)?.unit;
      if (unit && unit.owner === store.localPlayerIndex && this.attackableKeys.has(axialKey(tile))) {
        if (attackConfirmationEnabled()) {
          store.setOverlay({ kind: 'confirm', target: { q, r } });
          return;
        }
        // Confirmation disabled: attack immediately.
        store.setSelection(null);
        this.sendCommand({ type: 'attack', unitId: unit.id, q, r });
        return;
      }
      if (unit && this.reachableKeys.has(axialKey(tile))) {
        if (unit.shipLevel !== undefined && tile.terrain !== TileType.Water) {
          store.setOverlay({ kind: 'shipLanding', target: { q: tile.q, r: tile.r } });
          return;
        }
        this.sendCommand({ type: 'move', unitId: unit.id, q, r });
        store.setSelection({ kind: 'unit', q: tile.q, r: tile.r });
        return;
      }
    }

    const next = cycleSelection(selection, tile);
    store.setSelection(next);
    if (next.kind === 'unit') {
      const u = tileAt(this.sim.map, next.q, next.r)?.unit;
      if (u && u.owner === store.localPlayerIndex) this.mapView?.bounceUnit(next.q, next.r);
    }
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

  confirmAttack(): void {
    const store = useGameStore.getState();
    const pending = store.overlay?.kind === 'confirm' ? store.overlay.target : null;
    const selection = store.selection;
    store.setOverlay(null);
    if (!pending || !selection || selection.kind !== 'unit' || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)!.unit;
    if (!unit) return;
    this.sendCommand({ type: 'attack', unitId: unit.id, q: pending.q, r: pending.r });
    store.setSelection(null);
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
    if (!selection || selection.kind !== 'unit' || !this.sim) return;
    const unit = tileAt(this.sim.map, selection.q, selection.r)!.unit;
    if (!unit) return;
    this.sendCommand({ type: 'heal', unitId: unit.id });
    store.setSelection(null);
  }

  buildSelectedBuilding(kind: BuildingKind): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    this.sendCommand({ type: 'build', q: selection.q, r: selection.r, kind });
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

  cancelAttack(): void {
    useGameStore.getState().setOverlay(null);
  }

  endTurn(): void {
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver) return;
    store.setAiActive(true);
    store.setSelection(null);
    this.sendCommand({ type: 'endTurn' });
  }

  hostGame(opts: { mode: GameMode; totalPlayers: number; aiCount: number; name: string; tribe: Tribe }): string {
    return this.getNetwork().hostGame(opts);
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

  joinGame(code: string, name: string): void {
    this.getNetwork().joinGame(code, name);
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

  private sendCommand(cmd: Command): void {
    const store = useGameStore.getState();
    if (store.netMode === 'client') {
      this.getNetwork().sendClientCommand(cmd);
    } else {
      void this.runCommand(cmd);
    }
  }

  private onHostMessage(msg: HostMessage): void {
    this.getNetwork().onHostMessage(msg);
  }

  private render(): void {
    if (!this.app || !this.sim || !this.textures) return;
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
      });
      this.mapView.container.on('pointerdown', (e) => {
        camera.handlePointerDown(e.pointerId, { x: e.global.x, y: e.global.y });
      });
      this.mapView.container.on('pointertap', (e) => {
        if (!this.mapView || camera.isDragging) return;
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
      this.mapRoot!.addChild(this.mapView.container);
      this.mapRoot!.addChild(this.mapView.overlay);
    }

    this.reachableKeys = new Set<string>();
    this.attackableKeys = new Set<string>();
    const selection = store.selection;
    if (selection && selection.kind === 'unit') {
      const tile = tileAt(this.sim.map, selection.q, selection.r);
      const unit = tile?.unit;
      if (unit && unit.owner === store.localPlayerIndex && canMove(unit)) {
        const canClimb = hasSkill(store.players[unit.owner]!, 'climbing');
        const canDock = hasSkill(store.players[unit.owner]!, 'navigation');
        this.reachableKeys = new Set(reachableTargets(this.sim.map, unit, moveRange(unit, tileAt(this.sim.map, unit.q, unit.r), this.sim.map), canClimb, canDock, store.localPlayerIndex).map((t) => axialKey(t)));
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
      },
      this.tutorialMarkerKeys(),
    );
    this.overlayItems = this.mapView.overlayItems;
    this.applyTransform();
  }
}

export const gameController = new GameController();
