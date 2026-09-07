export const RESOURCE_CHEAT_WORD = 'resources';
export const RESOURCE_CHEAT_AMOUNT = 100;
export const SKILLS_CHEAT_WORD = 'skills';
const CHEAT_WORDS = [RESOURCE_CHEAT_WORD, SKILLS_CHEAT_WORD];
const MAX_BUFFER = 64;

/** Append a typed key (lowercased) to the rolling cheat buffer, keeping the
 *  buffer bounded so it can never grow without limit. */
export function advanceCheatBuffer(buffer: string, key: string): string {
  return `${buffer}${key.toLowerCase()}`.slice(-MAX_BUFFER);
}

/** True when the buffer ends with any cheat word. */
export function cheatCodeTriggered(buffer: string): boolean {
  return CHEAT_WORDS.some((word) => buffer.endsWith(word));
}

/** Returns which cheat word the buffer currently ends with, or null. */
export function triggeredCheat(buffer: string): string | null {
  return CHEAT_WORDS.find((word) => buffer.endsWith(word)) ?? null;
}
