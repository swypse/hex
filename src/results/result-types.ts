import { GameMode } from '../enums/game-mode.enum';
import type { Tribe } from '../enums/tribe.enum';

/** One finished game from the local player's point of view. */
export interface GameResultInput {
  /** Client-generated; makes resubmitting the same game idempotent. */
  id: string;
  tribe: Tribe;
  score: number;
  /** 0 when the player did not win. */
  stars: number;
  mode: GameMode;
  turns: number;
  players: number;
  won: boolean;
}

/** Games count and bests of one tribe in one game mode (zeros when never played). */
export interface ModeBest {
  games: number;
  maxScore: number;
  maxStars: number;
}

/** `ModeBest` of a tribe in one mode, as stored per (tribe, mode). */
export interface TribeModeBest extends ModeBest {
  tribe: Tribe;
  mode: GameMode;
}

/** A user's bests for one tribe: overall (`games` is 0 for tribes never
 *  played) and per game mode. */
export interface TribeBest extends ModeBest {
  tribe: Tribe;
  modes: Record<GameMode, ModeBest>;
}

export const EMPTY_MODE_BEST: ModeBest = { games: 0, maxScore: 0, maxStars: 0 };

/** Folds per-mode rows of one tribe into its `TribeBest`. */
export function foldTribeBest(tribe: Tribe, rows: readonly TribeModeBest[]): TribeBest {
  const modes = {
    [GameMode.CAPTURE]: { ...EMPTY_MODE_BEST },
    [GameMode.TURNS30]: { ...EMPTY_MODE_BEST },
  };
  const total = { ...EMPTY_MODE_BEST };
  for (const r of rows) {
    if (r.tribe !== tribe) continue;
    modes[r.mode] = { games: r.games, maxScore: r.maxScore, maxStars: r.maxStars };
    total.games += r.games;
    total.maxScore = Math.max(total.maxScore, r.maxScore);
    total.maxStars = Math.max(total.maxStars, r.maxStars);
  }
  return { tribe, ...total, modes };
}
