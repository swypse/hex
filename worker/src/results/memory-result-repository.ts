import type { GameResultInput, TribeBest } from '../../../src/results/result-types';
import type { ResultRepository } from './result-repository';

export class MemoryResultRepository implements ResultRepository {
  private rows = new Map<string, { userId: string; result: GameResultInput }>();

  async saveResult(userId: string, result: GameResultInput): Promise<void> {
    if (!this.rows.has(result.id)) this.rows.set(result.id, { userId, result });
  }

  async bestByTribe(userId: string): Promise<TribeBest[]> {
    const best = new Map<number, TribeBest>();
    for (const row of this.rows.values()) {
      if (row.userId !== userId) continue;
      const { tribe, score, stars } = row.result;
      const cur = best.get(tribe) ?? { tribe, games: 0, maxScore: 0, maxStars: 0 };
      best.set(tribe, {
        tribe,
        games: cur.games + 1,
        maxScore: Math.max(cur.maxScore, score),
        maxStars: Math.max(cur.maxStars, stars),
      });
    }
    return [...best.values()];
  }
}
