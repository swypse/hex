import { describe, it, expect } from 'vitest';
import { generateRoomCode, isRoomCode } from '../src/net/peerSession';

describe('peerSession protocol helpers', () => {
  it('generateRoomCode returns 6 chars from the safe alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(900);
  });

  it('isRoomCode validates only codes from the safe alphabet', () => {
    expect(isRoomCode('ABCDEF')).toBe(true);
    expect(isRoomCode('QRSTU9')).toBe(true);
    expect(isRoomCode('ABC123')).toBe(false);
    expect(isRoomCode('A1B2C3')).toBe(false);
    expect(isRoomCode('ABCDEFG')).toBe(false);
    expect(isRoomCode('abc123')).toBe(false);
  });
});
