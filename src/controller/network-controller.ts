import { Application } from 'pixi.js';
import { Simulator, type Command } from '../game/simulator';
import { t } from '../i18n';
import { type GameStateSnapshot, stripUndefinedValues } from '../game/state';
import { type GameEvent } from '../game/events';
import { generateRoomCode, type ClientMessage, type HostMessage, type LobbyPlayer } from '../net/peer-session';
import { RelayHostSession, RelayClientSession } from '../net/relay-session';
import { resolveRelayUrl } from '../net/relay-session';
import { buildMultiplayerPlayers } from '../game/players';
import { generateMap } from '../game/map/map-gen';
import { initialExplorationFor } from '../game/map/explore';
import { exploreVillageSights } from '../game/economy/village';
import { runSliced, SIM_SLICE_BUDGET_MS } from '../util/time-slice';
import { Tribe } from '../game/tribes';
import { beginMatchState, useGameStore } from '../store/game-store';
import { loadSettings, welcomeDismissed } from '../storage/settings';
import { SeededRandom } from '../util/random';
import { seasonForTurn } from '../game/season';
import { createTextures, type TextureSet } from '../render/texture-factory';
import { activeMatchStore } from '../storage/active-match';
import { ClientMessageType, CommandType, ConnectionState, GameMode, HostMessageType, LobbyRole, NetMode, OverlayKind, PauseReason, Screen, SelectionKind } from '@enums';
import { weatherCopies } from '../game/weather/weather';
import { randomSeed } from '../util/random';

/** How long a dropped player stays unmarked-by-modal before the host pause
 *  modal fires: transient network flaps (or a fast refresh) that resolve within
 *  the window never spam the host with "Player disconnected". */
export const DISCONNECT_GRACE_MS = 4000;

interface HostPlayerEntry {
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
  hostSession: RelayHostSession | null = null;
  hostName = '';
  hostTribe: Tribe | null = null;
  hostConfig: { mode: GameMode; totalPlayers: number; aiCount: number } | null = null;
  clientSession: RelayClientSession | null = null;
  clientName = '';
  hostStarted = false;
  private canceled = false;
  /** Seats handed to the AI after a disconnect. If the owner rejoins they are
   *  flipped back to human and take the seat over again. */
  private aiTakeoverSeats = new Set<number>();
  private pendingClientEvents: GameEvent[] = [];
  private pendingPreExplored: Set<string> | null = null;
  private predictedPending = 0;
  /** Per-player timers that fire the disconnect pause only after the drop
   *  outlives the grace window (cancelled on rejoin). */
  private disconnectPauseTimers = new Map<number, ReturnType<typeof setTimeout>>();
  /** Number of events batches to skip — one per optimistically predicted
   *  command answered by the host. A count, not a boolean: with two commands
   *  in flight (e.g. move then heal) two skip-requests are queued, and each
   *  reply's `events` consumes exactly one. A state that consumed no pending
   *  prediction resets the queue as stale. */
  private eventsToSkip = 0;

  constructor(private readonly host: NetworkHost) {}

