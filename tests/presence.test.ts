import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameController } from '../src/controller/game-controller';
import { NetworkController } from '../src/controller/network-controller';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe } from '../src/game/tribes';
import { useGameStore } from '../src/store/game-store';
import { SeededRandom } from '../src/util';
import { makeTestMap } from './helpers/test-map';
import { GameMode, LobbyRole } from '@enums';

const controller = gameController as unknown as {
  getNetwork: () => NetworkController;
  sim: Simulator | null;
  handleClientClosed: (peerId: string) => void;
};

function net(): NetworkController {
  return controller.getNetwork();
}

describe('multiplayer presence', () => {
  afterEach(() => {
    controller.sim = null;
    net().hostPlayers = [];
    net().hostSession = null;
    net().hostConfig = null;
    net().hostName = '';
    net().hostTribe = null;
    useGameStore.setState({ playersOnline: [], lobby: null, players: [] });
    vi.restoreAllMocks();
  });

  it('keeps a mid-game disconnect in the list, marks it offline, and broadcasts presence', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    controller.sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5 });
    useGameStore.setState({ players, playersOnline: players.map(() => true) });
    net().hostPlayers = [
      { peerId: 'guest-1', name: 'Guest', tribeId: Tribe.Warriors, playerIndex: 1, ready: true, online: true },
    ];
    const broadcast = vi.fn();
    net().hostSession = { broadcast } as never;
    controller.handleClientClosed('guest-1');
    expect(net().hostPlayers).toHaveLength(1);
    expect(net().hostPlayers[0]!.online).toBe(false);
    expect(useGameStore.getState().playersOnline).toEqual([true, false]);
    expect(broadcast).toHaveBeenCalledWith({ type: 'playersOnline', online: [true, false] });
  });

  it('does not re-broadcast presence when a duplicate close is delivered for an offline client', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    controller.sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5 });
    useGameStore.setState({ players, playersOnline: players.map(() => true) });
    net().hostPlayers = [
      { peerId: 'guest-1', name: 'Guest', tribeId: Tribe.Warriors, playerIndex: 1, ready: true, online: false },
    ];
    const broadcast = vi.fn();
    net().hostSession = { broadcast } as never;
    controller.handleClientClosed('guest-1');
    expect(broadcast).not.toHaveBeenCalled();
    expect(net().hostPlayers[0]!.online).toBe(false);
  });

  it('removes a disconnected player from the lobby list before the game starts', () => {
    useGameStore.setState({
      lobby: { role: LobbyRole.HOST, code: 'ABC123', mode: GameMode.CAPTURE, totalPlayers: 2, aiCount: 0, players: [] },
    });
    net().hostConfig = { mode: GameMode.CAPTURE, totalPlayers: 2, aiCount: 0 };
    net().hostName = 'Host';
    net().hostTribe = Tribe.Cats;
    net().hostPlayers = [
      { peerId: 'guest-1', name: 'Guest', tribeId: Tribe.Warriors, playerIndex: null, ready: true, online: true },
    ];
    net().hostSession = { broadcast: vi.fn() } as never;
    controller.handleClientClosed('guest-1');
    expect(net().hostPlayers).toHaveLength(0);
  });
});
