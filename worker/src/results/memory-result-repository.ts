import type { GameResultInput, TribeModeBest } from '../../../src/results/result-types';
import type { ResultRepository } from './result-repository';

export class MemoryResultRepository implements ResultRepository {
  private rows = new Map<string, { userId: string; result: GameResultInput }>();

  async saveResult(userId: string, result: GameResultInput): Promise<void> {
    if (!this.rows.has(result.id)) this.rows.set(result.id, { userId, result });
  }

  async bestByTribeMode(userId: string): Promise<TribeModeBest[]> {
    const best = new Map<string, TribeModeBest>();
    for (const row of this.rows.values()) {
      if (row.userId !== userId) continue;
      const { tribe, mode, score, stars } = row.result;
      const key = `${tribe}:${mode}`;
      const cur = best.get(key) ?? { tribe, mode, games: 0, maxScore: 0, maxStars: 0 };
      best.set(key, {
        tribe,
        mode,
        games: cur.games + 1,
        maxScore: Math.max(cur.maxScore, score),
        maxStars: Math.max(cur.maxStars, stars),
      });
    }
    return [...best.values()];
  }
}
