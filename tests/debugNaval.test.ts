import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { PIRATE_OWNER, type Unit } from '../src/game/units';
import { TileType } from '../src/game/tileTypes';
import { SeededRandom } from '../src/util/random';
import { planAiActions } from '../src/game/ai';
import { Tribe } from '../src/game/tribes';
import { type Player } from '../src/game/players';

describe('Debug naval hunt', () => {
  it('hunts a pirate with the ship over water', () => {
    const map = makeTestMap(6);
    for (let q = 0; q <= 3; q++) tileAt(map, q, 0)!.terrain = TileType.Water;
    const pirate: Unit = {
      id: 'p1', owner: PIRATE_OWNER, type: 'pirate', q: 3, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 150, attack: 30, attackDistance: 3, defense: 10, spawnVillage: null,
    };
    tileAt(map, 3, 0)!.unit = pirate;
    const ship = makeUnit('ship1', 1, 'warrior', 0, 0);
    ship.shipLevel = 1;
    tileAt(map, 0, 0)!.unit = ship;
    const player: Player = {
      index: 1, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
      resources: { wood: 0, stone: 0, money: 100, ore: 0 },
      score: 0, kills: 0, skills: ['water', 'navigation'], isActive: true,
    };
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const moveIdx = actions.findIndex((a) => a.type === 'move' && a.unitId === 'ship1');
    const attackIdx = actions.findIndex((a) => a.type === 'attack' && a.unitId === 'ship1');
    // The ship sails toward the pirate and fires once in range.
    expect(moveIdx).toBeGreaterThanOrEqual(0);
    expect(attackIdx).toBeGreaterThanOrEqual(0);
  });
});