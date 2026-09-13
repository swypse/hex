import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt } from './testMap';
import { makeUnit } from '../src/game/units';
import { PIRATE_OWNER } from '../src/game/units';
import { TileType } from '../src/game/mapGen';
import { SeededRandom } from '../src/game/random';
import { planAiActions } from '../src/game/ai';
import { aiPlayer } from './testUtils';
import { hexDistance } from '../src/game/hex';

describe('Debug naval hunt', () => {
  it('debug', () => {
    const map = makeTestMap(6);
    for (let q = 0; q <= 3; q++) tileAt(map, q, 0)!.terrain = TileType.Water;
    const p = {
      id: 'p1', owner: PIRATE_OWNER, type: 'pirate', q: 3, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 150, attack: 30, attackDistance: 3, defense: 10, spawnVillage: null,
    };
    tileAt(map, 3, 0)!.unit = p;
    const ship = makeUnit('ship1', 1, 'warrior', 0, 0);
    ship.shipLevel = 1;
    tileAt(map, 0, 0)!.unit = ship;
    const player = aiPlayer({
      skills: ['water', 'navigation'],
      resources: { wood: 0, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const moveIdx = actions.findIndex((a) => a.type === 'move' && a.unitId === 'ship1');
    const attackIdx = actions.findIndex((a) => a.type === 'attack' && a.unitId === 'ship1');
    console.log('ALL ACTIONS:');
    for (const a of actions) console.log(`  ${JSON.stringify(a)}`);
    console.log(`moveIdx=${moveIdx} attackIdx=${attackIdx}`);
    expect(true).toBe(true);
  });
});