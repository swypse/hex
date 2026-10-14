import type { GameResultInput, TribeModeBest } from '../../../src/results/result-types';

/** Storage port for finished-game results. */
export interface ResultRepository {
  /** Stores the result; a repeated `result.id` is ignored. */
  saveResult(userId: string, result: GameResultInput, createdAt: number): Promise<void>;
  /** Bests per (tribe, mode) the user has played (others are absent). */
  bestByTribeMode(userId: string): Promise<TribeModeBest[]>;
}
