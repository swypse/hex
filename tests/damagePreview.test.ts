import { describe, it, expect } from 'vitest';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Selection } from '../src/game/selection';
import { Unit, UNIT_TYPES } from '../src/game/units';
import { damagePreviewVictim } from '../src/controller/damagePreview';

function tile(q: number, r: number, u: Unit | null, exploredBy: number[] = [0]): MapTile {
  return {
    q, r, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
    roadOwner: null, unit: u, ownedBy: u?.owner ?? null, claimedByVillage: null, exploredBy,
  };
}

function warrior(id: string, owner: number, q: number, r: number): Unit {
  const t = UNIT_TYPES.warrior;
  return {
    id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 50, attack: t.attack, attackDistance: t.attackDistance, defense: t.defense, spawnVillage: null,
  };
}

function mapWith(tiles: MapTile[]): GameMap {
  return { radius: 4, tiles, spawns: [] };
}

describe('damagePreviewVictim', () => {
  const friendly = warrior('me', 0, 0, 0);
  const enemy = warrior('them', 1, 2, 0);

  it('returns the enemy tile when a friendly unit is selected and the tile is explored', () => {
    const victim = tile(2, 0, enemy);
    const map = mapWith([tile(0, 0, friendly), victim]);
    const selection = { kind: 'unit', q: 0, r: 0 } as Selection;
    expect(damagePreviewVictim(map, selection, 0, victim)).toBe(victim);
  });

  it('returns null with no selection', () => {
    const map = mapWith([tile(0, 0, friendly), tile(2, 0, enemy)]);
    expect(damagePreviewVictim(map, null, 0, tile(2, 0, enemy))).toBeNull();
  });

  it('returns null when the press is on a friendly unit', () => {
    const other: MapTile = tile(1, 0, warrior('crew', 0, 1, 0));
    const map = mapWith([tile(0, 0, friendly), other]);
    const selection = { kind: 'unit', q: 0, r: 0 } as Selection;
    expect(damagePreviewVictim(map, selection, 0, other)).toBeNull();
  });

  it('returns null when the press is on an unexplored tile', () => {
    const victim = tile(2, 0, enemy, []);
    const map = mapWith([tile(0, 0, friendly), victim]);
    const selection = { kind: 'unit', q: 0, r: 0 } as Selection;
    expect(damagePreviewVictim(map, selection, 0, victim)).toBeNull();
  });

  it('returns null when the pressed unit has no actual unit', () => {
    const empty = tile(2, 0, null);
    const map = mapWith([tile(0, 0, friendly), empty]);
    const selection = { kind: 'unit', q: 0, r: 0 } as Selection;
    expect(damagePreviewVictim(map, selection, 0, empty)).toBeNull();
  });
});