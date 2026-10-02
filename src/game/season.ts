export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

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
