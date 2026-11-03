import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../relay-room';
import type { GameResultInput, TribeModeBest } from '../../../src/results/result-types';
import { SqlResultRepository } from '../results/sql-result-repository';
import type { ResultRepository } from '../results/result-repository';
import { SqlUserRepository } from './sql-user-repository';
import type { CodeRecord, SessionRecord, UserRecord, UserRepository } from './user-repository';

/** The single Durable Object holding all accounts and results. Its RPC methods
 *  are the `UserRepository` and `ResultRepository` ports, so a stub of it can
 *  be handed to `AuthService` / `ResultService`. */
export class UserDirectory extends DurableObject<Env> implements UserRepository, ResultRepository {
  #repo: SqlUserRepository;
  #results: SqlResultRepository;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#repo = new SqlUserRepository(ctx.storage.sql);
    this.#results = new SqlResultRepository(ctx.storage.sql);
  }

  createUser(user: UserRecord): Promise<boolean> {
    return this.#repo.createUser(user);
  }
  findByEmail(email: string): Promise<UserRecord | null> {
    return this.#repo.findByEmail(email);
  }
  findById(id: string): Promise<UserRecord | null> {
    return this.#repo.findById(id);
  }
  setConfirmed(userId: string): Promise<void> {
    return this.#repo.setConfirmed(userId);
  }
  saveCode(userId: string, code: CodeRecord): Promise<void> {
    return this.#repo.saveCode(userId, code);
  }
  getCode(userId: string): Promise<CodeRecord | null> {
    return this.#repo.getCode(userId);
  }
  bumpCodeAttempts(userId: string): Promise<number> {
    return this.#repo.bumpCodeAttempts(userId);
  }
  deleteCode(userId: string): Promise<void> {
    return this.#repo.deleteCode(userId);
  }
  createSession(tokenHash: string, session: SessionRecord): Promise<void> {
    return this.#repo.createSession(tokenHash, session);
  }
  getSession(tokenHash: string): Promise<SessionRecord | null> {
    return this.#repo.getSession(tokenHash);
  }
  deleteSession(tokenHash: string): Promise<void> {
    return this.#repo.deleteSession(tokenHash);
  }
  saveResult(userId: string, result: GameResultInput, createdAt: number): Promise<void> {
    return this.#results.saveResult(userId, result, createdAt);
  }
  bestByTribeMode(userId: string): Promise<TribeModeBest[]> {
    return this.#results.bestByTribeMode(userId);
  }
}
