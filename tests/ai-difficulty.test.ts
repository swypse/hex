import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY_PROFILES, DEFAULT_AI_DIFFICULTY, difficultyFor, profileFor } from '../src/game/ai-difficulty';
import { AiDifficulty } from '@enums';

describe('AI difficulty', () => {
  it('defaults to normal', () => {
    expect(DEFAULT_AI_DIFFICULTY).toBe(AiDifficulty.NORMAL);
    expect(difficultyFor({})).toBe(AiDifficulty.NORMAL);
    expect(difficultyFor({ difficulty: undefined })).toBe(AiDifficulty.NORMAL);
  });

  it('returns the stored difficulty', () => {
    expect(difficultyFor({ difficulty: AiDifficulty.EASY })).toBe(AiDifficulty.EASY);
    expect(difficultyFor({ difficulty: AiDifficulty.HARD })).toBe(AiDifficulty.HARD);
  });

  it('easy makes mistakes, hard defends earlier and presses war', () => {
    const easy = AI_DIFFICULTY_PROFILES.easy;
    const normal = AI_DIFFICULTY_PROFILES.normal;
    const hard = AI_DIFFICULTY_PROFILES.hard;
    expect(easy.mistakeChance).toBeGreaterThan(0);
    expect(normal.mistakeChance).toBe(0);
    expect(hard.mistakeChance).toBe(0);
    expect(easy.guardWindow).toBeLessThan(normal.guardWindow);
    expect(normal.guardWindow).toBeLessThan(hard.guardWindow);
    expect(hard.warRatio).toBeLessThan(normal.warRatio);
    expect(normal.warRatio).toBeLessThan(easy.warRatio);
    expect(easy.checkTrades).toBe(false);
    expect(normal.checkTrades).toBe(true);
    expect(hard.checkTrades).toBe(true);
    expect(profileFor({ difficulty: AiDifficulty.HARD })).toBe(AI_DIFFICULTY_PROFILES.hard);
  });
});
