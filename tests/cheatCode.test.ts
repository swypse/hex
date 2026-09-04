import { describe, it, expect } from 'vitest';
import {
  advanceCheatBuffer,
  cheatCodeTriggered,
  RESOURCE_CHEAT_WORD,
} from '../src/game/cheats';

function type(word: string, buffer = ''): string {
  for (const ch of word) buffer = advanceCheatBuffer(buffer, ch);
  return buffer;
}

describe('cheat code buffer', () => {
  it('accumulates letters case-insensitively and triggers on the word', () => {
    const buffer = type('REsouRCes');
    expect(buffer).toBe(RESOURCE_CHEAT_WORD);
    expect(cheatCodeTriggered(buffer)).toBe(true);
  });

  it('does not trigger on a partial word', () => {
    expect(cheatCodeTriggered(type('resour'))).toBe(false);
  });

  it('triggers when the word appears at the end of typed text', () => {
    expect(cheatCodeTriggered(type('abcresources'))).toBe(true);
  });

  it('does not trigger when the word is interrupted by other letters', () => {
    expect(cheatCodeTriggered(type('resourxces'))).toBe(false);
  });

  it('keeps the buffer bounded', () => {
    let buffer = '';
    for (let i = 0; i < 300; i++) buffer = advanceCheatBuffer(buffer, 'a');
    expect(buffer.length).toBeLessThanOrEqual(64);
  });
});
