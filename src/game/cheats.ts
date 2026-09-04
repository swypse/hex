export const RESOURCE_CHEAT_WORD = 'resources';
export const RESOURCE_CHEAT_AMOUNT = 100;
const MAX_BUFFER = 64;

/** Append a typed key (lowercased) to the rolling cheat buffer, keeping the
 *  buffer bounded so it can never grow without limit. */
export function advanceCheatBuffer(buffer: string, key: string): string {
  return `${buffer}${key.toLowerCase()}`.slice(-MAX_BUFFER);
}

/** True when the buffer ends with the cheat word. */
export function cheatCodeTriggered(buffer: string): boolean {
  return buffer.endsWith(RESOURCE_CHEAT_WORD);
}
