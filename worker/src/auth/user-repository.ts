export interface UserRecord {
  id: string;
  name: string;
  /** Normalized (trimmed, lower-case). */
  email: string;
  passwordHash: string;
  confirmed: boolean;
  createdAt: number;
}

export interface CodeRecord {
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
}

export interface SessionRecord {
  userId: string;
  expiresAt: number;
}

/** Storage port of the auth service. Pure persistence: no hashing, no HTTP.
 *  Implement it to keep users in another store (D1, external API, …). */
export interface UserRepository {
  /** Inserts the user, or replaces an existing *unconfirmed* user with the same
   *  email (keeping its id). Returns false when a confirmed user owns the email. */
  createUser(user: UserRecord): Promise<boolean>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  setConfirmed(userId: string): Promise<void>;

  saveCode(userId: string, code: CodeRecord): Promise<void>;
  getCode(userId: string): Promise<CodeRecord | null>;
  /** Increments the failed-attempt counter and returns the new value. */
  bumpCodeAttempts(userId: string): Promise<number>;
  deleteCode(userId: string): Promise<void>;

  /** Sessions are keyed by the hash of the token, never the token itself. */
  createSession(tokenHash: string, session: SessionRecord): Promise<void>;
  getSession(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
}
