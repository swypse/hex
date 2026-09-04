import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { Player } from '../src/game/players';
import { TileType } from '../src/game/tileTypes';
import { villageCapacity, unitsInVillage } from '../src/game/village';
import { spawnUnit } from '../src/game/spawn';

function makeTile(
  q: number,
  r: number,
  settlement: Settlement | null = null,
  unit: MapTile['unit'] = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy: settlement ? settlement.owner : null, claimedByVillage: null, building: null };
}

function makeVillageTile(q: number, r: number, owner: number, level: number): MapTile {
  return makeTile(q, r, { owner, level, captureReady: false });
}

function makePlayer(index: number, money: number): Player {
  return { index, tribe: 0, isHuman: index === 0, name: `p${index}`, resources: { wood: 5, stone: 5, money, ore: 0 }, score: 0, kills: 0, skills: [], isActive: true };
}

function makeMap(): GameMap {
  return { radius: 4, tiles: [makeVillageTile(0, 0, 0, 1)], spawns: [] };
}

describe('villageCapacity', () => {
  it('is 1 + level', () => {
    expect(villageCapacity(1)).toBe(2);
    expect(villageCapacity(2)).toBe(3);
  });
});

describe('unitsInVillage', () => {
  it('counts units by spawn village', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    village.unit = { id: 'u1', owner: 0, type: 'warrior', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    const away = makeTile(1, 0);
    away.unit = { id: 'u2', owner: 0, type: 'warrior', q: 1, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(away);
    expect(unitsInVillage(map, village)).toBe(2);
  });
});

describe('spawnUnit', () => {
  it('spawns on an empty village tile and deducts money', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(true);
    expect(village.unit).not.toBeNull();
    expect(village.unit!.spawnVillage).toEqual({ q: 0, r: 0 });
    expect(player.resources.money).toBe(6);
  });

  it('spawns a shield unit for 10 money + 3 ore with 100 hp when the Shields skill is open', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const player = makePlayer(0, 10);
    player.resources.ore = 3;
    player.skills = ['shields'];
    expect(spawnUnit(map, village, 'shield', player)).toBe(true);
    expect(village.unit!.type).toBe('shield');
    expect(village.unit!.hp).toBe(100);
    expect(player.resources.money).toBe(0);
    expect(player.resources.ore).toBe(0);
  });

  it('rejects shield spawn without the Shields skill', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, 'shield', player)).toBe(false);
    expect(village.unit).toBeNull();
  });

  it('rejects when the tile is occupied', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    village.unit = { id: 'x', owner: 0, type: 'warrior', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(false);
  });

  it('spawns even when at capacity if the tile is empty', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const away = makeTile(1, 0);
    away.unit = { id: 'b', owner: 0, type: 'warrior', q: 1, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(away);
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(true);
  });

  it('rejects when village capacity is full', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const away1 = makeTile(1, 0);
    away1.unit = { id: 'b', owner: 0, type: 'warrior', q: 1, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    const away2 = makeTile(2, 0);
    away2.unit = { id: 'c', owner: 0, type: 'archer', q: 2, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(away1, away2);
    const player = makePlayer(0, 20);
    expect(unitsInVillage(map, village)).toBe(2);
    expect(villageCapacity(village.settlement!.level)).toBe(2);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(false);
  });

  it('rejects when money is insufficient', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const player = makePlayer(0, 1);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(false);
  });

  it('spawned units cannot act until the next round', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(true);
    expect(village.unit!.hasMoved).toBe(true);
    expect(village.unit!.hasAttacked).toBe(true);
    expect(village.unit!.hasHealed).toBe(true);
  });

  it('swordsman requires the swordsman skill and 15 money + 3 ore', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const noSkill = makePlayer(0, 20);
    noSkill.resources.ore = 3;
    expect(spawnUnit(map, village, 'swordsman', noSkill)).toBe(false);
    expect(village.unit).toBeNull();
    const skilled = makePlayer(0, 20);
    skilled.resources.ore = 3;
    skilled.skills = ['swordsman'];
    expect(spawnUnit(map, village, 'swordsman', skilled)).toBe(true);
    expect(skilled.resources.money).toBe(5);
    expect(skilled.resources.ore).toBe(0);
    expect(village.unit!.type).toBe('swordsman');
  });

  it('catapult requires the catapult skill and pays 30 money + 20 wood + 5 ore', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const noSkill = makePlayer(0, 40);
    noSkill.resources.wood = 20;
    noSkill.resources.ore = 5;
    expect(spawnUnit(map, village, 'catapult', noSkill)).toBe(false);
    expect(village.unit).toBeNull();
    const skilled = makePlayer(0, 40);
    skilled.resources.wood = 20;
    skilled.resources.ore = 5;
    skilled.skills = ['catapult'];
    expect(spawnUnit(map, village, 'catapult', skilled)).toBe(true);
    expect(village.unit!.type).toBe('catapult');
    expect(skilled.resources.money).toBe(10);
    expect(skilled.resources.wood).toBe(0);
    expect(skilled.resources.ore).toBe(0);
  });

  it('rider requires the Riding skill', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const noSkill = makePlayer(0, 20);
    expect(spawnUnit(map, village, 'rider', noSkill)).toBe(false);
    expect(village.unit).toBeNull();
    const skilled = makePlayer(0, 20);
    skilled.skills = ['riding'];
    expect(spawnUnit(map, village, 'rider', skilled)).toBe(true);
    expect(village.unit!.type).toBe('rider');
    expect(skilled.resources.money).toBe(14);
  });

  it('knight requires the Knights skill and pays 20 money + 10 ore', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const noSkill = makePlayer(0, 30);
    noSkill.resources.ore = 10;
    expect(spawnUnit(map, village, 'knight', noSkill)).toBe(false);
    expect(village.unit).toBeNull();
    const skilled = makePlayer(0, 30);
    skilled.resources.ore = 10;
    skilled.skills = ['knights'];
    expect(spawnUnit(map, village, 'knight', skilled)).toBe(true);
    expect(village.unit!.type).toBe('knight');
    expect(skilled.resources.money).toBe(10);
    expect(skilled.resources.ore).toBe(0);
  });
});
