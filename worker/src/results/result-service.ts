import type { AuthResult } from '../../../src/auth/auth-types';
import { AuthError } from '../../../src/enums/auth-error.enum';
import { ALL_TRIBES, parseGameResult } from '../../../src/results/result-validation';
import { foldTribeBest, type TribeBest } from '../../../src/results/result-types';
import type { ResultRepository } from './result-repository';

/** Records finished games and reports per-tribe bests. */
export class ResultService {
  constructor(
    private readonly repo: ResultRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async record(userId: string, raw: unknown): Promise<AuthResult> {
    const result = parseGameResult(raw);
    if (!result) return { ok: false, error: AuthError.INVALID_INPUT };
    await this.repo.saveResult(userId, result, this.now());
    return { ok: true, value: undefined };
  }

  /** One entry per tribe, zeroed for tribes the user has not played. */
  async bests(userId: string): Promise<TribeBest[]> {
    const rows = await this.repo.bestByTribeMode(userId);
    return ALL_TRIBES.map((tribe) => foldTribeBest(tribe, rows));
  }
}
