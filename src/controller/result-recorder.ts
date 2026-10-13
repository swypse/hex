import { totalScore } from '../game/score';
import { starRating } from '../game/game-mode';
import type { GameMap } from '../game/map/map-gen';
import type { GameResultInput } from '../results/result-types';
import { useResultsStore } from '../results/results-store';
import { useGameStore } from '../store/game-store';
import { gameController } from './game-controller';

type GameState = ReturnType<typeof useGameStore.getState>;

/** The local player's result for a finished game, or null when it does not
 *  count (tutorial, no human local player). Stars are the winner's rating;
 *  anyone else gets 0. */
export function buildResult(s: GameState, map: GameMap, id: string): GameResultInput | null {
  const local = s.players[s.localPlayerIndex];
  if (s.tutorial || !local?.isHuman) return null;
  const score = totalScore(map, local);
  const won = s.winnerIndex === s.localPlayerIndex;
  return {
    id,
    tribe: local.tribe,
    score,
    stars: won ? starRating(score, s.players.length, s.mode, s.turn) : 0,
    mode: s.mode,
    turns: s.turn,
    players: s.players.length,
    won,
  };
}

/** Submits the result once when a game ends (logged-in users only). */
export function installResultRecorder(): () => void {
  let wasOver = useGameStore.getState().gameOver;
  return useGameStore.subscribe((s) => {
    const over = s.gameOver;
    const justEnded = over && !wasOver;
    wasOver = over;
    if (!justEnded) return;
    const map = gameController.getMap();
    const result = map ? buildResult(s, map, crypto.randomUUID()) : null;
    if (result) void useResultsStore.getState().submit(result);
  });
}
