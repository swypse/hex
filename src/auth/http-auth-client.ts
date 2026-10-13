import type { AuthClient, AuthResult, AuthSession, RegisterInput, UserProfile } from './auth-types';
import { apiOrigin, jsonCall } from './json-call';

const AUTH_PATH = '/api/auth';

/** The auth API lives on the relay worker: ws(s)://host/ws → http(s)://host/api/auth. */
export function authBaseUrl(relayUrl?: string): string {
  const url = apiOrigin(relayUrl);
  url.pathname = AUTH_PATH;
  return url.toString();
}

/** `AuthClient` over the worker's JSON API. */
export class HttpAuthClient implements AuthClient {
  constructor(
    private readonly baseUrl: () => string = authBaseUrl,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  register(input: RegisterInput): Promise<AuthResult> {
    return this.call('POST', '/register', input);
  }

  confirm(email: string, code: string): Promise<AuthResult> {
    return this.call('POST', '/confirm', { email, code });
  }

  resendCode(email: string): Promise<AuthResult> {
    return this.call('POST', '/resend', { email });
  }

  login(email: string, password: string): Promise<AuthResult<AuthSession>> {
    return this.call('POST', '/login', { email, password });
  }

  logout(token: string): Promise<AuthResult> {
    return this.call('POST', '/logout', {}, token);
  }

  me(token: string): Promise<AuthResult<UserProfile>> {
    return this.call('GET', '/me', undefined, token);
  }

  private call<T>(method: string, path: string, body?: unknown, token?: string): Promise<AuthResult<T>> {
    return jsonCall<T>(this.fetchFn, this.baseUrl() + path, method, body, token);
  }
}
