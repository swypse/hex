import { describe, it, expect } from 'vitest';
import { GameMap, MapTile } from '../src/game/mapGen';
import { Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { Unit, UNIT_TYPES } from '../src/game/units';
import { TileType } from '../src/game/tileTypes';
import { AI_DIFFICULTY_PROFILES } from '../src/game/aiDifficulty';
import { analyzeSituation, visibleEnemies, turnsToOccupy } from '../src/game/aiSituation';

function tile(q: number, r: number, opts: Partial<MapTile> = {}): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement: null, building: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0, 1], ...opts };
}

function unit(id: string, owner: number, type: keyof typeof UNIT_TYPES, q: number, r: number): Unit {
  return { id, owner, type, q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: UNIT_TYPES[type].maxHp, attack: UNIT_TYPES[type].attack, attackDistance: UNIT_TYPES[type].attackDistance, defence: UNIT_TYPES[type].defence, spawnVillage: null };
}

function player(index: number): Player {
  return { index, tribe: Tribe.Villagers, isHuman: false, name: 'AI', resources: { wood: 5, stone: 5, money: 100, ore: 5 }, score: 0, kills: 0, skills: [], isActive: true };
}

describe('aiSituation', () => {
  it('visibleEnemies returns only explored non-own units', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { unit: unit('a', 1, 'warrior', 0, 0) }),
      tile(1, 0, { unit: unit('e', 0, 'warrior', 1, 0) }),
    );
    const foggy = tile(2, 0, { unit: unit('fog', 0, 'warrior', 2, 0) });
    foggy.exploredBy = [0];
    map.tiles.push(foggy);
    const enemies = visibleEnemies(map, 1);
    expect(enemies.map((e) => e.unit.id)).toEqual(['e']);
  });

  it('turnsToOccupy uses the mover movement', () => {
    const from = tile(0, 0);
    const to = tile(4, 0);
    const rider = unit('r', 0, 'rider', 0, 0); // movement 4
    const warrior = unit('w', 0, 'warrior', 0, 0); // movement 1
    expect(turnsToOccupy(from, to, rider)).toBe(1);
    expect(turnsToOccupy(from, to, warrior)).toBe(4);
  });

  it('is in defend stance when an empty own village is endangered', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { settlement: { owner: 1, level: 1, captureReady: false }, ownedBy: 1 }),
      tile(2, 0, { unit: unit('e', 0, 'rider', 2, 0) }), // reaches the village in 1 turn (movement 4)
    );
    const s = analyzeSituation(map, player(1), 'capture', AI_DIFFICULTY_PROFILES.normal);
    expect(s.stance).toBe('defend');
    expect(s.endangered).toBe(true);
    expect(s.dangers.some((d) => d.village.q === 0 && d.village.r === 0)).toBe(true);
  });

  it('goes to war in capture mode when strong enough and an enemy village is explored', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { settlement: { owner: 1, level: 1, captureReady: false }, unit: unit('k1', 1, 'knight', 0, 0), ownedBy: 1 }),
      tile(1, 0, { unit: unit('k2', 1, 'knight', 1, 0) }),
      tile(2, 0, { unit: unit('k3', 1, 'knight', 2, 0) }),
      tile(5, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
    );
    const s = analyzeSituation(map, player(1), 'capture', AI_DIFFICULTY_PROFILES.normal);
    expect(s.stance).toBe('war');
    expect(s.frontTarget).not.toBeNull();
    expect(s.frontTarget!.q).toBe(5);
  });

  it('stays in settle stance in 30-turn mode even when an enemy village is explored', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { settlement: { owner: 1, level: 1, captureReady: false }, unit: unit('k1', 1, 'knight', 0, 0), ownedBy: 1 }),
      tile(1, 0, { unit: unit('k2', 1, 'knight', 1, 0) }),
      tile(2, 0, { unit: unit('k3', 1, 'knight', 2, 0) }),
      tile(5, 0, { settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0 }),
    );
    const s = analyzeSituation(map, player(1), 'turns30', AI_DIFFICULTY_PROFILES.normal);
    expect(s.stance).toBe('settle');
    expect(s.frontTarget).toBeNull();
  });

  it('easy AI stays out of war until it has a bigger advantage', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    // Own power 200 (4 knights x 50 damage) vs enemy power 100 (2 knights x 50).
    // Normal warRatio 1.5: 200 >= 150 -> war. Easy warRatio 2.5: 200 < 250 -> settle.
    map.tiles.push(
      tile(0, 0, { settlement: { owner: 1, level: 1, captureReady: false }, unit: unit('k1', 1, 'knight', 0, 0), ownedBy: 1 }),
      tile(1, 0, { unit: unit('k2', 1, 'knight', 1, 0) }),
      tile(2, 0, { unit: unit('k3', 1, 'knight', 2, 0) }),
      tile(3, 0, { unit: unit('k4', 1, 'knight', 3, 0) }),
      tile(5, 0, { settlement: { owner: 0, level: 1, captureReady: false }, unit: unit('e1', 0, 'knight', 5, 0), ownedBy: 0 }),
      tile(6, 0, { unit: unit('e2', 0, 'knight', 6, 0) }),
    );
    const normal = analyzeSituation(map, player(1), 'capture', AI_DIFFICULTY_PROFILES.normal);
    const easy = analyzeSituation(map, player(1), 'capture', AI_DIFFICULTY_PROFILES.easy);
    expect(normal.stance).toBe('war');
    expect(easy.stance).toBe('settle');
  });
});
