import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/map-gen';
import { Player } from '../src/game/players';
import { TileType } from '../src/game/tile-types';
import { villageCapacity, unitsInVillage } from '../src/game/village';
import { stockOf } from '../src/game/stock';
import { spawnUnit } from '../src/game/spawn';
import { Tribe, TRIBE_SPECIAL_UNIT } from '../src/game/tribes';
import { SkillId, UnitType } from '@enums';

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
  return { index, tribe: 0, isHuman: index === 0, name: `p${index}`, resources: { money }, score: 0, kills: 0, skills: [], isActive: true };
}

function makeMap(): GameMap {
  const village = makeVillageTile(0, 0, 0, 1);
  village.settlement!.stock = { wood: 5, stone: 5, ore: 0, food: 20 };
  return { radius: 4, tiles: [village], spawns: [] };
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
    village.unit = { id: 'u1', owner: 0, type: UnitType.WARRIOR, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    const away = makeTile(1, 0);
    away.unit = { id: 'u2', owner: 0, type: UnitType.WARRIOR, q: 1, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(away);
    expect(unitsInVillage(map, village)).toBe(2);
  });
});

describe('spawnUnit', () => {
  it('spawns on an empty village tile and deducts money', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, UnitType.WARRIOR, player)).toBe(true);
    expect(village.unit).not.toBeNull();
    expect(village.unit!.spawnVillage).toEqual({ q: 0, r: 0 });
    expect(player.resources.money).toBe(6);
  });

  it('spawns a shield unit for 8 money + 2 ore with 80 hp when the Shields skill is open', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const player = makePlayer(0, 10);
    stockOf(village).ore = 3;
    player.skills = [SkillId.SHIELDS];
    expect(spawnUnit(map, village, UnitType.SHIELD, player)).toBe(true);
    expect(village.unit!.type).toBe(UnitType.SHIELD);
    expect(village.unit!.hp).toBe(80);
    expect(player.resources.money).toBe(2);
    expect(stockOf(village).ore).toBe(1);
  });

  it('rejects shield spawn without the Shields skill', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, UnitType.SHIELD, player)).toBe(false);
    expect(village.unit).toBeNull();
  });

  it('rejects when the tile is occupied', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    village.unit = { id: 'x', owner: 0, type: UnitType.WARRIOR, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, UnitType.WARRIOR, player)).toBe(false);
  });

  it('spawns even when at capacity if the tile is empty', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const away = makeTile(1, 0);
    away.unit = { id: 'b', owner: 0, type: UnitType.WARRIOR, q: 1, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(away);
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, UnitType.WARRIOR, player)).toBe(true);
  });

  it('rejects when village capacity is full', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const away1 = makeTile(1, 0);
    away1.unit = { id: 'b', owner: 0, type: UnitType.WARRIOR, q: 1, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    const away2 = makeTile(2, 0);
    away2.unit = { id: 'c', owner: 0, type: UnitType.ARCHER, q: 2, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(away1, away2);
    const player = makePlayer(0, 20);
    expect(unitsInVillage(map, village)).toBe(2);
    expect(villageCapacity(village.settlement!.level)).toBe(2);
    expect(spawnUnit(map, village, UnitType.WARRIOR, player)).toBe(false);
  });

  it('rejects when money is insufficient', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const player = makePlayer(0, 1);
    expect(spawnUnit(map, village, UnitType.WARRIOR, player)).toBe(false);
  });

  it('spawned units cannot act until the next round', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, UnitType.WARRIOR, player)).toBe(true);
    expect(village.unit!.hasMoved).toBe(true);
    expect(village.unit!.hasAttacked).toBe(true);
    expect(village.unit!.hasHealed).toBe(true);
  });

  it('swordsman requires the swordsman skill and 10 money + 2 ore', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const noSkill = makePlayer(0, 20);
    stockOf(village).ore = 3;
    expect(spawnUnit(map, village, UnitType.SWORDSMAN, noSkill)).toBe(false);
    expect(village.unit).toBeNull();
    const skilled = makePlayer(0, 20);
    stockOf(village).ore = 3;
    skilled.skills = [SkillId.SWORDSMAN];
    expect(spawnUnit(map, village, UnitType.SWORDSMAN, skilled)).toBe(true);
    expect(skilled.resources.money).toBe(10);
    expect(stockOf(village).ore).toBe(1);
    expect(village.unit!.type).toBe(UnitType.SWORDSMAN);
  });

  it('catapult requires the catapult skill and pays 15 money + 10 wood + 3 ore', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const noSkill = makePlayer(0, 40);
    stockOf(village).wood = 20;
    stockOf(village).ore = 5;
    expect(spawnUnit(map, village, UnitType.CATAPULT, noSkill)).toBe(false);
    expect(village.unit).toBeNull();
    const skilled = makePlayer(0, 40);
    stockOf(village).wood = 20;
    stockOf(village).ore = 5;
    skilled.skills = [SkillId.CATAPULT];
    expect(spawnUnit(map, village, UnitType.CATAPULT, skilled)).toBe(true);
    expect(village.unit!.type).toBe(UnitType.CATAPULT);
    expect(skilled.resources.money).toBe(25);
    expect(stockOf(village).wood).toBe(10);
    expect(stockOf(village).ore).toBe(2);
  });

  it('rider requires the Riding skill', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const noSkill = makePlayer(0, 20);
    expect(spawnUnit(map, village, UnitType.RIDER, noSkill)).toBe(false);
    expect(village.unit).toBeNull();
    const skilled = makePlayer(0, 20);
    skilled.skills = [SkillId.RIDING];
    expect(spawnUnit(map, village, UnitType.RIDER, skilled)).toBe(true);
    expect(village.unit!.type).toBe(UnitType.RIDER);
    expect(skilled.resources.money).toBe(14);
  });

  it('knight requires the Knights skill and pays 14 money + 5 ore', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const noSkill = makePlayer(0, 30);
    stockOf(village).ore = 10;
    expect(spawnUnit(map, village, UnitType.KNIGHT, noSkill)).toBe(false);
    expect(village.unit).toBeNull();
    const skilled = makePlayer(0, 30);
    stockOf(village).ore = 10;
    skilled.skills = [SkillId.KNIGHTS];
    expect(spawnUnit(map, village, UnitType.KNIGHT, skilled)).toBe(true);
    expect(village.unit!.type).toBe(UnitType.KNIGHT);
    expect(skilled.resources.money).toBe(16);
    expect(stockOf(village).ore).toBe(5);
  });

  it('gives every spawned unit a unique id even with back-to-back spawns', () => {
    const map = makeMap();
    const player = makePlayer(0, 1000);
    const a = map.tiles[0]!;
    spawnUnit(map, a, UnitType.WARRIOR, player);
    const idA = a.unit!.id;
    a.unit = null;
    spawnUnit(map, a, UnitType.WARRIOR, player);
    const idB = a.unit!.id;
    expect(idA).not.toBe(idB);
  });

  it('spawns a special unit only for its tribe, without a skill', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const cats = makePlayer(0, 100);
    cats.tribe = Tribe.Cats;
    stockOf(village).ore = 50;
    expect(spawnUnit(map, village, UnitType.STALKER, cats)).toBe(true);
    expect(village.unit!.type).toBe(UnitType.STALKER);
  });

  it('refuses a special unit for a foreign tribe', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const cats = makePlayer(0, 100);
    cats.tribe = Tribe.Cats;
    stockOf(village).wood = 50;
    expect(spawnUnit(map, village, UnitType.BANNER, cats)).toBe(false);
    expect(village.unit).toBeNull();
  });

  it('refuses a special unit even for a tribe that cannot spawn its own', () => {
    const map = makeMap();
    const village = map.tiles[0]!;
    const warriors = makePlayer(0, 100);
    warriors.tribe = Tribe.Warriors;
    stockOf(village).ore = 50;
    expect(spawnUnit(map, village, UnitType.BERSERKER, warriors)).toBe(false);
    expect(village.unit).toBeNull();
  });
});
