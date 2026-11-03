import type { CodeRecord, SessionRecord, UserRecord, UserRepository } from './user-repository';

/** In-memory repository for tests and local experiments. */
export class MemoryUserRepository implements UserRepository {
  private users = new Map<string, UserRecord>();
  private codes = new Map<string, CodeRecord>();
  private sessions = new Map<string, SessionRecord>();

  async createUser(user: UserRecord): Promise<boolean> {
    const existing = await this.findByEmail(user.email);
    if (existing?.confirmed) return false;
    this.users.set(existing?.id ?? user.id, { ...user, id: existing?.id ?? user.id });
    return true;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    for (const u of this.users.values()) if (u.email === email) return { ...u };
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async setConfirmed(userId: string): Promise<void> {
    const u = this.users.get(userId);
    if (u) u.confirmed = true;
  }

  async saveCode(userId: string, code: CodeRecord): Promise<void> {
    this.codes.set(userId, { ...code });
  }

  async getCode(userId: string): Promise<CodeRecord | null> {
    const c = this.codes.get(userId);
    return c ? { ...c } : null;
  }

  async bumpCodeAttempts(userId: string): Promise<number> {
    const c = this.codes.get(userId);
    if (!c) return 0;
    c.attempts += 1;
    return c.attempts;
  }

  async deleteCode(userId: string): Promise<void> {
    this.codes.delete(userId);
  }

  async createSession(tokenHash: string, session: SessionRecord): Promise<void> {
    this.sessions.set(tokenHash, { ...session });
  }

  async getSession(tokenHash: string): Promise<SessionRecord | null> {
    const s = this.sessions.get(tokenHash);
    return s ? { ...s } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }
}
