import { AuthError } from '../../../src/enums/auth-error.enum';
import type { AuthService } from './auth-service';
import { bearer, CORS_HEADERS, json, readBody, respond } from './http';

const PREFIX = '/api/auth/';
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Returns null when the request is not an auth route. */
export async function handleAuthRequest(request: Request, service: AuthService): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  const route = url.pathname.slice(PREFIX.length);

  if (request.method === 'GET' && route === 'me') {
    return respond(await service.me(bearer(request)));
  }
  if (request.method !== 'POST') return json({ ok: false, error: AuthError.INVALID_INPUT }, 405);

  if (route === 'logout') return respond(await service.logout(bearer(request)));

  const body = await readBody(request);
  if (!body) return respond({ ok: false, error: AuthError.INVALID_INPUT });
  switch (route) {
    case 'register':
      return respond(await service.register({ name: str(body.name), email: str(body.email), password: str(body.password) }));
    case 'confirm':
      return respond(await service.confirm(str(body.email), str(body.code)));
    case 'resend':
      return respond(await service.resendCode(str(body.email)));
    case 'login':
      return respond(await service.login(str(body.email), str(body.password)));
    default:
      return json({ ok: false, error: AuthError.INVALID_INPUT }, 404);
  }
}
