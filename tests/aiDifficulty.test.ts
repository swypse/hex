import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY_PROFILES, DEFAULT_AI_DIFFICULTY, difficultyFor, profileFor } from '../src/game/aiDifficulty';

describe('AI difficulty', () => {
  it('defaults to normal', () => {
    expect(DEFAULT_AI_DIFFICULTY).toBe('normal');
    expect(difficultyFor({})).toBe('normal');
    expect(difficultyFor({ difficulty: undefined })).toBe('normal');
  });

  it('returns the stored difficulty', () => {
    expect(difficultyFor({ difficulty: 'easy' })).toBe('easy');
    expect(difficultyFor({ difficulty: 'hard' })).toBe('hard');
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
    expect(profileFor({ difficulty: 'hard' })).toBe(AI_DIFFICULTY_PROFILES.hard);
  });
});
