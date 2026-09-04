import { GameMode } from './gameMode';
import { GameMap } from './mapGen';
import { Player } from './players';

export interface GameStateSnapshot {
  map: GameMap;
  players: Player[];
  mode: GameMode;
  turn: number;
  currentPlayerIndex: number;
  gameOver: boolean;
  winnerIndex: number | null;
  expectedTurns: number;
  bonusAwarded: boolean;
}

export function stripUndefinedValues(node: unknown): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) stripUndefinedValues(item);
    return;
  }
  const record = node as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) {
      delete record[key];
    } else {
      stripUndefinedValues(record[key]);
    }
  }
}
