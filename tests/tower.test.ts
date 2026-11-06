import { describe, it, expect } from 'vitest';
import { type GameMap, type MapTile } from '../src/game/map/map-gen';
import { TileType } from '../src/game/map/tile-types';
import { Tribe } from '../src/game/tribes';
import { buildBuilding, buildingHp, canBuildTower, repairBuilding, TOWER_MAX_HP, TOWER_REPAIR_HP } from '../src/game/economy/buildings';
import { damageReduction } from '../src/game/units/buffs';
import { attackRange, attackableTargets, chooseBestAttack, performAttack, performSiege } from '../src/game/units/combat';
import { reachableTargets } from '../src/game/units/selection';
import { makeUnit } from '../src/game/units/units';
import { BuildingKind, SkillId, UnitType } from '@enums';

function tile(q: number, r: number, ownedBy: number | null, building: MapTile['building'] = null): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement: null, unit: null, ownedBy, claimedByVillage: null, building, exploredBy: [0, 1] };
}

function player(index: number, skills: SkillId[] = [SkillId.TOWER]): import('../src/game/players').Player {
  return {
    index, tribe: Tribe.Villagers, isHuman: true, name: 'p', isActive: true, score: 0, kills: 0, skills,
    resources: { wood: 0, stone: 10, money: 15, ore: 5, food: 20 },
  };
}

const tower = (): MapTile['building'] => ({ kind: BuildingKind.TOWER, level: 1 });

