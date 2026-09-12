export type AiDifficulty = 'easy' | 'normal' | 'hard';

export interface AiStrategyProfile {
  planIntervalTurns: number;
  musterFactor: number;
  assaultRatio: number;
  economyCap: number;
}

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
  /** Hex radius within which a visible naval enemy triggers the naval response. */
  navalThreatRadius: number;
  /** Strategic-plan steering (plan depth, muster strictness, thresholds). */
  strategy: AiStrategyProfile;
}

export const DEFAULT_AI_DIFFICULTY: AiDifficulty = 'normal';

export const AI_DIFFICULTY_PROFILES: Record<AiDifficulty, AiDifficultyProfile> = {
  easy: { mistakeChance: 0.25, guardWindow: 1, warRatio: 2.5, checkTrades: false, spawnReserve: 8, navalThreatRadius: 6, strategy: { planIntervalTurns: 6, musterFactor: 0.6, assaultRatio: 1.8, economyCap: 1 } },
  normal: { mistakeChance: 0, guardWindow: 2, warRatio: 1.5, checkTrades: true, spawnReserve: 4, navalThreatRadius: 10, strategy: { planIntervalTurns: 4, musterFactor: 1.0, assaultRatio: 1.3, economyCap: 2 } },
  hard: { mistakeChance: 0, guardWindow: 3, warRatio: 1.0, checkTrades: true, spawnReserve: 0, navalThreatRadius: 14, strategy: { planIntervalTurns: 2, musterFactor: 1.5, assaultRatio: 1.0, economyCap: 2 } },
};

export function difficultyFor(player: { difficulty?: AiDifficulty }): AiDifficulty {
  return player.difficulty ?? DEFAULT_AI_DIFFICULTY;
}

export function profileFor(player: { difficulty?: AiDifficulty }): AiDifficultyProfile {
  return AI_DIFFICULTY_PROFILES[difficultyFor(player)];
}
