import { describe, expect, it } from 'vitest';
import { waterWaveOffset, WATER_WAVE_PERIOD, WATER_WAVE_AMPLITUDE } from '../src/render/waves';

describe('waterWaveOffset', () => {
  it('crests on even-q diagonals and troughs on odd-q diagonals at the cycle start', () => {
    expect(waterWaveOffset(0, 0)).toBe(-WATER_WAVE_AMPLITUDE);
    expect(waterWaveOffset(1, 0)).toBe(WATER_WAVE_AMPLITUDE);
  });

  it('keeps even-q and odd-q tiles in opposite phases at all times', () => {
    for (const now of [0, 100, 400, 800, 1234, WATER_WAVE_PERIOD * 2.5]) {
      expect(waterWaveOffset(0, now)).toBeCloseTo(-waterWaveOffset(1, now), 10);
      expect(waterWaveOffset(2, now)).toBeCloseTo(waterWaveOffset(0, now), 10);
    }
  });

  it('completes a full up-down cycle each period and repeats it', () => {
    expect(waterWaveOffset(0, WATER_WAVE_PERIOD)).toBeCloseTo(-WATER_WAVE_AMPLITUDE, 10);
    expect(waterWaveOffset(1, WATER_WAVE_PERIOD / 2)).toBeCloseTo(-WATER_WAVE_AMPLITUDE, 10);
    expect(waterWaveOffset(0, WATER_WAVE_PERIOD * 3)).toBeCloseTo(-WATER_WAVE_AMPLITUDE, 10);
  });
});