describe('tower', () => {
  it('needs the skill, own empty land and 15 money + 10 stone + 5 ore', () => {
    const t = tile(0, 0, 0);
    const village = tile(5, 5, 0);
    village.settlement = { owner: 0, level: 1, captureReady: false, stock: { wood: 0, stone: 10, ore: 5, food: 0 } };
    const map: GameMap = { radius: 8, tiles: [t, village], spawns: [] };
    expect(canBuildTower(map, t, player(0, []))).toBe(false);
    expect(canBuildTower(map, tile(0, 0, 1), player(0))).toBe(false);
    const poor = player(0); poor.resources.money = 14;
    expect(canBuildTower(map, t, poor)).toBe(false);
    const p = player(0);
    expect(buildBuilding(map, t, BuildingKind.TOWER, p)).toBe(true);
    expect(p.resources.money).toBe(0);
    expect(village.settlement.stock).toMatchObject({ stone: 0, ore: 0 });
    expect(buildingHp(t.building)).toBe(TOWER_MAX_HP);
    expect(canBuildTower(map, t, player(0))).toBe(false);
  });

  it('can stand on an own mountain but not on water', () => {
    const map: GameMap = { radius: 3, tiles: [], spawns: [] };
    const mountain = { ...tile(0, 0, 0), terrain: TileType.GrasslandMountain };
    const water = { ...tile(1, 0, 0), terrain: TileType.Water };
    map.tiles.push(mountain, water);
    const village = tile(5, 5, 0);
    village.settlement = { owner: 0, level: 1, captureReady: false, stock: { wood: 0, stone: 10, ore: 5, food: 0 } };
    map.tiles.push(village);
    expect(canBuildTower(map, mountain, player(0))).toBe(true);
    expect(canBuildTower(map, water, player(0))).toBe(false);
  });

  it('blocks enemy movement but not the owner', () => {
    const origin = tile(0, 0, null);
    const tw = tile(1, 0, 0, tower());
    const map: GameMap = { radius: 3, tiles: [origin, tw], spawns: [] };
    const enemy = makeUnit(1, UnitType.WARRIOR, 0, 0);
    origin.unit = enemy;
    expect(reachableTargets(map, enemy, 10, false, false, 1)).not.toContain(tw);
    origin.unit = null;
    const own = makeUnit(0, UnitType.WARRIOR, 0, 0);
    origin.unit = own;
    expect(reachableTargets(map, own, 10, false, false, 0)).toContain(tw);
  });

  it('gives +10 defense to own units within radius 1 only', () => {
    const tw = tile(0, 0, 0, tower());
    const near = tile(1, 0, null);
    const far = tile(2, 0, null);
    const map: GameMap = { radius: 3, tiles: [tw, near, far], spawns: [] };
    const u = makeUnit(0, UnitType.WARRIOR, 1, 0);
    expect(damageReduction(map, u, near)).toBe(10);
    expect(damageReduction(map, u, far)).toBe(0);
    expect(damageReduction(map, makeUnit(1, UnitType.WARRIOR, 1, 0), near)).toBe(0);
  });

  it('can be attacked by any unit without a counter, and is destroyed at 0 hp', () => {
    const tw = tile(1, 0, 0, tower());
    const at = tile(0, 0, null);
    const map: GameMap = { radius: 3, tiles: [at, tw], spawns: [] };
    const enemy = makeUnit(1, UnitType.WARRIOR, 0, 0);
    at.unit = enemy;
    expect(attackableTargets(map, enemy, 1)).toContain(tw);
    const out = performSiege(enemy, tw, () => 1);
    expect(out.missed).toBe(false);
    expect(buildingHp(tw.building)).toBeLessThan(TOWER_MAX_HP);
    expect(out.towerHit).toEqual({ pre: TOWER_MAX_HP, damage: expect.any(Number) });
    tw.building!.hp = 1;
    expect(performSiege(enemy, tw, () => 1).buildingHp).toBe(0);
    expect(tw.building).toBeNull();
  });

  it('is repaired +20 hp by an idle own unit standing on it, for its whole turn', () => {
    const tw = tile(0, 0, 0, { kind: BuildingKind.TOWER, level: 1, hp: 100 });
    const map: GameMap = { radius: 3, tiles: [tw], spawns: [] };
    const p = player(0);
    expect(repairBuilding(map, tw, p)).toBe(false);
    const u = makeUnit(0, UnitType.WARRIOR, 0, 0);
    tw.unit = u;
    expect(repairBuilding(map, tw, p)).toBe(true);
    expect(buildingHp(tw.building)).toBe(100 + TOWER_REPAIR_HP);
    expect(u.hasMoved && u.hasAttacked).toBe(true);
    expect(repairBuilding(map, tw, p)).toBe(false);
  });

  it('is picked by the AI as a target when no enemy unit is in reach', () => {
    const tw = tile(1, 0, 0, tower());
    const at = tile(0, 0, null);
    const map: GameMap = { radius: 3, tiles: [at, tw], spawns: [] };
    const enemy = makeUnit(1, UnitType.WARRIOR, 0, 0);
    at.unit = enemy;
    expect(chooseBestAttack(map, enemy, 1)).toBe(tw);
    // A unit standing on the tower is attacked instead of the tower.
    tw.unit = makeUnit(0, UnitType.WARRIOR, 1, 0);
    expect(chooseBestAttack(map, enemy, 1)).toBe(tw);
    expect(chooseBestAttack(map, enemy, 1)!.unit).not.toBeNull();
  });

  it('is not entered by a melee attacker that kills the unit standing on it', () => {
    const tw = tile(1, 0, 0, tower());
    const at = tile(0, 0, null);
    const map: GameMap = { radius: 3, tiles: [at, tw], spawns: [] };
    const attacker = makeUnit(1, UnitType.WARRIOR, 0, 0);
    const victim = makeUnit(0, UnitType.WARRIOR, 1, 0);
    victim.hp = 1;
    at.unit = attacker;
    tw.unit = victim;
    const res = performAttack(map, attacker, tw, () => 1);
    expect(res.targetDied).toBe(true);
    expect(at.unit).toBe(attacker);
    expect(tw.unit).toBeNull();
    expect(tw.building).not.toBeNull();
  });

  it('gives an archer standing on its own tower +1 attack range', () => {
    const tw = tile(0, 0, 0, tower());
    const grass = tile(1, 0, 0);
    const map: GameMap = { radius: 4, tiles: [tw, grass], spawns: [] };
    const archer = makeUnit(0, UnitType.ARCHER, 1, 0);
    const base = attackRange(map, archer);
    const up = makeUnit(0, UnitType.ARCHER, 0, 0);
    expect(attackRange(map, up)).toBe(base + 1);
    expect(attackRange(map, makeUnit(1, UnitType.ARCHER, 0, 0))).toBe(base);
    expect(attackRange(map, makeUnit(0, UnitType.WARRIOR, 0, 0))).toBe(1);
  });

  it('bars own riders, knights and catapults from the tower cell, but not foot units', () => {
    const origin = tile(0, 0, null);
    const tw = tile(1, 0, 0, tower());
    const map: GameMap = { radius: 3, tiles: [origin, tw], spawns: [] };
    for (const type of [UnitType.RIDER, UnitType.KNIGHT, UnitType.CATAPULT]) {
      const u = makeUnit(0, type, 0, 0);
      origin.unit = u;
      expect(reachableTargets(map, u, 10, false, false, 0)).not.toContain(tw);
    }
    for (const type of [UnitType.WARRIOR, UnitType.ARCHER]) {
      const u = makeUnit(0, type, 0, 0);
      origin.unit = u;
      expect(reachableTargets(map, u, 10, false, false, 0)).toContain(tw);
    }
  });
});
