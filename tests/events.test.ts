import { describe, it, expect } from 'vitest';
import { GameEvent } from '../src/game/events';
import { GameStateSnapshot } from '../src/game/state';
import { GameMap } from '../src/game/mapGen';
import { Player } from '../src/game/players';

describe('game events & state', () => {
  it('GameEvent objects survive JSON round-trip', () => {
    const e: GameEvent = { type: 'unitMoved', unitId: 'u1', from: { q: 0, r: 0 }, path: [{ q: 0, r: 1 }], to: { q: 0, r: 1 } };
    const copy = JSON.parse(JSON.stringify(e)) as GameEvent;
    expect(copy).toEqual(e);
  });

  it('GameStateSnapshot survives JSON round-trip', () => {
    const map: GameMap = { radius: 1, tiles: [], spawns: [] };
    const players: Player[] = [
      { index: 0, tribe: 1, isHuman: true, name: 'p0', resources: { wood: 3, stone: 2, money: 5, ore: 0 }, score: 0, kills: 0, skills: [], isActive: true },
    ];
    const snap: GameStateSnapshot = { map, players, mode: 'capture', turn: 1, currentPlayerIndex: 0, gameOver: false, winnerIndex: null, expectedTurns: 15, bonusAwarded: false };
    const copy = JSON.parse(JSON.stringify(snap)) as GameStateSnapshot;
    expect(copy).toEqual(snap);
  });
});
