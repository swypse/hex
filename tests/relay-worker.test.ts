import { describe, it, expect } from 'vitest';
import { RelayCore } from '../server/relay-core.mjs';
import { wireMember, type ServerSocketLike } from '../server/worker/relay-wiring.mjs';
import type { RelayConn } from '../server/relay-core.mjs';

function makeFakeSocket(): ServerSocketLike & { sent: string[]; fire: (type: string, data?: string) => void } {
  const listeners: Record<string, ((event: { data?: string }) => void)[]> = {};
  const fake: ServerSocketLike & { sent: string[]; fire: (type: string, data?: string) => void } = {
    readyState: 1,
    sent: [],
    send: (d: string) => fake.sent.push(d),
    addEventListener: (type: string, cb: (event: { data?: string }) => void) => {
      (listeners[type] ??= []).push(cb);
    },
    fire: (type: string, data?: string) => {
      for (const cb of listeners[type] ?? []) cb({ data });
    },
  };
  return fake;
}

function parseSent<T>(socket: { sent: string[] }): T[] {
  return socket.sent.map((s) => JSON.parse(s) as T);
}

describe('wireMember', () => {
  it('registers a host through the register message', () => {
    const core = new RelayCore();
    const socket = makeFakeSocket();
    const conn: RelayConn = wireMember(socket, core);

    expect(conn.role).toBeNull();
    socket.fire('message', JSON.stringify({ type: 'register', role: 'host', code: 'abc' }));

    expect(conn.role).toBe('host');
    expect(conn.code).toBe('ABC');
    expect(parseSent(socket)).toEqual([{ type: 'registered', id: 'host' }]);
  });

  it('relays a client message to the host and notifies the host of the joining client', () => {
    const core = new RelayCore();
    const hostSocket = makeFakeSocket();
    const clientSocket = makeFakeSocket();
    const host = wireMember(hostSocket, core);
    const client = wireMember(clientSocket, core);

    hostSocket.fire('message', JSON.stringify({ type: 'register', role: 'host', code: 'ROOM1' }));
    clientSocket.fire('message', JSON.stringify({ type: 'register', role: 'client', code: 'ROOM1' }));

    expect(parseSent(hostSocket)).toEqual([
      { type: 'registered', id: 'host' },
      { type: 'client-joined', clientId: client.id },
    ]);
    expect(parseSent(clientSocket)).toEqual([{ type: 'registered', id: client.id }]);

    clientSocket.fire('message', JSON.stringify({ type: 'data', data: { hello: 'world' } }));
    expect(parseSent(hostSocket)).toEqual([
      { type: 'registered', id: 'host' },
      { type: 'client-joined', clientId: client.id },
      { type: 'data', from: client.id, data: { hello: 'world' } },
    ]);
  });

  it('listens for close and calls core cleanup', () => {
    const core = new RelayCore();
    const hostSocket = makeFakeSocket();
    const clientSocket = makeFakeSocket();
    const host = wireMember(hostSocket, core);
    const client = wireMember(clientSocket, core);

    hostSocket.fire('message', JSON.stringify({ type: 'register', role: 'host', code: 'ROOM1' }));
    clientSocket.fire('message', JSON.stringify({ type: 'register', role: 'client', code: 'ROOM1' }));

    clientSocket.fire('close');

    expect(parseSent(hostSocket)).toEqual([
      { type: 'registered', id: 'host' },
      { type: 'client-joined', clientId: client.id },
      { type: 'client-left', clientId: client.id },
    ]);
  });
});