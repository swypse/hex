import { GameMap } from './mapGen';
import { Player } from './players';
import { totalScore } from './score';

export type GameMode = 'capture' | 'turns30';

export const GAME_MODE_NAMES: Record<GameMode, string> = {
  capture: 'Capture the map',
  turns30: '30 Turns',
};

export function expectedTurnsFor(playerCount: number): number {
  return playerCount * 5 + 5;
}

export function bonusScoreFor(playerCount: number): number {
  return playerCount * 10;
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
