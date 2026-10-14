import { describe, expect, it, vi } from 'vitest';
import { AuthError, AuthStatus } from '@enums';
import { createAuthStore } from '../src/auth/auth-store';
import { authBaseUrl, HttpAuthClient } from '../src/auth/http-auth-client';
import type { AuthClient } from '../src/auth/auth-types';
import type { StorageService } from '../src/storage/storage-service';

const USER = { id: 'u1', name: 'Ann', email: 'ann@example.com' };

function memoryStorage(initial: Record<string, string> = {}): StorageService & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

function fakeClient(over: Partial<AuthClient> = {}): AuthClient {
  return {
    register: vi.fn(), confirm: vi.fn(), resendCode: vi.fn(),
    login: vi.fn(async () => ({ ok: true as const, value: { token: 'tok', user: USER } })),
    logout: vi.fn(async () => ({ ok: true as const, value: undefined })),
    me: vi.fn(async () => ({ ok: true as const, value: USER })),
    ...over,
  };
}

describe('auth store', () => {
  it('is anonymous without a stored token', async () => {
    const store = createAuthStore(fakeClient(), memoryStorage());
    await store.getState().restore();
    expect(store.getState().status).toBe(AuthStatus.ANONYMOUS);
  });

  it('restores a stored session', async () => {
    const store = createAuthStore(fakeClient(), memoryStorage({ 'hex-auth-token-v1': 'tok' }));
    await store.getState().restore();
    expect(store.getState()).toMatchObject({ status: AuthStatus.AUTHENTICATED, user: USER });
  });

  it('drops a rejected token but keeps one when offline', async () => {
    const rejected = memoryStorage({ 'hex-auth-token-v1': 'bad' });
    await createAuthStore(fakeClient({ me: async () => ({ ok: false, error: AuthError.UNAUTHORIZED }) }), rejected).getState().restore();
    expect(rejected.data['hex-auth-token-v1']).toBeUndefined();

    const offline = memoryStorage({ 'hex-auth-token-v1': 'tok' });
    await createAuthStore(fakeClient({ me: async () => ({ ok: false, error: AuthError.NETWORK }) }), offline).getState().restore();
    expect(offline.data['hex-auth-token-v1']).toBe('tok');
  });

  it('is offline when the API is unreachable', async () => {
    const down = fakeClient({ me: async () => ({ ok: false, error: AuthError.NETWORK }) });
    const bare = createAuthStore(down, memoryStorage());
    await bare.getState().restore();
    expect(bare.getState().status).toBe(AuthStatus.OFFLINE);
    const withToken = createAuthStore(down, memoryStorage({ 'hex-auth-token-v1': 'tok' }));
    await withToken.getState().restore();
    expect(withToken.getState().status).toBe(AuthStatus.OFFLINE);
  });

  it('stores the token on login and clears it on logout', async () => {
    const storage = memoryStorage();
    const client = fakeClient();
    const store = createAuthStore(client, storage);
    expect((await store.getState().login('a@b.co', 'pw')).ok).toBe(true);
    expect(storage.data['hex-auth-token-v1']).toBe('tok');
    await store.getState().logout();
    expect(storage.data['hex-auth-token-v1']).toBeUndefined();
    expect(store.getState()).toMatchObject({ status: AuthStatus.ANONYMOUS, user: null });
    expect(client.logout).toHaveBeenCalledWith('tok');
  });

  it('stays anonymous when login fails', async () => {
    const store = createAuthStore(fakeClient({ login: async () => ({ ok: false, error: AuthError.INVALID_CREDENTIALS }) }), memoryStorage());
    expect(await store.getState().login('a@b.co', 'pw')).toEqual({ ok: false, error: AuthError.INVALID_CREDENTIALS });
    expect(store.getState().status).toBe(AuthStatus.UNKNOWN);
  });
});

describe('HttpAuthClient', () => {
  it('derives the API url from the relay url', () => {
    expect(authBaseUrl('wss://hex-relay.swypse.workers.dev/ws')).toBe('https://hex-relay.swypse.workers.dev/api/auth');
    expect(authBaseUrl('ws://localhost:8787/ws?x=1')).toBe('http://localhost:8787/api/auth');
  });

  it('sends json + bearer and maps responses', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: AuthError.EMAIL_TAKEN }), { status: 409 }));
    const client = new HttpAuthClient(() => 'https://h/api/auth', fetchFn as unknown as typeof fetch);
    expect(await client.register({ name: 'A', email: 'a@b.co', password: 'password1' })).toEqual({ ok: false, error: AuthError.EMAIL_TAKEN });
    expect(fetchFn).toHaveBeenCalledWith('https://h/api/auth/register', expect.objectContaining({ method: 'POST' }));
  });

  it('reports network failures', async () => {
    const client = new HttpAuthClient(() => 'https://h/api/auth', (async () => { throw new Error('offline'); }) as unknown as typeof fetch);
    expect(await client.me('t')).toEqual({ ok: false, error: AuthError.NETWORK });
  });
});
