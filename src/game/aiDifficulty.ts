export type AiDifficulty = 'easy' | 'normal' | 'hard';

export interface AiDifficultyProfile {
  /** Probability (0..1) that a planned action is replaced by a random one. */
  mistakeChance: number;
  /** How many enemy turns of advance warning trigger village defense. */
  guardWindow: number;
  /** Minimum ownPower / enemyPower ratio required to adopt the war stance. */
  warRatio: number;
  /** Whether single attacks are gated by the favorable-trade check. */
  checkTrades: boolean;
  /** Money kept in reserve before the AI will spend on a spawn. */
  spawnReserve: number;
}

export const DEFAULT_AI_DIFFICULTY: AiDifficulty = 'normal';

export const AI_DIFFICULTY_PROFILES: Record<AiDifficulty, AiDifficultyProfile> = {
  easy: { mistakeChance: 0.25, guardWindow: 1, warRatio: 2.5, checkTrades: false, spawnReserve: 8 },
  normal: { mistakeChance: 0, guardWindow: 2, warRatio: 1.5, checkTrades: true, spawnReserve: 4 },
  hard: { mistakeChance: 0, guardWindow: 3, warRatio: 1.0, checkTrades: true, spawnReserve: 0 },
};

export function difficultyFor(player: { difficulty?: AiDifficulty }): AiDifficulty {
  return player.difficulty ?? DEFAULT_AI_DIFFICULTY;
}

export function profileFor(player: { difficulty?: AiDifficulty }): AiDifficultyProfile {
  return AI_DIFFICULTY_PROFILES[difficultyFor(player)];
}
