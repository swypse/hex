import type { AuthResult } from '../../../src/auth/auth-types';
import { AuthError } from '../../../src/enums/auth-error.enum';

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-max-age': '86400',
};

const STATUS: Record<AuthError, number> = {
  [AuthError.INVALID_INPUT]: 400,
  [AuthError.INVALID_CODE]: 400,
  [AuthError.CODE_EXPIRED]: 400,
  [AuthError.INVALID_CREDENTIALS]: 401,
  [AuthError.UNAUTHORIZED]: 401,
  [AuthError.NOT_CONFIRMED]: 403,
  [AuthError.EMAIL_TAKEN]: 409,
  [AuthError.TOO_MANY_ATTEMPTS]: 429,
  [AuthError.RATE_LIMITED]: 429,
  [AuthError.EMAIL_FAILED]: 502,
  [AuthError.NETWORK]: 502,
};

const MAX_BODY_BYTES = 4096;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

export function respond<T>(result: AuthResult<T>): Response {
  return result.ok
    ? json({ ok: true, value: result.value ?? null })
    : json({ ok: false, error: result.error }, STATUS[result.error]);
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const body: unknown = JSON.parse(text);
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function bearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}
