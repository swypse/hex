import { describe, it, expect, vi } from 'vitest';
import Peer from 'peerjs';
import { HostSession, ClientSession, fallbackIceServers, buildPeerConfig, meteredTurnCredentialsUrl } from '../src/net/peerSession';

vi.mock('peerjs', async () => {
  const created: unknown[] = [];
  const conns: unknown[] = [];
  class FakePeer {
    static created = created;
    static conns = conns;
    static connectCount = 0;
    options: Record<string, unknown>;
    private handlers: Record<string, (arg?: unknown) => void> = {};
    constructor(_id: string, options: Record<string, unknown>) {
      this.options = options;
      created.push(this);
    }
    on(event: string, cb: (arg?: unknown) => void): this {
      this.handlers[event] = cb;
      return this;
    }
    emit(event: string, arg?: unknown): void {
      this.handlers[event]?.(arg);
    }
    connect(): Record<string, unknown> {
      FakePeer.connectCount++;
      const listeners: Record<string, (arg?: unknown) => void> = {};
      const conn: Record<string, unknown> = {
        open: false,
        sent: [],
        on: (event: string, cb: (arg?: unknown) => void) => {
          listeners[event] = cb;
          return conn;
        },
        emit: (event: string, arg?: unknown) => {
          listeners[event]?.(arg);
        },
        send: (msg: unknown) => {
          (conn.sent as unknown[]).push(msg);
        },
        close: () => {
          listeners['close']?.(undefined);
        },
      };
      conns.push(conn);
      return conn;
    }
    destroy(): void {}
  }
  return { default: FakePeer };
});

type ConstructedPeer = { options: { config?: RTCConfiguration } };
type FakeConn = {
  open: boolean;
  sent: unknown[];
  on: (event: string, cb: (arg?: unknown) => void) => FakeConn;
  emit: (event: string, arg?: unknown) => void;
  send: (msg: unknown) => void;
  close: () => void;
};
type FakePeerInstance = ConstructedPeer & { emit: (event: string, arg?: unknown) => void };

const peerClass = Peer as unknown as { created: FakePeerInstance[]; conns: FakeConn[]; connectCount: number };

function allUrls(servers: RTCIceServer[]): string[] {
  return servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
}

describe('WebRTC ICE configuration', () => {
  it('fallback ICE uses live STUN servers and never the retired PeerJS relays', () => {
    const urls = allUrls(fallbackIceServers());
    expect(urls.some((u) => u === 'stun:stun.l.google.com:19302')).toBe(true);
    expect(urls.every((u) => u.startsWith('stun:'))).toBe(true);
    expect(urls.every((u) => !u.includes('turn.peerjs.com'))).toBe(true);
  });

  it('buildPeerConfig carries the servers', () => {
    const servers = fallbackIceServers();
    const cfg = buildPeerConfig(servers);
    expect(cfg.iceServers).toEqual(servers);
  });

  it('points at the Metered credentials API with an apiKey', () => {
    const url = new URL(meteredTurnCredentialsUrl());
    expect(url.hostname).toBe('swypse-hex.metered.live');
    expect(url.pathname).toBe('/api/v1/turn/credentials');
    expect(url.searchParams.get('apiKey')).toBeTruthy();
  });

  it('host Peer is built with an explicit ICE config instead of the PeerJS default', async () => {
    const before = peerClass.created.length;
    const host = new HostSession({ onOpen: () => {}, onData: () => {}, onClose: () => {} });
    host.open('ABC123');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const instance = peerClass.created[before];
    expect(instance).toBeDefined();
    const iceServers = instance!.options.config?.iceServers ?? [];
    expect(iceServers.length).toBeGreaterThan(0);
    expect(allUrls(iceServers).every((u) => !u.includes('turn.peerjs.com'))).toBe(true);
  });

  it('client Peer is built with an explicit ICE config instead of the PeerJS default', async () => {
    const before = peerClass.created.length;
    const client = new ClientSession({ onOpen: () => {}, onData: () => {}, onClose: () => {}, onError: () => {} });
    client.join('ABC123', 'Guest');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const instance = peerClass.created[before];
    expect(instance).toBeDefined();
    const iceServers = instance!.options.config?.iceServers ?? [];
    expect(iceServers.length).toBeGreaterThan(0);
    expect(allUrls(iceServers).every((u) => !u.includes('turn.peerjs.com'))).toBe(true);
  });
});

describe('ClientSession connection retry', () => {
  function peerInstance(): FakePeerInstance {
    return peerClass.created[peerClass.created.length - 1]!;
  }

  it('opens the connection, sends join once, and ignores later peer errors', async () => {
    const onOpen = vi.fn();
    const onData = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();
    const before = peerClass.connectCount;
    const client = new ClientSession({ onOpen, onData, onClose, onError });
    client.join('ABC123', 'Guest');
    await Promise.resolve();
    await Promise.resolve();
    peerInstance().emit('open');
    const conn = peerClass.conns[peerClass.conns.length - 1]!;
    conn.emit('open');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(conn.sent).toEqual([{ type: 'join', name: 'Guest' }]);
    expect(peerClass.connectCount - before).toBe(1);
    peerInstance().emit('error', { type: 'peer-unavailable' });
    expect(onError).not.toHaveBeenCalled();
    expect(peerClass.connectCount - before).toBe(1);
    conn.emit('data', { type: 'lobbyUpdate', joined: [], totalPlayers: 2, aiCount: 0 });
    expect(onData).toHaveBeenCalledTimes(1);
    client.close();
  });

  it('retries after peer-unavailable and reports a failure only after retries are exhausted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const onOpen = vi.fn();
      const onData = vi.fn();
      const onClose = vi.fn();
      const onError = vi.fn();
      const before = peerClass.connectCount;
      const client = new ClientSession({ onOpen, onData, onClose, onError });
      client.join('ABC123', 'Guest');
      await Promise.resolve();
      await Promise.resolve();
      peerInstance().emit('open');
      let guard = 0;
      while (onError.mock.calls.length === 0 && guard < 20) {
        peerInstance().emit('error', { type: 'peer-unavailable' });
        await vi.advanceTimersByTimeAsync(1000);
        guard++;
      }
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]![0]!.message).toMatch(/Could not connect to room/);
      expect(onOpen).not.toHaveBeenCalled();
      expect(peerClass.connectCount - before).toBeGreaterThan(1);
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
