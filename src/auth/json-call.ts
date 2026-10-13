import { AuthError } from '@enums';
import { resolveRelayUrl } from '../net/relay-session';
import type { AuthResult } from './auth-types';

/** The worker's HTTP API root: ws(s)://host/ws → http(s)://host. */
export function apiOrigin(relayUrl: string = resolveRelayUrl()): URL {
  const url = new URL(relayUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '';
  url.search = '';
  return url;
}

/** One JSON request to the worker; every failure becomes an `AuthResult` error. */
export async function jsonCall<T>(
  fetchFn: typeof fetch,
  url: string,
  method: string,
  body?: unknown,
  token?: string | null,
): Promise<AuthResult<T>> {
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetchFn(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; value?: T; error?: AuthError };
    if (json.ok) return { ok: true, value: json.value as T };
    return { ok: false, error: json.error ?? AuthError.NETWORK };
  } catch {
    return { ok: false, error: AuthError.NETWORK };
  }
}
