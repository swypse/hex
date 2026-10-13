import type { AuthResult } from '../../../src/auth/auth-types';
import { AuthError } from '../../../src/enums/auth-error.enum';
import { ALL_TRIBES, parseGameResult } from '../../../src/results/result-validation';
import type { TribeBest } from '../../../src/results/result-types';
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
    const played = new Map((await this.repo.bestByTribe(userId)).map((b) => [b.tribe, b]));
    return ALL_TRIBES.map((tribe) => played.get(tribe) ?? { tribe, games: 0, maxScore: 0, maxStars: 0 });
  }
}
