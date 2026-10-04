import { WeatherType } from '@enums';
import { SEASONS } from './season';

export const RESOURCE_CHEAT_WORD = 'resources';
export const RESOURCE_CHEAT_AMOUNT = 1000;
export const SKILLS_CHEAT_WORD = 'skills';
export const FOG_CHEAT_WORD = 'fog';
export const PIRATES_CHEAT_WORD = 'pirates';
export const AI_LOGS_CHEAT_WORD = 'ailogs';
export const WIN_CHEAT_WORD = 'winwin';
/** Typing a season's name forces that season (single-player). */
export const SEASON_CHEAT_WORDS: readonly string[] = SEASONS;
/** Typing a weather type's name starts that event now (single-player). */
export const WEATHER_CHEAT_WORDS: readonly string[] = Object.values(WeatherType);
const CHEAT_WORDS = [RESOURCE_CHEAT_WORD, SKILLS_CHEAT_WORD, FOG_CHEAT_WORD, PIRATES_CHEAT_WORD, AI_LOGS_CHEAT_WORD, WIN_CHEAT_WORD, ...SEASON_CHEAT_WORDS, ...WEATHER_CHEAT_WORDS];
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
