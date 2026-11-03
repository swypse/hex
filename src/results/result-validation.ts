import { GameMode } from '../enums/game-mode.enum';
import { Tribe } from '../enums/tribe.enum';
import type { GameResultInput } from './result-types';

export const MAX_STARS = 3;
const MAX_SCORE = 1_000_000;
const MAX_TURNS = 10_000;
const MAX_PLAYERS = 16;
const ID_RE = /^[\w-]{8,64}$/;

export const ALL_TRIBES: readonly Tribe[] = Object.values(Tribe).filter((v): v is Tribe => typeof v === 'number');

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Returns the typed result, or null when any field is out of range. */
export function parseGameResult(raw: unknown): GameResultInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
  if (!isInt(r.tribe, 0, Number.MAX_SAFE_INTEGER) || !ALL_TRIBES.includes(r.tribe)) return null;
  if (!isInt(r.score, 0, MAX_SCORE) || !isInt(r.stars, 0, MAX_STARS)) return null;
  if (!isInt(r.turns, 0, MAX_TURNS) || !isInt(r.players, 1, MAX_PLAYERS)) return null;
  if (r.mode !== GameMode.CAPTURE && r.mode !== GameMode.TURNS30) return null;
  if (typeof r.won !== 'boolean') return null;
  if (r.stars > 0 && !r.won) return null;
  return { id: r.id, tribe: r.tribe, score: r.score, stars: r.stars, mode: r.mode, turns: r.turns, players: r.players, won: r.won };
}
