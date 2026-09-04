import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { createRelayServer, type RelayServerHandle } from '../server/relay.mjs';
import { RelayHostSession, RelayClientSession, type WebSocketLike } from '../src/net/relaySession';
import type { HostMessage } from '../src/net/peerSession';

let relay: RelayServerHandle;

beforeAll(async () => {
  relay = await createRelayServer();
});

afterAll(() => {
  relay.close();
});

function socketFactory(url: string): WebSocketLike {
  const ws = new WsWebSocket(url);
  const like: WebSocketLike = {
    send: (d) => ws.send(d),
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  ws.on('open', () => like.onopen?.());
  ws.on('message', (data) => like.onmessage?.({ data: data.toString() }));
  ws.on('close', () => like.onclose?.());
  ws.on('error', () => like.onerror?.());
  return like;
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function withTimeout<T>(p: Promise<T>, ms = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

describe('WebSocket relay', () => {
  it('host registers, client joins, and both exchange host/client messages', async () => {
    const hostReady = deferred();
    const hostClientJoined = deferred<string>();
    const hostGotJoin = deferred<string>();
    const host = new RelayHostSession(
      {
        onReady: () => hostReady.resolve(),
        onClientJoined: (id) => hostClientJoined.resolve(id),
        onData: (clientId, msg) => {
          if (msg.type === 'join') hostGotJoin.resolve(clientId);
        },
        onClientClosed: () => {},
        onError: (e) => hostReady.reject(e),
      },
      relay.url,
      socketFactory,
    );
    host.open('ABCDEF');
    await withTimeout(hostReady.promise);

    const clientRegistered = deferred<string>();
    const clientJoined = deferred();
    const clientGotLobby = deferred<HostMessage>();
    const client = new RelayClientSession(
      {
        onRegistered: (id) => clientRegistered.resolve(id),
        onJoined: () => clientJoined.resolve(),
        onData: (msg) => {
          if (msg.type === 'lobbyUpdate') clientGotLobby.resolve(msg);
        },
        onClose: () => {},
        onError: () => {},
      },
      relay.url,
      socketFactory,
    );
    client.join('ABCDEF', 'Guest');

    const clientId = await withTimeout(clientRegistered.promise);
    expect(clientId).toMatch(/^guest-/);
    expect(client.getPeerId()).toBe(clientId);
    expect(await withTimeout(hostClientJoined.promise)).toBe(clientId);
    await withTimeout(clientJoined.promise);
    await withTimeout(hostGotJoin.promise);

    host.broadcast({ type: 'lobbyUpdate', joined: [], totalPlayers: 2, aiCount: 0 });
    const lobby = await withTimeout(clientGotLobby.promise);
    expect(lobby.type).toBe('lobbyUpdate');

    host.close();
    client.close();
  });

  it('client that joins before the host retries until the host appears', async () => {
    const hostReady = deferred();
    const hostClientJoined = deferred<string>();
    const clientRegistered = deferred<string>();
    const client = new RelayClientSession(
      {
        onRegistered: (id) => clientRegistered.resolve(id),
        onJoined: () => {},
        onData: () => {},
        onClose: () => {},
        onError: () => {},
      },
      relay.url,
      socketFactory,
    );
    client.join('ZZZZ99', 'Early');

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(client.getPeerId()).toBeNull();

    const host = new RelayHostSession(
      {
        onReady: () => hostReady.resolve(),
        onClientJoined: (id) => hostClientJoined.resolve(id),
        onData: () => {},
        onClientClosed: () => {},
        onError: () => {},
      },
      relay.url,
      socketFactory,
    );
    host.open('ZZZZ99');
    await withTimeout(hostReady.promise);
    const clientId = await withTimeout(clientRegistered.promise);
    expect(await withTimeout(hostClientJoined.promise)).toBe(clientId);

    host.close();
    client.close();
  }, 10000);

  it('client reconnects and rejoins when the host goes away and comes back', async () => {
    const host1Ready = deferred();
    const host2Ready = deferred();
    const registrations: string[] = [];
    const host2GotClient = deferred<string>();
    const host2GotJoin = deferred<string>();

    const host1 = new RelayHostSession(
      {
        onReady: () => host1Ready.resolve(),
        onClientJoined: () => {},
        onData: () => {},
        onClientClosed: () => {},
        onError: () => {},
      },
      relay.url,
      socketFactory,
    );
    host1.open('MNOP22');
    await withTimeout(host1Ready.promise);

    const client = new RelayClientSession(
      {
        onRegistered: (id) => registrations.push(id),
        onJoined: () => {},
        onData: () => {},
        onClose: () => {},
        onError: () => {},
      },
      relay.url,
      socketFactory,
    );
    client.join('MNOP22', 'Guest');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(registrations).toHaveLength(1);

    host1.close();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const host2 = new RelayHostSession(
      {
        onReady: () => host2Ready.resolve(),
        onClientJoined: (id) => host2GotClient.resolve(id),
        onData: (clientId, msg) => {
          if (msg.type === 'join') host2GotJoin.resolve(clientId);
        },
        onClientClosed: () => {},
        onError: () => {},
      },
      relay.url,
      socketFactory,
    );
    host2.open('MNOP22');
    await withTimeout(host2Ready.promise);

    const newClientId = await withTimeout(host2GotClient.promise, 8000);
    expect(await withTimeout(host2GotJoin.promise, 8000)).toBe(newClientId);
    expect(registrations.length).toBeGreaterThanOrEqual(2);

    client.close();
    host2.close();
  }, 15000);
});
