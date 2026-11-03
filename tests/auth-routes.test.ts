import { describe, expect, it } from 'vitest';
import { handleAuthRequest } from '../worker/src/auth/auth-routes';
import { AuthService } from '../worker/src/auth/auth-service';
import { MemoryUserRepository } from '../worker/src/auth/memory-user-repository';
import { AuthError } from '../src/enums/auth-error.enum';

const codes: string[] = [];
const service = new AuthService(new MemoryUserRepository(), {
  sendConfirmationCode: async (_to, _name, code) => void codes.push(code),
});

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await handleAuthRequest(
    new Request(`https://x.test${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    service,
  );
  return { res: res!, json: (await res!.json()) as Record<string, unknown> };
}

describe('auth routes', () => {
  it('ignores non-auth paths', async () => {
    expect(await handleAuthRequest(new Request('https://x.test/ws'), service)).toBeNull();
  });

  it('answers CORS preflight', async () => {
    const res = await handleAuthRequest(new Request('https://x.test/api/auth/login', { method: 'OPTIONS' }), service);
    expect(res!.status).toBe(204);
    expect(res!.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('runs the full register → confirm → login → me → logout flow', async () => {
    const body = { name: 'Bob', email: 'bob@example.com', password: 'correct-horse-9' };
    expect((await call('POST', '/api/auth/register', body)).res.status).toBe(200);
    const bad = await call('POST', '/api/auth/confirm', { email: body.email, code: '000000' });
    expect(bad.res.status).toBe(codes[0] === '000000' ? 200 : 400);
    expect((await call('POST', '/api/auth/confirm', { email: body.email, code: codes[0] })).res.status).toBe(200);
    const login = await call('POST', '/api/auth/login', { email: body.email, password: body.password });
    const value = login.json.value as { token: string };
    expect(login.res.status).toBe(200);
    const me = await call('GET', '/api/auth/me', undefined, value.token);
    expect(me.json.value).toMatchObject({ name: 'Bob', email: body.email });
    expect(JSON.stringify(me.json)).not.toContain('passwordHash');
    expect((await call('POST', '/api/auth/logout', {}, value.token)).res.status).toBe(200);
    expect((await call('GET', '/api/auth/me', undefined, value.token)).res.status).toBe(401);
  });

  it('maps errors to statuses and rejects malformed bodies', async () => {
    const bad = await call('POST', '/api/auth/login', { email: 'a@b.co', password: 'x' });
    expect(bad.res.status).toBe(401);
    expect(bad.json).toEqual({ ok: false, error: AuthError.INVALID_CREDENTIALS });
    const res = await handleAuthRequest(new Request('https://x.test/api/auth/register', { method: 'POST', body: 'not json' }), service);
    expect(res!.status).toBe(400);
  });
});
