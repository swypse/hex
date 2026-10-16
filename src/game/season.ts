import { Season } from '@enums';
export const SEASONS: readonly Season[] = [Season.SPRING, Season.SUMMER, Season.AUTUMN, Season.WINTER];

/** Number of turns each season lasts. The game starts in spring. */
export const SEASON_LENGTH = 6;

/** 1-based turn within the current season (1..SEASON_LENGTH). */
export function seasonTurn(turn: number): number {
  return ((Math.max(1, turn) - 1) % SEASON_LENGTH) + 1;
}

export function seasonForTurn(turn: number): Season {
  const idx = Math.floor((Math.max(1, turn) - 1) / SEASON_LENGTH) % SEASONS.length;
  return SEASONS[idx]!;
}

/** Last winter turn: the ice is about to melt, so it is drawn cracked. */
export function iceCracksAt(turn: number): boolean {
  return seasonForTurn(turn) === Season.WINTER && seasonTurn(turn) === SEASON_LENGTH;
}
