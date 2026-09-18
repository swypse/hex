function clientId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'guest-' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Transport-agnostic room state machine for the hex relay. Connections are
 * represented by plain objects exposing `role`, `code`, `id` and a `send(obj)`
 * method (the transport injects JSON encoding and liveness checks).
 */
export class RelayCore {
  #rooms = new Map();

  registerHost(conn, code) {
    let room = this.#rooms.get(code);
    if (!room) {
      room = { host: null, clients: new Map() };
      this.#rooms.set(code, room);
    }
    if (room.host && room.host !== conn) {
      conn.send({ type: 'error', message: 'This room code is already in use.' });
      return;
    }
    conn.role = 'host';
    conn.code = code;
    room.host = conn;
    conn.send({ type: 'registered', id: 'host' });
  }

  registerClient(conn, code) {
    const room = this.#rooms.get(code);
    if (!room || !room.host) {
      conn.send({ type: 'room-not-found' });
      return;
    }
    const id = clientId();
    conn.role = 'client';
    conn.code = code;
    conn.id = id;
    room.clients.set(id, conn);
    conn.send({ type: 'registered', id });
    room.host.send({ type: 'client-joined', clientId: id });
  }

  relayData(conn, msg) {
    const room = this.#rooms.get(conn.code);
    if (!room) return;
    if (conn.role === 'host') {
      if (msg.to === 'all') {
        for (const client of room.clients.values()) {
          client.send({ type: 'data', from: 'host', data: msg.data });
        }
      } else {
        const client = room.clients.get(msg.to);
        if (client) client.send({ type: 'data', from: 'host', data: msg.data });
      }
    } else if (conn.role === 'client') {
      if (room.host) room.host.send({ type: 'data', from: conn.id, data: msg.data });
    }
  }

  #dropRoom(room) {
    if (!room || room.host || room.clients.size !== 0) return;
    for (const [code, r] of this.#rooms) {
      if (r === room) {
        this.#rooms.delete(code);
        return;
      }
    }
  }

  handleClose(conn) {
    if (conn.role === 'host' && conn.code) {
      const room = this.#rooms.get(conn.code);
      if (room && room.host === conn) {
        room.host = null;
        for (const client of room.clients.values()) {
          client.send({ type: 'host-left' });
        }
        this.#dropRoom(room);
      }
    } else if (conn.role === 'client' && conn.code && conn.id) {
      const room = this.#rooms.get(conn.code);
      if (room) {
        room.clients.delete(conn.id);
        if (room.host) room.host.send({ type: 'client-left', clientId: conn.id });
        this.#dropRoom(room);
      }
    }
  }
}