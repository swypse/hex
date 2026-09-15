import { GameMap } from './mapGen';
import { Player } from './players';
import { totalScore } from './score';

export type GameMode = 'capture' | 'turns30';

export const GAME_MODE_NAMES: Record<GameMode, string> = {
  capture: 'Capture the map',
  turns30: '30 Turns',
};

/** Capture-mode turns a game may last before the quick-capture bonus is lost:
 *  `10 + 5 × players`. */
export function quickCaptureTurnsCount(playerCount: number): number {
  return 10 + 5 * playerCount;
}

/** Bonus points awarded to the winner when capture mode ends within
 *  `quickCaptureTurnsCount` turns: `players × 20`. */
export function quickCaptureScore(playerCount: number): number {
  return playerCount * 20;
}

export type StarRating = 1 | 2 | 3;

/** Winner's star rating (1–3) for a finished game. Capture mode awards the top
 *  tier only when the game also ends within the quick-capture turns budget. */
export function starRating(score: number, playerCount: number, mode: GameMode, turn: number): StarRating {
  if (mode === 'capture') {
    if (score >= 500 + 200 * playerCount && turn <= quickCaptureTurnsCount(playerCount)) return 3;
    if (score >= 400 + 150 * playerCount) return 2;
    return 1;
  }
  if (score >= 1000 + 800 * playerCount) return 3;
  if (score >= 800 + 600 * playerCount) return 2;
  return 1;
}

export function countUnits(map: GameMap, playerIndex: number): number {
  return map.tiles.filter((t) => t.unit && t.unit.owner === playerIndex).length;
}

export function captureWinnerIndex(map: GameMap): number | null {
  const owners = new Set<number>();
  for (const t of map.tiles) {
    if (t.settlement && t.settlement.owner !== null) owners.add(t.settlement.owner);
  }
  return owners.size === 1 ? [...owners][0]! : null;
}

export function computeWinner(players: Player[], map: GameMap): number {
  const active = players.filter((p) => p.isActive);
  // Every player can be ruled out at once (simultaneous forfeits, capture mode
  // where the last villages become ownerless): fall back to the first player so
  // the end-game flow still has a concrete winner instead of Math.max(-Infinity)
  // crashing on an empty array.
  if (active.length === 0) return players[0]?.index ?? 0;
  let best = active.slice();
  const maxScore = Math.max(...best.map((p) => totalScore(map, p)));
  best = best.filter((p) => totalScore(map, p) === maxScore);
  if (best.length > 1) {
    const maxKills = Math.max(...best.map((p) => p.kills));
    best = best.filter((p) => p.kills === maxKills);
  }
  if (best.length > 1) {
    const minUnits = Math.min(...best.map((p) => countUnits(map, p.index)));
    best = best.filter((p) => countUnits(map, p.index) === minUnits);
  }
  if (best.length > 1) {
    best = [best.sort((a, b) => a.name.localeCompare(b.name))[0]!];
  }
  return best[0]!.index;
}

export function rankPlayers(players: Player[], map: GameMap): Player[] {
  return [...players].sort((a, b) => {
    const sa = totalScore(map, a);
    const sb = totalScore(map, b);
    if (sa !== sb) return sb - sa;
    if (a.kills !== b.kills) return b.kills - a.kills;
    const ua = countUnits(map, a.index);
    const ub = countUnits(map, b.index);
    if (ua !== ub) return ua - ub;
    return a.name.localeCompare(b.name);
  });
}

interface WatchPromptCheck {
  netMode: string;
  mode: GameMode;
  gameOver: boolean;
  watching: boolean;
  localActive: boolean;
  overlayKind: string | null;
}

export function shouldPromptWatch(c: WatchPromptCheck): boolean {
  return (
    c.netMode === 'single' &&
    c.mode === 'capture' &&
    !c.gameOver &&
    !c.watching &&
    !c.localActive &&
    c.overlayKind !== 'watchingPrompt'
  );
}
