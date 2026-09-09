import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY_PROFILES } from '../src/game/aiDifficulty';

describe('AiDifficulty naval profile', () => {
  it('exposes a navalThreatRadius knob that grows with difficulty', () => {
    const easy = AI_DIFFICULTY_PROFILES.easy.navalThreatRadius;
    const normal = AI_DIFFICULTY_PROFILES.normal.navalThreatRadius;
    const hard = AI_DIFFICULTY_PROFILES.hard.navalThreatRadius;
    expect(easy).toBeLessThan(normal);
    expect(normal).toBeLessThan(hard);
    expect(normal).toBe(10);
  });
});