  hostGame(opts: { mode: GameMode; totalPlayers: number; aiCount: number; name: string; tribe: Tribe }): string {
    this.canceled = false;
    this.hostStarted = false;
    // Hosting is not a client match — drop any saved rejoin for it.
    activeMatchStore.clear();
    const code = generateRoomCode();
    this.hostConfig = { mode: opts.mode, totalPlayers: opts.totalPlayers, aiCount: opts.aiCount };
    this.hostName = opts.name;
    this.hostTribe = opts.tribe;
    this.hostPlayers = [];
    this.hostSession = new RelayHostSession({
      onReady: () => {
        if (this.canceled) return;
        this.hostPlayers = [];
        const s = useGameStore.getState();
        s.setConnection(ConnectionState.CONNECTED);
        if (!this.hostStarted && s.lobby && s.lobby.role === LobbyRole.HOST) this.broadcastLobby();
      },
      onClientJoined: (clientId) => {
        if (this.hostStarted) return;
        this.hostPlayers.push({ peerId: clientId, name: '', tribeId: null, playerIndex: null, ready: false, online: true });
        this.broadcastLobby();
      },
      onData: (clientId, msg) => this.onHostData(clientId, msg),
      onClientClosed: (clientId) => {
        this.handleClientClosed(clientId);
      },
      onError: (err) => {
        if (this.canceled) return;
        const s = useGameStore.getState();
        s.setConnection(ConnectionState.ERROR);
        s.setConnectionMessage(err?.message ?? t('lobby.connectionError'));
      },
    });
    this.hostSession.open(code);
    const store = useGameStore.getState();
    store.setNetMode(NetMode.HOST);
    store.setLocalPlayerIndex(0);
    store.setConnection(ConnectionState.CONNECTING);
    store.setConnectionMessage('');
    store.setLobby({
      role: LobbyRole.HOST,
      code,
      mode: opts.mode,
      totalPlayers: opts.totalPlayers,
      aiCount: opts.aiCount,
      players: this.lobbyPlayers(),
    });
    store.setScreen(Screen.LOBBY);
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
      role: LobbyRole.HOST,
      code: store.lobby?.code ?? '',
      mode: this.hostConfig.mode,
      totalPlayers: this.hostConfig.totalPlayers,
      aiCount: this.hostConfig.aiCount,
      players: joined,
    });
    this.hostSession?.broadcast({ type: HostMessageType.LOBBY_UPDATE, joined, totalPlayers: this.hostConfig.totalPlayers, aiCount: this.hostConfig.aiCount });
  }

  private onHostData(peerId: string, msg: ClientMessage): void {
    switch (msg.type) {
      case ClientMessageType.JOIN: {
        if (this.hostStarted) {
          this.bindInGameClient(peerId, msg.name);
          break;
        }
        const entry = this.hostPlayers.find((p) => p.peerId === peerId);
        if (entry) entry.name = msg.name;
        this.broadcastLobby();
        break;
      }
      case ClientMessageType.PICK_TRIBE: {
        const entry = this.hostPlayers.find((p) => p.peerId === peerId);
        if (entry) entry.tribeId = msg.tribeId;
        this.broadcastLobby();
        break;
      }
      case ClientMessageType.READY: {
        const entry = this.hostPlayers.find((p) => p.peerId === peerId);
        if (entry) entry.ready = true;
        this.broadcastLobby();
        break;
      }
      case ClientMessageType.COMMAND:
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
      if (cmd.type === CommandType.END_TURN) await runSliced(sim.applyCommandSteps(cmd), SIM_SLICE_BUDGET_MS);
      else sim.applyCommand(cmd);
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
      this.hostSession.sendTo(entry.peerId, { type: HostMessageType.STATE, state: snap, playerIndex: entry.playerIndex });
    }
    if (events.length > 0) {
      stripUndefinedValues(events);
      this.hostSession.broadcast({ type: HostMessageType.EVENTS, events });
    }
    // The turn may have rotated to a player whose connection is still down:
    // schedule the freeze so the host can resolve it (after the grace window).
    this.schedulePauseForDisconnect(sim.currentPlayerIndex);
  }

  private bindInGameClient(peerId: string, name: string): void {
    const sim = this.host.sim();
    if (!sim) return;
    let human = sim.players.find((p) => p.isHuman && p.index !== 0 && p.name === name);
    if (!human) {
      // A seat that was handed to the AI after a disconnect can be taken back.
      const takeover = sim.players.find((p) => p.index !== 0 && p.name === name && this.aiTakeoverSeats.has(p.index));
      if (takeover) {
        takeover.isHuman = true;
        this.aiTakeoverSeats.delete(takeover.index);
        human = takeover;
      }
    }
    if (!human) return;
    let entry = this.hostPlayers.find((h) => h.playerIndex === human.index);
    if (entry) {
      entry.peerId = peerId;
      entry.name = name;
      entry.tribeId = human.tribe;
      entry.ready = true;
      entry.online = true;
    } else {
      this.hostPlayers.push({ peerId, name, tribeId: human.tribe, playerIndex: human.index, ready: true, online: true });
    }
    const snap = sim.snapshot();
    stripUndefinedValues(snap);
    this.hostSession?.sendTo(peerId, { type: HostMessageType.STATE, state: snap, playerIndex: human.index });
    this.broadcastPlayersOnline();
    this.cancelDisconnectTimer(human.index);
    useGameStore.getState().setPaused(null);
  }

  handleClientClosed(peerId: string): void {
    const entry = this.hostPlayers.find((p) => p.peerId === peerId);
    if (!entry) return;
    if (entry.playerIndex === null) {
      this.hostPlayers = this.hostPlayers.filter((p) => p.peerId !== peerId);
      this.broadcastLobby();
    } else {
      // Already offline: a duplicate relay close must not re-broadcast the
      // presence change or re-pause the game.
      if (!entry.online) return;
      entry.online = false;
      this.broadcastPlayersOnline();
      this.schedulePauseForDisconnect(entry.playerIndex);
    }
  }

