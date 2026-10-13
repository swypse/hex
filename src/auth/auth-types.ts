import type { AuthError } from '../enums/auth-error.enum';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface AuthSession {
  token: string;
  user: UserProfile;
}

export type AuthResult<T = void> = { ok: true; value: T } | { ok: false; error: AuthError };

/** What the game needs from an auth backend. `HttpAuthClient` talks to the
 *  worker; implement it to plug in another backend. */
export interface AuthClient {
  register(input: RegisterInput): Promise<AuthResult>;
  confirm(email: string, code: string): Promise<AuthResult>;
  resendCode(email: string): Promise<AuthResult>;
  login(email: string, password: string): Promise<AuthResult<AuthSession>>;
  logout(token: string): Promise<AuthResult>;
  me(token: string): Promise<AuthResult<UserProfile>>;
}
