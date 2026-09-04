import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const rooms = new Map();

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function clientId() {
  return 'guest-' + crypto.randomBytes(6).toString('base64url');
}

function registerHost(conn, code) {
  let room = rooms.get(code);
  if (!room) {
    room = { host: null, clients: new Map() };
    rooms.set(code, room);
  }
  if (room.host && room.host !== conn) {
    send(conn.ws, { type: 'error', message: 'This room code is already in use.' });
    return;
  }
  conn.role = 'host';
  conn.code = code;
  room.host = conn;
  send(conn.ws, { type: 'registered', id: 'host' });
}

function registerClient(conn, code) {
  const room = rooms.get(code);
  if (!room || !room.host) {
    send(conn.ws, { type: 'room-not-found' });
    return;
  }
  const id = clientId();
  conn.role = 'client';
  conn.code = code;
  conn.id = id;
  room.clients.set(id, conn);
  send(conn.ws, { type: 'registered', id });
  send(room.host.ws, { type: 'client-joined', clientId: id });
}

function relayData(conn, msg) {
  const room = rooms.get(conn.code);
  if (!room) return;
  if (conn.role === 'host') {
    if (msg.to === 'all') {
      for (const client of room.clients.values()) {
        send(client.ws, { type: 'data', from: 'host', data: msg.data });
      }
    } else {
      const client = room.clients.get(msg.to);
      if (client) send(client.ws, { type: 'data', from: 'host', data: msg.data });
    }
  } else if (conn.role === 'client') {
    if (room.host) send(room.host.ws, { type: 'data', from: conn.id, data: msg.data });
  }
}

function dropRoom(room) {
  if (!room || room.host || room.clients.size !== 0) return;
  for (const [code, r] of rooms) {
    if (r === room) {
      rooms.delete(code);
      return;
    }
  }
}

function handleClose(conn) {
  if (conn.role === 'host' && conn.code) {
    const room = rooms.get(conn.code);
    if (room && room.host === conn) {
      room.host = null;
      for (const client of room.clients.values()) {
        send(client.ws, { type: 'host-left' });
      }
      dropRoom(room);
    }
  } else if (conn.role === 'client' && conn.code && conn.id) {
    const room = rooms.get(conn.code);
    if (room) {
      room.clients.delete(conn.id);
      if (room.host) send(room.host.ws, { type: 'client-left', clientId: conn.id });
      dropRoom(room);
    }
  }
}

function attachRelay(wss) {
  const interval = setInterval(() => {
    if (wss.clients.size === 0) return;
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 20000);
  return () => clearInterval(interval);
}

function wireConnections(wss) {
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    const conn = { ws, role: null, code: null, id: null };
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'register') {
        if (msg.role === 'host') registerHost(conn, String(msg.code ?? '').toUpperCase());
        else if (msg.role === 'client') registerClient(conn, String(msg.code ?? '').toUpperCase());
      } else if (msg.type === 'data' && conn.role) {
        relayData(conn, msg);
      }
    });
    ws.on('close', () => handleClose(conn));
  });
}

export function createRelayServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('hex relay');
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  const stopHeartbeat = attachRelay(wss);
  wireConnections(wss);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `ws://127.0.0.1:${port}/ws`,
        close: () => {
          stopHeartbeat();
          wss.close();
          server.close();
        },
      });
    });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('hex relay');
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  attachRelay(wss);
  wireConnections(wss);
  server.listen(port, () => {
    console.log(`hex relay listening on :${port}`);
  });
}
