import { AuthError } from '../../../src/enums/auth-error.enum';
import type { AuthService } from '../auth/auth-service';
import { bearer, CORS_HEADERS, json, readBody, respond } from '../auth/http';
import type { ResultService } from './result-service';

const RESULTS_PATH = '/api/results';
const BEST_PATH = '/api/results/best';

/** Returns null when the request is not a results route. */
export async function handleResultsRequest(
  request: Request,
  auth: AuthService,
  results: ResultService,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname !== RESULTS_PATH && pathname !== BEST_PATH) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  const me = await auth.me(bearer(request));
  if (!me.ok) return respond(me);

  if (pathname === BEST_PATH && request.method === 'GET') {
    return json({ ok: true, value: await results.bests(me.value.id) });
  }
  if (pathname === RESULTS_PATH && request.method === 'POST') {
    const body = await readBody(request);
    return respond(body ? await results.record(me.value.id, body) : { ok: false, error: AuthError.INVALID_INPUT });
  }
  return json({ ok: false, error: AuthError.INVALID_INPUT }, 405);
}
