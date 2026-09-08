import { describe, expect, it } from 'vitest';
import { sfx, soundUrl } from '../src/sound/sfx';

describe('sfx', () => {
  it('maps known names to the public sounds directory', () => {
    expect(soundUrl('click')).toMatch(/sounds\/click\.wav$/);
  });

  it('returns null for an unknown name', () => {
    expect(soundUrl('missing')).toBeNull();
  });

  it('no-ops play when Audio is unavailable', () => {
    expect(() => sfx.play('click')).not.toThrow();
    expect(() => sfx.play('missing')).not.toThrow();
  });
});
