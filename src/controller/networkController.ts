import { Application } from 'pixi.js';
import { Simulator, Command } from '../game/simulator';
import { GameStateSnapshot, stripUndefinedValues } from '../game/state';
import { GameEvent } from '../game/events';
import { HostSession, ClientSession, generateRoomCode, ClientMessage, HostMessage, LobbyPlayer } from '../net/peerSession';
import { buildMultiplayerPlayers } from '../game/players';
import { generateMap } from '../game/mapGen';
import { initialExplorationFor } from '../game/explore';
import { Tribe } from '../game/tribes';
import { useGameStore } from '../store/gameStore';
import { loadSettings } from '../storage/settings';
import { SeededRandom } from '../util/random';
import { GameMode } from '../game/gameMode';
import { createTextures, TextureSet } from '../render/textureFactory';

export interface HostPlayerEntry {
  peerId: string;
  name: string;
  tribeId: Tribe | null;
  playerIndex: number | null;
  ready: boolean;
  online: boolean;
}

export interface NetworkHost {
  app(): Application | null;
  sim(): Simulator | null;
  setSim(sim: Simulator): void;
  setTextures(textures: TextureSet): void;
  enqueue(task: () => Promise<void>): Promise<void>;
  render(): void;
  syncStore(): void;
  syncKnownTribes(notify: boolean): void;
  exploredKeysFor(playerIndex: number): Set<string>;
  presentEvents(events: GameEvent[], pre: Set<string>): Promise<void>;
  adoptSnapshot(snap: GameStateSnapshot): void;
  applyFitToScreen(): void;
  centerOnStartVillage(): void;
  cameraQualityFactor(): number;
  runCommand(cmd: Command): Promise<void>;
}

export class NetworkController {
  hostPlayers: HostPlayerEntry[] = [];
  hostSession: HostSession | null = null;
  hostName = '';
  hostTribe: Tribe | null = null;
  hostConfig: { mode: GameMode; totalPlayers: number; aiCount: number } | null = null;
  clientSession: ClientSession | null = null;
  clientName = '';
  private canceled = false;
  private pendingClientEvents: GameEvent[] = [];
  private pendingPreExplored: Set<string> | null = null;

  constructor(private readonly host: NetworkHost) {}

  hostGame(opts: { mode: GameMode; totalPlayers: number; aiCount: number; name: string; tribe: Tribe }): string {
    this.canceled = false;
    const code = generateRoomCode();
    this.hostConfig = { mode: opts.mode, totalPlayers: opts.totalPlayers, aiCount: opts.aiCount };
    this.hostName = opts.name;
    this.hostTribe = opts.tribe;
    this.hostPlayers = [];
    this.hostSession = new HostSession({
      onReady: () => {
        if (this.canceled) return;
        useGameStore.getState().setConnection('connected');
      },
      onOpen: (peerId) => {
        this.hostPlayers.push({ peerId, name: '', tribeId: null, playerIndex: null, ready: false, online: true });
        this.broadcastLobby();
      },
      onData: (peerId, msg) => this.onHostData(peerId, msg),
      onClose: (peerId) => {
        this.handleClientClosed(peerId);
      },
      onError: (err) => {
        if (this.canceled) return;
        const s = useGameStore.getState();
        s.setConnection('error');
        s.setConnectionMessage(err?.message ?? 'Could not set up the room.');
      },
    });
    this.hostSession.open(code);
    const store = useGameStore.getState();
    store.setNetMode('host');
    store.setLocalPlayerIndex(0);
    store.setConnection('connecting');
    store.setConnectionMessage('');
    store.setLobby({
      role: 'host',
      code,
      mode: opts.mode,
      totalPlayers: opts.totalPlayers,
      aiCount: opts.aiCount,
      players: this.lobbyPlayers(),
    });
    store.setScreen('lobby');
    return code;
  }

  private lobbyPlayers(): LobbyPlayer[] {
    return [
      { peerId: 'host', name: this.hostName, tribeId: this.hostTribe, isHost: true, ready: true },
      ...this.hostPlayers.map((p) => ({ peerId: p.peerId, name: p.name, tribeId: p.tribeId, isHost: false, ready: p.ready })),
    ];
  }

  pickHostTribe(tribe: Tribe): void {
    this.hostTribe = tribe;
    this.broadcastLobby();
  }

  private broadcastLobby(): void {
    if (!this.hostConfig) return;
    const joined = this.lobbyPlayers();
    const store = useGameStore.getState();
    store.setLobby({
      role: 'host',
      code: store.lobby?.code ?? '',
      mode: this.hostConfig.mode,
      totalPlayers: this.hostConfig.totalPlayers,
      aiCount: this.hostConfig.aiCount,
      players: joined,
    });
    this.hostSession?.broadcast({ type: 'lobbyUpdate', joined, totalPlayers: this.hostConfig.totalPlayers, aiCount: this.hostConfig.aiCount });
  }

