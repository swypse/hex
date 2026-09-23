import { RelayRoom, type Env } from './relay-room';

export { RelayRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const code = (url.searchParams.get('code') ?? '').trim().toUpperCase();
      if (!code) {
        return new Response('Missing room code', { status: 400 });
      }
      const id = env.RELAY_ROOM.idFromName(code);
      const stub = env.RELAY_ROOM.get(id);
      return stub.fetch(request);
    }
    return new Response('hex relay', { headers: { 'content-type': 'text/plain' } });
  },
} satisfies ExportedHandler<Env>;