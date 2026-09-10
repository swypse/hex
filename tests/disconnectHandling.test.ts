import { afterEach, describe, expect, it, vi } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { NetworkController } from '../src/controller/networkController';

const controller = gameController as unknown as {
  getNetwork: () => NetworkController;
  sim: Simulator | null;
  handleClientClosed: (peerId: string) => void;
};

function net(): NetworkController {
  return controller.getNetwork();
}

describe('multiplayer disconnect handling', () => {
  afterEach(() => {
    controller.sim = null;
    net().hostPlayers = [];
    net().hostSession = null;
    net().hostConfig = null;
    net().hostName = '';
    net().hostTribe = null;
    net().clientSession = null;
    useGameStore.setState({
      playersOnline: [],
      lobby: null,
      players: [],
      paused: null,
      pausedName: '',
      screen: 'start',
      netMode: 'single',
      currentPlayerIndex: 0,
      aiActive: false,
    });
    vi.restoreAllMocks();
  });

  function hostSessionMock() {
    const broadcast = vi.fn();
    const sendTo = vi.fn();
    return { session: { broadcast, sendTo } as never, broadcast, sendTo };
  }

  it('pauses the game and notes the name when a client drops on their turn', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    players[0]!.name = 'H';
    players[1]!.name = 'G';
    players[1]!.isHuman = true;
    controller.sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    controller.sim.currentPlayerIndex = 1; // guest's turn
    const { session, broadcast, sendTo } = hostSessionMock();
    net().hostSession = session;
    net().hostStarted = true;
    net().hostPlayers = [
      { peerId: 'guest-1', name: 'G', tribeId: Tribe.Warriors, playerIndex: 1, ready: true, online: true },
    ];
    useGameStore.setState({ screen: 'game', netMode: 'host', players, currentPlayerIndex: 1 });
    controller.handleClientClosed('guest-1');
    const s = useGameStore.getState();
    expect(s.paused).toBe('disconnect');
    expect(s.pausedName).toBe('G');
    expect(net().hostPlayers[0]!.online).toBe(false);
    void broadcast; void sendTo;
  });

  it('does not pause when the dropped client is not on their turn', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    players[1]!.isHuman = true;
    controller.sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    controller.sim.currentPlayerIndex = 0; // host's turn
    const { session } = hostSessionMock();
    net().hostSession = session;
    net().hostStarted = true;
    net().hostPlayers = [
      { peerId: 'guest-1', name: 'G', tribeId: Tribe.Warriors, playerIndex: 1, ready: true, online: true },
    ];
    useGameStore.setState({ screen: 'game', netMode: 'host', players, currentPlayerIndex: 0 });
    controller.handleClientClosed('guest-1');
    expect(useGameStore.getState().paused).toBeNull();
  });

  it('resumes when the dropped client rejoins and it is their turn again', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    players[1]!.name = 'G';
    players[1]!.isHuman = true;
    controller.sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    controller.sim.currentPlayerIndex = 1;
    const { session, broadcast, sendTo } = hostSessionMock();
    net().hostSession = session;
    net().hostStarted = true;
    net().hostPlayers = [
      { peerId: 'old-id', name: 'G', tribeId: Tribe.Warriors, playerIndex: 1, ready: true, online: false },
    ];
    useGameStore.setState({ screen: 'game', netMode: 'host', players });
    // Mark paused (drop on their turn)
    useGameStore.getState().setPaused('disconnect', 'G');
    // A new connection re-binds via onHostData join.
    const onData = net().hostSession && (net() as unknown as { onHostData: (pid: string, msg: unknown) => void }).onHostData
      ? (net() as unknown as { onHostData: (pid: string, msg: unknown) => void }).onHostData
      : null;
    void onData; void session; void broadcast; void sendTo;
    // Simulate the rejoin through the same path the relay uses.
    (net() as unknown as { onHostData: (pid: string, msg: { type: 'join'; name: string }) => void })
      .onHostData('new-id', { type: 'join', name: 'G' });
    expect(net().hostPlayers.some((p) => p.peerId === 'new-id' && p.online)).toBe(true);
    expect(useGameStore.getState().paused).toBeNull();
  });

  it('client pauses on host loss while in game and stays quiet in the lobby', () => {
    useGameStore.setState({ screen: 'game', netMode: 'client', currentPlayerIndex: 1 });
    net().noteHostDisconnected();
    expect(useGameStore.getState().paused).toBe('disconnect');
    // A second signal does not reset the paused name/label.
    net().noteHostDisconnected();
    expect(useGameStore.getState().pausedName).toBe('');

    // Leaving the game clears the paused state.
    useGameStore.getState().setScreen('start');
    net().noteHostDisconnected();
    expect(useGameStore.getState().paused).toBeNull();
    expect(useGameStore.getState().netMode).toBe('client');
  });

  it('giveToAI via the network flips the seat to AI, resumes play, and broadcasts', async () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 1)!.settlement = { owner: 1, level: 1, captureReady: false };
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    players[1]!.name = 'G';
    players[1]!.isHuman = true;
    controller.sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    controller.sim.currentPlayerIndex = 1;
    const { session, broadcast, sendTo } = hostSessionMock();
    net().hostSession = session;
    net().hostStarted = true;
    net().hostPlayers = [
      { peerId: 'guest-1', name: 'G', tribeId: Tribe.Warriors, playerIndex: 1, ready: true, online: false },
    ];
    useGameStore.setState({ screen: 'game', netMode: 'host', players, currentPlayerIndex: 1 });
    useGameStore.getState().setPaused('disconnect', 'G');
    await net().giveDisconnectedToAI(1);
    expect(useGameStore.getState().paused).toBeNull();
    expect(controller.sim!.players[1]!.isHuman).toBe(false);
    expect(broadcast).toHaveBeenCalled();
    void session; void sendTo;
  });

  it('flips a given-to-AI seat back to human when the player rejoins', async () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 1)!.settlement = { owner: 1, level: 1, captureReady: false };
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    players[1]!.name = 'G';
    players[1]!.isHuman = true;
    controller.sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    controller.sim.currentPlayerIndex = 1;
    const { session, broadcast, sendTo } = hostSessionMock();
    net().hostSession = session;
    net().hostStarted = true;
    net().hostPlayers = [
      { peerId: 'old-id', name: 'G', tribeId: Tribe.Warriors, playerIndex: 1, ready: true, online: false },
    ];
    useGameStore.setState({ screen: 'game', netMode: 'host', players, currentPlayerIndex: 1 });
    await net().giveDisconnectedToAI(1);
    expect(controller.sim!.players[1]!.isHuman).toBe(false);

    // The player rejoins from a new connection.
    (net() as unknown as { onHostData: (pid: string, msg: { type: 'join'; name: string }) => void })
      .onHostData('new-id', { type: 'join', name: 'G' });
    expect(controller.sim!.players[1]!.isHuman).toBe(true);
    expect(net().hostPlayers.some((p) => p.peerId === 'new-id' && p.online)).toBe(true);
    void session; void broadcast; void sendTo;
  });

  it('forfeit via the network frees the player, resumes, and broadcasts', async () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 1)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 0, 1)!.unit = makeUnit('u2', 1, 'warrior', 0, 1);
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    players[1]!.name = 'G';
    players[1]!.isHuman = true;
    controller.sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    controller.sim.currentPlayerIndex = 1;
    const { session, broadcast, sendTo } = hostSessionMock();
    net().hostSession = session;
    net().hostStarted = true;
    net().hostPlayers = [
      { peerId: 'guest-1', name: 'G', tribeId: Tribe.Warriors, playerIndex: 1, ready: true, online: false },
    ];
    useGameStore.setState({ screen: 'game', netMode: 'host', players, currentPlayerIndex: 1 });
    useGameStore.getState().setPaused('disconnect', 'G');
    await net().forfeitDisconnected(1);
    const s = useGameStore.getState();
    expect(s.paused).toBeNull();
    expect(controller.sim!.players[1]!.isActive).toBe(false);
    expect(tileAt(map, 0, 1)!.settlement?.owner).toBeNull();
    expect(tileAt(map, 0, 1)!.unit).toBeNull();
    expect(broadcast).toHaveBeenCalled();
    void session; void sendTo;
  });
});