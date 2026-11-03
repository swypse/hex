import { RelayCore } from '../relay-core.mjs';

function parseSocketMessage(raw) {
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
  try {
    const msg = JSON.parse(text);
    if (msg !== null && typeof msg === 'object' && typeof msg.type === 'string') {
      return msg;
    }
  } catch {
    // ignore malformed frames
  }
  return null;
}

/**
 * Wires a server-side WebSocket (Node ws adapter, Cloudflare WebSocket, or a
 * test fake) into a RelayCore. Returns the conn object the core manages.
 */
export function wireMember(socket, core) {
  const conn = {
    role: null,
    code: null,
    id: null,
    send(obj) {
      if (socket.readyState === 1) socket.send(JSON.stringify(obj));
    },
  };
  socket.addEventListener('message', (event) => {
    const msg = parseSocketMessage(event.data ?? '');
    if (!msg) return;
    if (msg.type === 'register') {
      if (msg.role === 'host') core.registerHost(conn, String(msg.code ?? '').toUpperCase());
      else if (msg.role === 'client') core.registerClient(conn, String(msg.code ?? '').toUpperCase());
    } else if (msg.type === 'data' && conn.role) {
      core.relayData(conn, msg);
    }
  });
  socket.addEventListener('close', () => core.handleClose(conn));
  return conn;
}