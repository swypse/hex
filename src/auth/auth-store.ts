import { create } from 'zustand';
import { AuthError, AuthStatus } from '@enums';
import { storageService, type StorageService } from '../storage/storage-service';
import type { AuthClient, AuthResult, UserProfile } from './auth-types';
import { HttpAuthClient } from './http-auth-client';

const TOKEN_KEY = 'hex-auth-token-v1';

interface AuthState {
  status: AuthStatus;
  user: UserProfile | null;
  /** Session token while authenticated, for authorizing other API calls. */
  token: string | null;
  /** Checks the stored session once; no-op after the first call. */
  restore(): Promise<void>;
  login(email: string, password: string): Promise<AuthResult>;
  logout(): Promise<void>;
}

/** Keeps the session token in `storage`; storage failures degrade to a
 *  session that lasts until reload. */
export function createAuthStore(client: AuthClient, storage: StorageService) {
  const readToken = (): string | null => {
    try {
      return storage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  };
  const writeToken = (token: string | null): void => {
    try {
      if (token) storage.setItem(TOKEN_KEY, token);
      else storage.removeItem(TOKEN_KEY);
    } catch {
      // storage unavailable — ignore.
    }
  };
  let restoring: Promise<void> | null = null;

  return create<AuthState>((set, get) => ({
    status: AuthStatus.UNKNOWN,
    user: null,
    token: null,

    restore() {
      restoring ??= (async () => {
        const token = readToken();
        if (!token) return set({ status: AuthStatus.ANONYMOUS });
        const res = await client.me(token);
        if (res.ok) {
          return set({ status: AuthStatus.AUTHENTICATED, user: res.value, token });
        }
        // Offline keeps the token for the next start; a rejected one is dropped.
        if (res.error !== AuthError.NETWORK) writeToken(null);
        set({ status: AuthStatus.ANONYMOUS });
      })();
      return restoring;
    },

    async login(email, password) {
      const res = await client.login(email, password);
      if (!res.ok) return res;
      writeToken(res.value.token);
      set({ status: AuthStatus.AUTHENTICATED, user: res.value.user, token: res.value.token });
      return { ok: true, value: undefined };
    },

    async logout() {
      const token = get().token ?? readToken();
      writeToken(null);
      set({ status: AuthStatus.ANONYMOUS, user: null, token: null });
      if (token) await client.logout(token);
    },
  }));
}

export const authClient: AuthClient = new HttpAuthClient();
export const useAuthStore = createAuthStore(authClient, storageService);
