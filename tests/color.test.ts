import { describe, it, expect } from 'vitest';
import { shadeColor } from '../src/util/color';

describe('shadeColor', () => {
  it('darkens by multiplying channels', () => {
    expect(shadeColor(0x808080, 0.5)).toBe(0x404040);
    expect(shadeColor(0x4c9a3d, 0.55)).toBe(0x2a5522);
  });

  it('lightens by multiplying channels', () => {
    expect(shadeColor(0x204060, 1.5)).toBe(0x306090);
  });

  it('clamps channels to 0 and 255', () => {
    expect(shadeColor(0x000000, 0.5)).toBe(0x000000);
    expect(shadeColor(0xffffff, 2)).toBe(0xffffff);
    expect(shadeColor(0x0000ff, 1.35)).toBe(0x0000ff);
  });
});