  private onHostData(peerId: string, msg: ClientMessage): void {
    switch (msg.type) {
      case 'join': {
        const entry = this.hostPlayers.find((p) => p.peerId === peerId);
        if (entry) entry.name = msg.name;
        this.broadcastLobby();
        break;
      }
      case 'pickTribe': {
        const entry = this.hostPlayers.find((p) => p.peerId === peerId);
        if (entry) entry.tribeId = msg.tribeId;
        this.broadcastLobby();
        break;
      }
      case 'ready': {
        const entry = this.hostPlayers.find((p) => p.peerId === peerId);
        if (entry) entry.ready = true;
        this.broadcastLobby();
        break;
      }
      case 'command':
        this.handleClientCommand(peerId, msg.cmd);
        break;
    }
  }

  private handleClientCommand(peerId: string, cmd: Command): void {
    this.host.enqueue(async () => {
      const sim = this.host.sim();
      if (!sim || sim.gameOver) return;
      const entry = this.hostPlayers.find((p) => p.peerId === peerId);
      if (!entry || entry.playerIndex === null) return;
      const playerIndex = entry.playerIndex;
      if (sim.currentPlayerIndex !== playerIndex) return;
      if (!sim.players[playerIndex]!.isHuman) return;
      const preExplored = this.host.exploredKeysFor(useGameStore.getState().localPlayerIndex);
      sim.applyCommand(cmd);
      this.host.syncStore();
      const events = sim.drainEvents();
      this.broadcastBatch(events);
      await this.host.presentEvents(events, preExplored);
      this.host.render();
    });
  }

  broadcastBatch(events: GameEvent[]): void {
    const sim = this.host.sim();
    if (!this.hostSession || !sim) return;
    const snap = sim.snapshot();
    stripUndefinedValues(snap);
    for (const entry of this.hostPlayers) {
      if (entry.playerIndex === null) continue;
      this.hostSession.sendTo(entry.peerId, { type: 'state', state: snap, playerIndex: entry.playerIndex });
    }
    if (events.length > 0) {
      stripUndefinedValues(events);
      this.hostSession.broadcast({ type: 'events', events });
    }
  }

  handleClientClosed(peerId: string): void {
    const entry = this.hostPlayers.find((p) => p.peerId === peerId);
    if (!entry) return;
    if (entry.playerIndex === null) {
      this.hostPlayers = this.hostPlayers.filter((p) => p.peerId !== peerId);
      this.broadcastLobby();
    } else {
      entry.online = false;
      this.broadcastPlayersOnline();
    }
  }

  private broadcastPlayersOnline(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const online = sim.players.map(() => true);
    for (const p of this.hostPlayers) {
      if (p.playerIndex !== null) online[p.playerIndex] = p.online;
    }
    useGameStore.getState().setPlayersOnline(online);
    this.hostSession?.broadcast({ type: 'playersOnline', online });
  }

  async startHostGame(): Promise<void> {
    const store = useGameStore.getState();
    if (!this.hostConfig || this.hostTribe === null) return;
    const humanSlots = this.hostConfig.totalPlayers - this.hostConfig.aiCount;
    const readyClients = this.hostPlayers.filter((p) => p.name && p.tribeId !== null && p.ready);
    const allJoinedReady = this.hostPlayers.every((p) => p.name && p.tribeId !== null && p.ready);
    if (allJoinedReady === false || 1 + readyClients.length !== humanSlots) return;
    const clients = readyClients;
    clients.forEach((p, i) => { p.playerIndex = 1 + i; });
    const humans = [
      { name: this.hostName, tribe: this.hostTribe },
      ...clients.map((p) => ({ name: p.name, tribe: p.tribeId! })),
    ];
    const players = buildMultiplayerPlayers(humans, this.hostConfig.aiCount, new SeededRandom(Math.floor(Math.random() * 100000)), loadSettings().aiDifficulty);
    const map = generateMap(players.length, Math.floor(Math.random() * 100000));
    for (const p of players) initialExplorationFor(map, p.index);
    const sim = new Simulator(map, players, this.hostConfig.mode);
    this.host.setSim(sim);
    sim.startGame();
    const startEvents = sim.drainEvents();
    store.setPlayers(players);
    store.setPlayersOnline(players.map(() => true));
    store.setMode(this.hostConfig.mode);
    store.setExpectedTurns(sim.expectedTurns);
    store.setGameOver(false);
    store.setWinnerIndex(null);
    store.setBonusAwarded(false);
    store.setLocalPlayerIndex(0);
    store.setNetMode('host');
    store.setTurn(1);
    store.setCurrentPlayerIndex(0);
    store.setAiActive(false);
    store.setSelection(null);
    store.setScreen('game');
    store.setOverlay({ kind: 'welcome' });
    this.host.syncKnownTribes(false);
    const start = map.spawns[store.localPlayerIndex]!.start;
    store.setSelection({ kind: 'unit', q: start.q, r: start.r });
    const app = this.host.app();
    if (app) {
      this.host.applyFitToScreen();
      this.host.setTextures(await createTextures(app, map, 40 * this.host.cameraQualityFactor()));
    }
    this.host.render();
    this.host.centerOnStartVillage();
    this.broadcastBatch(startEvents);
  }

