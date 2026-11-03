import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { RelayCore } from './relay-core.mjs';

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

function makeConn(ws) {
  return {
    ws,
    role: null,
    code: null,
    id: null,
    send(obj) {
      if (ws.readyState === 1) ws.send(JSON.stringify(obj));
    },
  };
}

function wireConnections(wss) {
  const core = new RelayCore();
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    const conn = makeConn(ws);
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'register') {
        if (msg.role === 'host') core.registerHost(conn, String(msg.code ?? '').toUpperCase());
        else if (msg.role === 'client') core.registerClient(conn, String(msg.code ?? '').toUpperCase());
      } else if (msg.type === 'data' && conn.role) {
        core.relayData(conn, msg);
      }
    });
    ws.on('close', () => core.handleClose(conn));
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