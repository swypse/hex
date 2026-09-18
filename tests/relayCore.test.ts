import { describe, it, expect } from 'vitest';
import { RelayCore, type RelayConn } from '../server/relay-core.mjs';

function makeConn(): RelayConn & { sent: unknown[] } {
  const conn: RelayConn & { sent: unknown[] } = {
    role: null,
    code: null,
    id: null,
    sent: [],
    send: function (obj: unknown) {
      this.sent.push(obj);
    },
  };
  return conn;
}

describe('RelayCore', () => {
  it('registers a host and replies with registered', () => {
    const core = new RelayCore();
    const host = makeConn();
    core.registerHost(host, 'ABCDEF');

    expect(host.role).toBe('host');
    expect(host.code).toBe('ABCDEF');
    expect(host.sent).toEqual([{ type: 'registered', id: 'host' }]);
  });

  it('rejects a second host for the same room code', () => {
    const core = new RelayCore();
    const host = makeConn();
    const other = makeConn();
    core.registerHost(host, 'ABCDEF');
    core.registerHost(other, 'ABCDEF');

    expect(other.sent).toEqual([{ type: 'error', message: 'This room code is already in use.' }]);
  });

  it('tells a client joining before the host that the room is missing', () => {
    const core = new RelayCore();
    const client = makeConn();
    core.registerClient(client, 'NOPE00');

    expect(client.role).toBeNull();
    expect(client.id).toBeNull();
    expect(client.sent).toEqual([{ type: 'room-not-found' }]);
  });

  it('registers a client, notifies the host, and the client receives a guest id', () => {
    const core = new RelayCore();
    const host = makeConn();
    const client = makeConn();
    core.registerHost(host, 'ABCDEF');
    core.registerClient(client, 'ABCDEF');

    expect(client.role).toBe('client');
    expect(client.code).toBe('ABCDEF');
    expect(client.id).toMatch(/^guest-/);
    expect(client.sent).toEqual([{ type: 'registered', id: client.id }]);
    expect(host.sent).toEqual([{ type: 'registered', id: 'host' }, { type: 'client-joined', clientId: client.id }]);
  });

  it('host broadcasts a message to all connected clients', () => {
    const core = new RelayCore();
    const host = makeConn();
    const c1 = makeConn();
    const c2 = makeConn();
    core.registerHost(host, 'ABCDEF');
    core.registerClient(c1, 'ABCDEF');
    core.registerClient(c2, 'ABCDEF');

    core.relayData(host, { type: 'data', to: 'all', data: { hello: 1 } });

    expect(c1.sent).toEqual([{ type: 'registered', id: c1.id }, { type: 'data', from: 'host', data: { hello: 1 } }]);
    expect(c2.sent).toEqual([{ type: 'registered', id: c2.id }, { type: 'data', from: 'host', data: { hello: 1 } }]);
  });

  it('host sends a message to a single targeted client', () => {
    const core = new RelayCore();
    const host = makeConn();
    const c1 = makeConn();
    const c2 = makeConn();
    core.registerHost(host, 'ABCDEF');
    core.registerClient(c1, 'ABCDEF');
    core.registerClient(c2, 'ABCDEF');

    core.relayData(host, { type: 'data', to: c2.id!, data: { target: true } });

    expect(c2.sent).toEqual([{ type: 'registered', id: c2.id }, { type: 'data', from: 'host', data: { target: true } }]);
    expect(c1.sent).toEqual([{ type: 'registered', id: c1.id }]);
  });

  it('client sends a message to the host with its own id as the from field', () => {
    const core = new RelayCore();
    const host = makeConn();
    const client = makeConn();
    core.registerHost(host, 'ABCDEF');
    core.registerClient(client, 'ABCDEF');

    core.relayData(client, { type: 'data', data: { join: 'Joe' } });

    expect(host.sent).toEqual([
      { type: 'registered', id: 'host' },
      { type: 'client-joined', clientId: client.id },
      { type: 'data', from: client.id, data: { join: 'Joe' } },
    ]);
  });

  it('does not relay data from a connection that never registered', () => {
    const core = new RelayCore();
    const host = makeConn();
    const rogue = makeConn();
    core.registerHost(host, 'ABCDEF');

    core.relayData(rogue, { type: 'data', data: { nope: true } });

    expect(host.sent).toEqual([{ type: 'registered', id: 'host' }]);
  });

  it('notifies all clients with host-left when the host disconnects', () => {
    const core = new RelayCore();
    const host = makeConn();
    const c1 = makeConn();
    const c2 = makeConn();
    core.registerHost(host, 'ABCDEF');
    core.registerClient(c1, 'ABCDEF');
    core.registerClient(c2, 'ABCDEF');

    core.handleClose(host);

    expect(c1.sent).toEqual([
      { type: 'registered', id: c1.id },
      { type: 'host-left' },
    ]);
    expect(c2.sent).toEqual([
      { type: 'registered', id: c2.id },
      { type: 'host-left' },
    ]);
  });

  it('notifies the host with client-left when a client disconnects', () => {
    const core = new RelayCore();
    const host = makeConn();
    const c1 = makeConn();
    const c2 = makeConn();
    core.registerHost(host, 'ABCDEF');
    core.registerClient(c1, 'ABCDEF');
    core.registerClient(c2, 'ABCDEF');

    core.handleClose(c1);

    expect(host.sent).toEqual([
      { type: 'registered', id: 'host' },
      { type: 'client-joined', clientId: c1.id },
      { type: 'client-joined', clientId: c2.id },
      { type: 'client-left', clientId: c1.id },
    ]);
  });

  it('keeps the room alive for a new host while clients are still connected', () => {
    const core = new RelayCore();
    const host1 = makeConn();
    const client = makeConn();
    core.registerHost(host1, 'ABCDEF');
    core.registerClient(client, 'ABCDEF');

    core.handleClose(host1);
    expect(client.sent).toEqual([
      { type: 'registered', id: client.id },
      { type: 'host-left' },
    ]);

    const host2 = makeConn();
    core.registerHost(host2, 'ABCDEF');
    expect(host2.sent).toEqual([{ type: 'registered', id: 'host' }]);
  });

  it('drops the room when the host and every client have disconnected', () => {
    const core = new RelayCore();
    const host = makeConn();
    const client = makeConn();
    core.registerHost(host, 'ABCDEF');
    core.registerClient(client, 'ABCDEF');

    core.handleClose(host);
    core.handleClose(client);

    const stranger = makeConn();
    core.registerClient(stranger, 'ABCDEF');
    expect(stranger.sent).toEqual([{ type: 'room-not-found' }]);
  });
});