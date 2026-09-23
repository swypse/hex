import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameController } from '../src/controller/game-controller';
import { NetworkController } from '../src/controller/network-controller';
import { RelayHostSession } from '../src/net/relay-session';
import { useGameStore, confirmLeaveGame } from '../src/store/game-store';
import { activeMatchStore } from '../src/storage/active-match';

const KEY = 'hex-active-match-v1';

function network(): NetworkController {
  return (gameController as unknown as { getNetwork: () => NetworkController }).getNetwork();
}

const realLocalStorage = globalThis.window.localStorage;

function freshMatch(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    role: 'client',
    code: 'ABC234',
    name: 'Guest',
    relayUrl: 'ws://relay.lan:8787/ws',
    savedAt: Date.now(),
    ...overrides,
  });
}

describe('rejoinGame', () => {
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map<string, string>();
    Object.defineProperty(globalThis.window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => stored.get(k) ?? null,
        setItem: (k: string, v: string) => void stored.set(k, v),
        removeItem: (k: string) => void stored.delete(k),
      },
    });
    stored.set(KEY, freshMatch());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis.window, 'localStorage', {
      configurable: true,
      value: realLocalStorage,
    });
    activeMatchStore.clear();
    useGameStore.setState({ netMode: 'single', paused: null, screen: 'start' });
  });

  it('rejoins with the stored code, name and relay url while fresh', () => {
    const join = vi.spyOn(network(), 'joinGame');
    gameController.rejoinGame();
    expect(join).toHaveBeenCalledOnce();
    expect(join).toHaveBeenCalledWith('ABC234', 'Guest', 'ws://relay.lan:8787/ws');
  });

  it('is a no-op without a stored match', () => {
    stored.delete(KEY);
    const join = vi.spyOn(network(), 'joinGame');
    gameController.rejoinGame();
    expect(join).not.toHaveBeenCalled();
  });

  it('is a no-op with an expired match', () => {
    stored.set(KEY, freshMatch({ savedAt: Date.now() - 46 * 60 * 1000 }));
    const join = vi.spyOn(network(), 'joinGame');
    gameController.rejoinGame();
    expect(join).not.toHaveBeenCalled();
  });

  it('joining a room saves an active client match', () => {
    network().joinGame('XYZ789', 'Mina', 'wss://custom.example/ws');
    const match = activeMatchStore.loadFresh();
    expect(match?.code).toBe('XYZ789');
    expect(match?.name).toBe('Mina');
    expect(match?.relayUrl).toBe('wss://custom.example/ws');
  });

  it('confirmLeaveGame clears the saved match for a client', () => {
    useGameStore.setState({ netMode: 'client', screen: 'game', gameOver: false });
    confirmLeaveGame();
    expect(activeMatchStore.loadFresh()).toBeNull();
  });

  it('hosting a game clears a previously saved client match', () => {
    vi.spyOn(RelayHostSession.prototype, 'open').mockImplementation(() => {});
    network().hostGame({ mode: 'capture', totalPlayers: 2, aiCount: 0, mapSize: 'normal', name: 'H', tribe: 'Cats' as never });
    expect(activeMatchStore.loadFresh()).toBeNull();
  });
});