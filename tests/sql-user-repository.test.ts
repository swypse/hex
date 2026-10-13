import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { SqlUserRepository } from '../worker/src/auth/sql-user-repository';
import type { UserRecord } from '../worker/src/auth/user-repository';

// Loaded via require: vite cannot resolve the `node:sqlite` builtin in an import.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };

const user = (over: Partial<UserRecord> = {}): UserRecord => ({
  id: 'u1', name: 'Ann', email: 'ann@example.com', passwordHash: 'h', confirmed: false, createdAt: 1, ...over,
});

describe('SqlUserRepository', () => {
  let repo: SqlUserRepository;

  beforeEach(() => {
    const db = new DatabaseSync(':memory:');
    repo = new SqlUserRepository({
      // Like DO SqlStorage, the statement runs on exec, not on toArray.
      exec: (q, ...b) => {
        const rows = db.prepare(q).all(...(b as never[])) as Record<string, unknown>[];
        return { toArray: () => rows };
      },
    });
  });

  it('creates, finds and confirms users', async () => {
    expect(await repo.createUser(user())).toBe(true);
    expect((await repo.findByEmail('ann@example.com'))?.confirmed).toBe(false);
    await repo.setConfirmed('u1');
    expect((await repo.findById('u1'))?.confirmed).toBe(true);
  });

  it('replaces an unconfirmed user but never a confirmed one', async () => {
    await repo.createUser(user());
    expect(await repo.createUser(user({ id: 'u2', name: 'Ann2', passwordHash: 'h2' }))).toBe(true);
    expect(await repo.findByEmail('ann@example.com')).toMatchObject({ id: 'u1', name: 'Ann2', passwordHash: 'h2' });
    await repo.setConfirmed('u1');
    expect(await repo.createUser(user({ id: 'u3' }))).toBe(false);
  });

  it('stores codes with attempt counting', async () => {
    await repo.saveCode('u1', { codeHash: 'c', expiresAt: 5, sentAt: 1, attempts: 0 });
    expect(await repo.bumpCodeAttempts('u1')).toBe(1);
    expect(await repo.getCode('u1')).toMatchObject({ codeHash: 'c', attempts: 1 });
    await repo.deleteCode('u1');
    expect(await repo.getCode('u1')).toBeNull();
  });

  it('stores and deletes sessions', async () => {
    await repo.createSession('t', { userId: 'u1', expiresAt: 9 });
    expect(await repo.getSession('t')).toEqual({ userId: 'u1', expiresAt: 9 });
    await repo.deleteSession('t');
    expect(await repo.getSession('t')).toBeNull();
  });
});
