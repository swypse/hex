import type { GameResultInput, TribeBest } from '../../../src/results/result-types';

/** Storage port for finished-game results. */
export interface ResultRepository {
  /** Stores the result; a repeated `result.id` is ignored. */
  saveResult(userId: string, result: GameResultInput, createdAt: number): Promise<void>;
  /** Bests of the tribes the user has played (others are absent). */
  bestByTribe(userId: string): Promise<TribeBest[]>;
}
