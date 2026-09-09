import { describe, it, expect } from 'vitest';
import {
  advanceCheatBuffer,
  cheatCodeTriggered,
  triggeredCheat,
  RESOURCE_CHEAT_WORD,
  SKILLS_CHEAT_WORD,
  FOG_CHEAT_WORD,
  PIRATES_CHEAT_WORD,
  AI_LOGS_CHEAT_WORD,
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

  it('triggers the skills cheat', () => {
    const buffer = type('skillS');
    expect(buffer).toBe(SKILLS_CHEAT_WORD);
    expect(triggeredCheat(buffer)).toBe(SKILLS_CHEAT_WORD);
  });

  it('triggers the fog cheat', () => {
    const buffer = type('fog');
    expect(buffer).toBe(FOG_CHEAT_WORD);
    expect(triggeredCheat(type('abcxfog'))).toBe(FOG_CHEAT_WORD);
  });

  it('triggers the pirates cheat', () => {
    const buffer = type('pirates');
    expect(buffer).toBe(PIRATES_CHEAT_WORD);
    expect(triggeredCheat(type('xxpirates'))).toBe(PIRATES_CHEAT_WORD);
    expect(cheatCodeTriggered(type('pira'))).toBe(false);
  });

  it('triggers the ailogs cheat', () => {
    const buffer = type('ailogs');
    expect(buffer).toBe(AI_LOGS_CHEAT_WORD);
    expect(triggeredCheat(type('xxailogs'))).toBe(AI_LOGS_CHEAT_WORD);
    expect(cheatCodeTriggered(type('ailo'))).toBe(false);
  });

  it('does not trigger on a partial word', () => {
    expect(cheatCodeTriggered(type('resour'))).toBe(false);
    expect(triggeredCheat(type('skil'))).toBeNull();
  });

  it('triggers when the word appears at the end of typed text', () => {
    expect(cheatCodeTriggered(type('abcresources'))).toBe(true);
    expect(triggeredCheat(type('xxskills'))).toBe(SKILLS_CHEAT_WORD);
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