/** Freeze the game when a just-dropped (and still offline) human player's turn
   *  arrives or was current — after a grace window, so transient network flaps /
   *  fast refreshes that resolve within the window never pop the disconnect modal. */
  private schedulePauseForDisconnect(playerIndex: number): void {
    if (this.canceled) return;
    const sim = this.host.sim();
    const store = useGameStore.getState();
    if (!this.hostStarted || !sim || store.screen !== Screen.GAME) return;
    if (sim.currentPlayerIndex !== playerIndex) return;
    if (sim.gameOver) return;
    const player = sim.players[playerIndex];
    if (!player || !player.isHuman) return;
    const entry = this.hostPlayers.find((h) => h.playerIndex === playerIndex);
    if (!entry || entry.online) return;
    if (store.paused === PauseReason.DISCONNECT) return;
    if (this.disconnectPauseTimers.has(playerIndex)) return;
    this.disconnectPauseTimers.set(playerIndex, setTimeout(() => {
      this.disconnectPauseTimers.delete(playerIndex);
      const storeNow = useGameStore.getState();
      const simNow = this.host.sim();
      if (this.canceled || !this.hostStarted || !simNow || simNow.gameOver || storeNow.screen !== Screen.GAME) return;
      if (simNow.currentPlayerIndex !== playerIndex) return;
      const playerNow = simNow.players[playerIndex];
      if (!playerNow || !playerNow.isHuman) return;
      const entryNow = this.hostPlayers.find((h) => h.playerIndex === playerIndex);
      if (!entryNow || entryNow.online) return;
      if (storeNow.paused === PauseReason.DISCONNECT) return;
      storeNow.setPaused(PauseReason.DISCONNECT, playerNow.name);
    }, DISCONNECT_GRACE_MS));
  }

  private cancelDisconnectTimer(playerIndex: number): void {
    const timer = this.disconnectPauseTimers.get(playerIndex);
    if (timer) {
      clearTimeout(timer);
      this.disconnectPauseTimers.delete(playerIndex);
}
  }
 
  /** Host decision: keep waiting — clear the modal but stay paused until the
   *  player rejoins or the host resolves it. */
  waitForDisconnected(): void {
    const store = useGameStore.getState();
    if (store.paused === PauseReason.DISCONNECT) store.setOverlay(null);
  }

  /** Index of the human player whose seat is currently in a disconnected-pause
   *  (used by the host's disconnect modal). Null when nothing is paused. */
  offlinePlayerIndex(): number | null {
    const sim = this.host.sim();
    const store = useGameStore.getState();
    if (store.paused !== PauseReason.DISCONNECT || !sim) return null;
    for (const p of sim.players) {
      if (!p.isHuman) continue;
      const entry = this.hostPlayers.find((h) => h.playerIndex === p.index);
      if (entry && !entry.online) return p.index;
    }
    return null;
  }

  /** Host decision: hand the dropped player's seat to the AI and resume. */
  giveDisconnectedToAI(playerIndex: number): Promise<void> {
    return this.resumeAfterDrop(playerIndex, CommandType.GIVE_TO_AI, () => this.aiTakeoverSeats.add(playerIndex));
  }

  /** Host decision: forfeit the dropped player (frees their villages/units) and
   *  resume the game for the rest. */
  forfeitDisconnected(playerIndex: number): Promise<void> {
    return this.resumeAfterDrop(playerIndex, CommandType.FORFEIT);
  }

  /** Applies `command` to the dropped player, ends their turn when it is
   *  running, shows and broadcasts the outcome, and unpauses the game. */
  private resumeAfterDrop(playerIndex: number, command: CommandType.GIVE_TO_AI | CommandType.FORFEIT, afterCommand?: () => void): Promise<void> {
    const sim = this.host.sim();
    if (!sim) return Promise.resolve();
    return this.host.enqueue(async () => {
      const pre = this.host.exploredKeysFor(useGameStore.getState().localPlayerIndex);
      sim.applyCommand({ type: command, playerIndex });
      afterCommand?.();
      if (sim.currentPlayerIndex === playerIndex && !sim.gameOver) await runSliced(sim.applyCommandSteps({ type: CommandType.END_TURN }), SIM_SLICE_BUDGET_MS);
      const events = sim.drainEvents();
      this.host.syncStore();
      this.broadcastBatch(events);
      await this.host.presentEvents(events, pre);
      this.host.render();
      useGameStore.getState().setPaused(null);
    });
  }

  private broadcastPlayersOnline(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const online = sim.players.map(() => true);
    for (const p of this.hostPlayers) {
      if (p.playerIndex !== null) online[p.playerIndex] = p.online;
    }
    useGameStore.getState().setPlayersOnline(online);
    this.hostSession?.broadcast({ type: HostMessageType.PLAYERS_ONLINE, online });
  }

  async startHostGame(): Promise<void> {
    const store = useGameStore.getState();
    if (!this.hostConfig || this.hostTribe === null) return;
    const humanSlots = this.hostConfig.totalPlayers - this.hostConfig.aiCount;
    const readyClients = this.hostPlayers.filter((p) => p.name && p.tribeId !== null && p.ready);
    const allJoinedReady = this.hostPlayers.every((p) => p.name && p.tribeId !== null && p.ready);
    if (allJoinedReady === false || 1 + readyClients.length !== humanSlots) return;
    this.hostStarted = true;
    const clients = readyClients;
    clients.forEach((p, i) => { p.playerIndex = 1 + i; });
    const humans = [
      { name: this.hostName, tribe: this.hostTribe },
      ...clients.map((p) => ({ name: p.name, tribe: p.tribeId! })),
    ];
    const players = buildMultiplayerPlayers(humans, this.hostConfig.aiCount, new SeededRandom(randomSeed()), loadSettings().aiDifficulty);
    const map = generateMap(players.length, randomSeed());
    for (const p of players) {
      initialExplorationFor(map, p.index);
      exploreVillageSights(map, p.index);
    }
    const sim = new Simulator(map, players, this.hostConfig.mode);
    this.host.setSim(sim);
    sim.startGame();
    const startEvents = sim.drainEvents();
    beginMatchState({ players: players, mode: this.hostConfig.mode, expectedTurns: sim.expectedTurns, netMode: NetMode.HOST });
    store.setPlayersOnline(players.map(() => true));
    store.setScreen(Screen.GAME);
    if (!welcomeDismissed()) store.setOverlay({ kind: OverlayKind.WELCOME });
    this.host.syncKnownTribes(false);
    const start = map.spawns[store.localPlayerIndex]!.start;
    store.setSelection({ kind: SelectionKind.UNIT, q: start.q, r: start.r });
    const app = this.host.app();
    if (app) {
      this.host.applyFitToScreen();
      this.host.setTextures(await createTextures(app, map, 40 * this.host.cameraQualityFactor(), new Set((this.host.sim()?.players ?? []).map((p) => p.tribe)), seasonForTurn(this.host.sim()?.turn ?? 1)));
    }
    this.host.render();
    this.host.centerOnStartVillage();
    this.broadcastBatch(startEvents);
  }

  sendClientCommand(cmd: Command): void {
    this.clientSession?.send({ type: ClientMessageType.COMMAND, cmd });
  }

  /** Marks one locally-predicted command as in flight. Replies (state batches)
   *  are FIFO, so each one consumes one pending prediction. */
  noteClientPrediction(): void {
    this.predictedPending++;
  }

  joinGame(code: string, name: string, relayUrl?: string): void {
    this.canceled = false;
    this.clientName = name;
    this.clientSession?.close();
    this.clientSession = null;
    // Remember the room so a reloaded page can offer a one-click rejoin.
    activeMatchStore.save(code, name, relayUrl ?? resolveRelayUrl());
    const store = useGameStore.getState();
    store.setNetMode(NetMode.CLIENT);
    store.setConnection(ConnectionState.CONNECTING);
    store.setConnectionMessage('');
    store.setLocalPlayerIndex(-1);
    this.clientSession = new RelayClientSession(
      {
        onRegistered: (selfId) => {
          if (this.canceled) return;
          store.setMyPeerId(selfId);
          const lobby = useGameStore.getState().lobby;
          if (lobby && lobby.role === LobbyRole.CLIENT) {
            store.setLobby({ ...lobby, players: lobby.players.map((p) => (p.peerId === '' ? { ...p, peerId: selfId } : p)) });
          }
        },
        onJoined: () => {
          store.setConnection(ConnectionState.CONNECTED);
          store.setConnectionMessage('');
        },
        onData: (msg) => this.onHostMessage(msg),
        onClose: () => {
          if (this.canceled) return;
          store.setConnection(ConnectionState.ERROR);
          store.setConnectionMessage(t('lobby.disconnected'));
          this.noteHostDisconnected();
        },
        onError: (err) => {
          if (this.canceled) return;
          store.setConnection(ConnectionState.ERROR);
          store.setConnectionMessage(err?.message ?? t('lobby.errMsg'));
          this.noteHostDisconnected();
        },
      },
      relayUrl,
    );
    this.clientSession.join(code, name);
    store.setMyPeerId('');
    store.setLobby({
      role: LobbyRole.CLIENT,
      code,
      mode: GameMode.CAPTURE,
      totalPlayers: 0,
      aiCount: 0,
      players: [{ peerId: '', name, tribeId: null, isHost: false, ready: false }],
    });
    store.setScreen(Screen.LOBBY);
  }

  /** Fired on a relay socket close/error: pause the game while it is running
   *  so the client waits for the host to return. */
  noteHostDisconnected(): void {
    const store = useGameStore.getState();
    if (store.screen !== Screen.GAME || store.netMode !== NetMode.CLIENT) return;
    if (store.paused === PauseReason.DISCONNECT) return;
    store.setPaused(PauseReason.DISCONNECT, '');
  }

  private markClientInGame(): void {
    this.clientSession?.setInGame(true);
  }

  cancelLobby(): void {
    this.canceled = true;
    this.hostStarted = false;
    for (const t of this.disconnectPauseTimers.values()) clearTimeout(t);
    this.disconnectPauseTimers.clear();
    activeMatchStore.clear();
    this.hostSession?.close();
    this.hostSession = null;
    this.hostPlayers = [];
    this.hostConfig = null;
    this.clientSession?.close();
    this.clientSession = null;
    const store = useGameStore.getState();
    store.setLobby(null);
    store.setConnection(ConnectionState.IDLE);
    store.setConnectionMessage('');
    store.setNetMode(NetMode.SINGLE);
    store.setMyPeerId('');
  }

  pickClientTribe(tribe: Tribe): void {
    this.clientSession?.send({ type: ClientMessageType.PICK_TRIBE, tribeId: tribe });
  }

  readyUp(): void {
    this.clientSession?.send({ type: ClientMessageType.READY });
  }

  onHostMessage(msg: HostMessage): void {
    const store = useGameStore.getState();
    switch (msg.type) {
      case HostMessageType.LOBBY_UPDATE:
        store.setLobby({
          role: LobbyRole.CLIENT,
          code: store.lobby?.code ?? '',
          mode: store.lobby?.mode ?? GameMode.CAPTURE,
          totalPlayers: msg.totalPlayers,
          aiCount: msg.aiCount,
          players: msg.joined,
        });
        break;
      case HostMessageType.STATE: {
        if (msg.state.gameOver) activeMatchStore.clear();
        if (this.predictedPending > 0) {
          this.predictedPending--;
          this.eventsToSkip++;
        } else {
          // A state that did not consume a prediction is a plain sync batch:
          // any earlier skip was stale, so the events it precedes must render.
          this.eventsToSkip = 0;
        }
        this.markClientInGame();
        useGameStore.getState().setPaused(null);
        this.pendingPreExplored = this.host.exploredKeysFor(store.localPlayerIndex);
        store.setLocalPlayerIndex(msg.playerIndex);
        store.setPendingSnapshot(msg.state);
        store.setPlayers(msg.state.players);
        store.setMode(msg.state.mode);
        store.setTurn(msg.state.turn);
        store.setWeather(weatherCopies(msg.state.map));
        store.setCurrentPlayerIndex(msg.state.currentPlayerIndex);
        store.setGameOver(msg.state.gameOver);
        store.setWinnerIndex(msg.state.winnerIndex);
        store.setExpectedTurns(msg.state.expectedTurns);
        store.setBonusAwarded(msg.state.bonusAwarded);
        store.setAiActive(msg.state.currentPlayerIndex !== msg.playerIndex);
        store.setSelection(null);
        const enteringGame = store.screen !== Screen.GAME;
        store.setScreen(Screen.GAME);
        if (enteringGame && !welcomeDismissed()) store.setOverlay({ kind: OverlayKind.WELCOME });
        if (enteringGame) store.setPlayersOnline(msg.state.players.map(() => true));
        this.host.enqueue(async () => {
          this.host.adoptSnapshot(msg.state);
        });
        break;
      }
      case HostMessageType.EVENTS: {
        if (this.eventsToSkip > 0) {
          this.eventsToSkip--;
          this.pendingPreExplored = null;
          break;
        }
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
      case HostMessageType.ERROR:
        store.setConnection(ConnectionState.ERROR);
        break;
      case HostMessageType.PLAYERS_ONLINE:
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
