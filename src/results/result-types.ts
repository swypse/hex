import type { GameMode } from '../enums/game-mode.enum';
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

/** A user's best for one tribe. `games` is 0 for tribes never played. */
export interface TribeBest {
  tribe: Tribe;
  games: number;
  maxScore: number;
  maxStars: number;
}