  sendClientCommand(cmd: Command): void {
    this.clientSession?.send({ type: 'command', cmd });
  }

  joinGame(code: string, name: string): void {
    this.canceled = false;
    this.clientName = name;
    this.clientSession?.close();
    this.clientSession = null;
    const store = useGameStore.getState();
    store.setNetMode('client');
    store.setConnection('connecting');
    store.setConnectionMessage('');
    store.setLocalPlayerIndex(-1);
    this.clientSession = new ClientSession({
      onOpen: () => {
        store.setConnection('connected');
        store.setConnectionMessage('');
      },
      onData: (msg) => this.onHostMessage(msg),
      onClose: () => {
        if (this.canceled) return;
        store.setConnection('error');
        store.setConnectionMessage('Disconnected from the host.');
      },
      onError: (err) => {
        if (this.canceled) return;
        store.setConnection('error');
        store.setConnectionMessage(err?.message ?? 'Connection failed.');
      },
    });
    this.clientSession.join(code, name);
    const peerId = this.clientSession.getPeerId() ?? '';
    store.setMyPeerId(peerId);
    store.setLobby({
      role: 'client',
      code,
      mode: 'capture',
      totalPlayers: 0,
      aiCount: 0,
      players: [{ peerId, name, tribeId: null, isHost: false, ready: false }],
    });
    store.setScreen('lobby');
  }

  cancelLobby(): void {
    this.canceled = true;
    this.hostSession?.close();
    this.hostSession = null;
    this.hostPlayers = [];
    this.hostConfig = null;
    this.clientSession?.close();
    this.clientSession = null;
    const store = useGameStore.getState();
    store.setLobby(null);
    store.setConnection('idle');
    store.setConnectionMessage('');
    store.setNetMode('single');
    store.setMyPeerId('');
  }

  pickClientTribe(tribe: Tribe): void {
    this.clientSession?.send({ type: 'pickTribe', tribeId: tribe });
  }

  readyUp(): void {
    this.clientSession?.send({ type: 'ready' });
  }

  onHostMessage(msg: HostMessage): void {
    const store = useGameStore.getState();
    switch (msg.type) {
      case 'lobbyUpdate':
        store.setLobby({
          role: 'client',
          code: store.lobby?.code ?? '',
          mode: store.lobby?.mode ?? 'capture',
          totalPlayers: msg.totalPlayers,
          aiCount: msg.aiCount,
          players: msg.joined,
        });
        break;
      case 'state': {
        this.pendingPreExplored = this.host.exploredKeysFor(store.localPlayerIndex);
        store.setLocalPlayerIndex(msg.playerIndex);
        store.setPendingSnapshot(msg.state);
        store.setPlayers(msg.state.players);
        store.setMode(msg.state.mode);
        store.setTurn(msg.state.turn);
        store.setCurrentPlayerIndex(msg.state.currentPlayerIndex);
        store.setGameOver(msg.state.gameOver);
        store.setWinnerIndex(msg.state.winnerIndex);
        store.setExpectedTurns(msg.state.expectedTurns);
        store.setBonusAwarded(msg.state.bonusAwarded);
        store.setAiActive(msg.state.currentPlayerIndex !== msg.playerIndex);
        store.setSelection(null);
        const enteringGame = store.screen !== 'game';
        store.setScreen('game');
        if (enteringGame) store.setOverlay({ kind: 'welcome' });
        if (enteringGame) store.setPlayersOnline(msg.state.players.map(() => true));
        this.host.enqueue(async () => {
          this.host.adoptSnapshot(msg.state);
        });
        break;
      }
      case 'events': {
        const pre = this.pendingPreExplored ?? new Set<string>();
        this.pendingPreExplored = null;
        if (this.host.app()) {
          this.host.enqueue(async () => {
            await this.host.presentEvents(msg.events, pre);
            this.host.render();
          });
        } else {
          this.pendingClientEvents.push(...msg.events);
          this.pendingPreExplored = pre;
        }
        break;
      }
      case 'error':
        store.setConnection('error');
        break;
      case 'playersOnline':
        store.setPlayersOnline(msg.online);
        break;
    }
  }

  presentPendingClientEvents(): void {
    if (!this.host.app() || !this.host.sim()) return;
    const events = this.pendingClientEvents;
    this.pendingClientEvents = [];
    if (events.length > 0) {
      const pre = this.pendingPreExplored ?? new Set<string>();
      this.pendingPreExplored = null;
      this.host.enqueue(async () => {
        await this.host.presentEvents(events, pre);
        this.host.render();
      });
    }
  }
}
