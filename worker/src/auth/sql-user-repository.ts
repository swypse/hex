import type { CodeRecord, SessionRecord, UserRecord, UserRepository } from './user-repository';

/** The slice of Durable Object `SqlStorage` the repository uses. */
export interface SqlLike {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS codes (
    user_id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
];

const toUser = (r: Record<string, unknown>): UserRecord => ({
  id: r.id as string,
  name: r.name as string,
  email: r.email as string,
  passwordHash: r.password_hash as string,
  confirmed: r.confirmed === 1,
  createdAt: r.created_at as number,
});

/** `UserRepository` over SQLite (Durable Object storage). */
export class SqlUserRepository implements UserRepository {
  constructor(private readonly sql: SqlLike) {
    for (const statement of SCHEMA) sql.exec(statement);
  }

  private rows(query: string, ...bindings: unknown[]): Record<string, unknown>[] {
    return this.sql.exec(query, ...bindings).toArray();
  }

  async createUser(user: UserRecord): Promise<boolean> {
    const existing = await this.findByEmail(user.email);
    if (existing?.confirmed) return false;
    if (existing) {
      this.rows(
        'UPDATE users SET name = ?, password_hash = ?, created_at = ? WHERE id = ?',
        user.name, user.passwordHash, user.createdAt, existing.id,
      );
    } else {
      this.rows(
        'INSERT INTO users (id, name, email, password_hash, confirmed, created_at) VALUES (?, ?, ?, ?, 0, ?)',
        user.id, user.name, user.email, user.passwordHash, user.createdAt,
      );
    }
    return true;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = this.rows('SELECT * FROM users WHERE email = ?', email)[0];
    return row ? toUser(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = this.rows('SELECT * FROM users WHERE id = ?', id)[0];
    return row ? toUser(row) : null;
  }

  async setConfirmed(userId: string): Promise<void> {
    this.rows('UPDATE users SET confirmed = 1 WHERE id = ?', userId);
  }

  async saveCode(userId: string, code: CodeRecord): Promise<void> {
    this.rows(
      'INSERT OR REPLACE INTO codes (user_id, code_hash, expires_at, sent_at, attempts) VALUES (?, ?, ?, ?, ?)',
      userId, code.codeHash, code.expiresAt, code.sentAt, code.attempts,
    );
  }

  async getCode(userId: string): Promise<CodeRecord | null> {
    const r = this.rows('SELECT * FROM codes WHERE user_id = ?', userId)[0];
    return r
      ? { codeHash: r.code_hash as string, expiresAt: r.expires_at as number, sentAt: r.sent_at as number, attempts: r.attempts as number }
      : null;
  }

  async bumpCodeAttempts(userId: string): Promise<number> {
    this.rows('UPDATE codes SET attempts = attempts + 1 WHERE user_id = ?', userId);
    return ((await this.getCode(userId))?.attempts) ?? 0;
  }

  async deleteCode(userId: string): Promise<void> {
    this.rows('DELETE FROM codes WHERE user_id = ?', userId);
  }

  async createSession(tokenHash: string, session: SessionRecord): Promise<void> {
    this.rows(
      'INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      tokenHash, session.userId, session.expiresAt,
    );
  }

  async getSession(tokenHash: string): Promise<SessionRecord | null> {
    const r = this.rows('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', tokenHash)[0];
    return r ? { userId: r.user_id as string, expiresAt: r.expires_at as number } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.rows('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
  }
}
