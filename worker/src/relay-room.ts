import { DurableObject } from 'cloudflare:workers';
import { RelayCore } from '../../server/relay-core.mjs';
import { wireMember } from '../../server/worker/relay-wiring.mjs';

export interface Env {
  RELAY_ROOM: DurableObjectNamespace<RelayRoom>;
}

/** One Durable Object instance per room code. Holds that room's relay state. */
export class RelayRoom extends DurableObject<Env> {
  #core = new RelayCore();

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    wireMember(
      {
        readyState: server.readyState,
        send: (d) => server.send(d),
        addEventListener: (type, cb) => {
          if (type === 'message') {
            server.addEventListener('message', (ev) => cb({ data: ev.data }));
          } else {
            server.addEventListener('close', () => cb({}));
          }
        },
      },
      this.#core,
    );
    return new Response(null, { status: 101, webSocket: client });
  }
}