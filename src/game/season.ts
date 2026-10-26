import { IcePhase, Season } from '@enums';
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

/** Ice state announced for a turn: coast water freezes after the last autumn turn, ice melts after the last winter one. */
export function icePhaseAt(turn: number): IcePhase {
  if (seasonTurn(turn) !== SEASON_LENGTH) return IcePhase.NONE;
  const season = seasonForTurn(turn);
  if (season === Season.AUTUMN) return IcePhase.FREEZING;
  return season === Season.WINTER ? IcePhase.CRACKED : IcePhase.NONE;
}
