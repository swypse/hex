import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { attackDamage, attackableTargets, chooseBestAttack, resolveCombat, defenseBonusFor, MISS_CHANCE, missChanceFor, performAttack, tradeIsFavorable, COMBAT_SCALE } from '../src/game/combat';
import type { Player } from '../src/game/players';
import { TileType } from '../src/game/tileTypes';
import { Unit, UNIT_TYPES, MAX_HP } from '../src/game/units';

function makeTile(
  q: number,
  r: number,
  terrain: TileType,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain, settlement: null, unit, ownedBy: null, claimedByVillage: null, building: null, exploredBy: [0] };
}

function makeWarrior(id: string, owner: number, q: number, r: number, hp: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp, attack: 20, attackDistance: 1, defense: 10, spawnVillage: null };
}

function makeShield(id: string, owner: number, q: number, r: number, hp: number): Unit {
  return { id, owner, type: 'shield', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp, attack: 10, attackDistance: 1, defense: 20, spawnVillage: null };
}

function makeCatapult(id: string, owner: number, q: number, r: number, hp: number): Unit {
  return { id, owner, type: 'catapult', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp, attack: 50, attackDistance: 4, defense: 0, spawnVillage: null };
}

function makeMap(): GameMap {
  const a = makeTile(0, 0, TileType.GrasslandLand, makeWarrior('a', 0, 0, 0, MAX_HP));
  const b = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('b', 1, 1, 0, MAX_HP));
  const water = makeTile(0, -1, TileType.Water, makeWarrior('c', 1, 0, -1, MAX_HP));
  return { radius: 4, tiles: [a, b, water], spawns: [] };
}

const noMiss = (): number => 0.2;

describe('attackDamage', () => {
  it('scales with current hp', () => {
    expect(attackDamage(makeWarrior('x', 0, 0, 0, 50))).toBe(20);
    expect(attackDamage(makeWarrior('x', 0, 0, 0, 30))).toBe(12);
    expect(attackDamage(makeWarrior('x', 0, 0, 0, 5))).toBe(2);
    expect(attackDamage(makeWarrior('x', 0, 0, 0, 1))).toBe(0);
  });
});

describe('resolveCombat', () => {
  it('applies the Polytopia force-ratio formula with COMBAT_SCALE 1.5', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const target = map.tiles[1]!;
    const { attackerDamage, counterDamage } = resolveCombat(map, attacker, target);
    // attackForce 20, defenseForce 10, total 30:
    // round((20/30) * 20 * 1.5) = 20, round((10/30) * 10 * 1.5) = 5
    expect(attackerDamage).toBe(20);
    expect(counterDamage).toBe(5);
    expect(COMBAT_SCALE).toBe(1.5);
  });

  it('deals full attack * scale against a zero-defense target', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const target = map.tiles[1]!;
    target.unit!.defense = 0;
    const { attackerDamage, counterDamage } = resolveCombat(map, attacker, target);
    expect(attackerDamage).toBe(Math.round(20 * COMBAT_SCALE));
    expect(counterDamage).toBe(0);
  });

  it('an attacker with zero force deals zero total damage', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    attacker.hp = 0;
    map.tiles[1]!.unit!.defense = 0;
    const { attackerDamage, counterDamage } = resolveCombat(map, attacker, map.tiles[1]!);
    expect(attackerDamage).toBe(0);
    expect(counterDamage).toBe(0);
  });

  it('does not mutate either unit', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const target = map.tiles[1]!;
    const before = target.unit!.hp;
    resolveCombat(map, attacker, target);
    expect(attacker.hp).toBe(MAX_HP);
    expect(target.unit!.hp).toBe(before);
  });
});

describe('defenseBonusFor', () => {
  it('returns 1 without any reduction', () => {
    const map = makeMap();
    const tile = map.tiles[1]!;
    expect(defenseBonusFor(map, tile.unit!, tile)).toBe(1);
  });

  it('scales 1 + reduction / 10 for an own village', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const tile = map.tiles[1]!;
    tile.settlement = { owner: 1, level: 1, captureReady: false };
    tile.settlement!.owner = 1;
    // VILLAGE_DEFENSE 5 -> 1 + 5/10 = 1.5
    expect(defenseBonusFor(map, tile.unit!, tile)).toBe(1.5);
  });

  it('returns 1 for a null map (no context)', () => {
    expect(defenseBonusFor(null, makeWarrior('x', 0, 0, 0, 50), makeTile(0, 0, TileType.GrasslandLand))).toBe(1);
  });
});

describe('attackableTargets', () => {
  it('includes adjacent enemies and water targets, excludes friendly units', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const targets = attackableTargets(map, attacker);
    const keys = targets.map((t) => `${t.q},${t.r}`);
    expect(keys).toContain('1,0');
    expect(keys).toContain('0,-1');
    expect(keys).not.toContain('0,0');
  });

  it('excludes enemies on unexplored tiles', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const waterTile = map.tiles[2]!;
    waterTile.exploredBy = [];
    const keys = attackableTargets(map, attacker).map((t) => `${t.q},${t.r}`);
    expect(keys).not.toContain('0,-1');
    expect(keys).toContain('1,0');
  });
});

describe('chooseBestAttack', () => {
  it('prefers a killable target over a healthy one', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const attacker = makeWarrior('a', 0, 0, 0, MAX_HP);
    const killable = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('k', 1, 1, 0, 1));
    const healthy = makeTile(0, 1, TileType.GrasslandLand, makeWarrior('h', 1, 0, 1, MAX_HP));
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, attacker), killable, healthy);
    const best = chooseBestAttack(map, attacker, 0);
    expect(best?.q).toBe(1);
    expect(best?.r).toBe(0);
  });

  it('prefers a target that cannot retaliate', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const archer: Unit = { id: 'a', owner: 0, type: 'archer', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 30, attack: 20, attackDistance: 2, defense: 10, spawnVillage: null };
    const melee = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('m', 1, 1, 0, 1));
    const farMelee = makeTile(2, 0, TileType.GrasslandLand, makeWarrior('f', 1, 2, 0, 1));
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, archer), melee, farMelee);
    const best = chooseBestAttack(map, archer, 0);
    expect(best?.q).toBe(2);
    expect(best?.r).toBe(0);
  });

  it('prefers a land catapult because it cannot retaliate', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const attacker = makeWarrior('a', 0, 0, 0, MAX_HP);
    const melee = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('m', 1, 1, 0, MAX_HP));
    const catapult = makeTile(0, 1, TileType.GrasslandLand, makeCatapult('c', 1, 0, 1, 30));
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, attacker), melee, catapult);
    const best = chooseBestAttack(map, attacker, 0);
    expect(best?.q).toBe(0);
    expect(best?.r).toBe(1);
  });
});

describe('performAttack', () => {
  it('applies damage both ways, marks the attacker, and leaves the target free to act', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const target = map.tiles[1]!;
    const result = performAttack(map, attacker, target, noMiss);
    expect(target.unit!.hp).toBe(30);
    expect(attacker.hp).toBe(45);
    expect(attacker.hasAttacked).toBe(true);
    expect(attacker.hasMoved).toBe(false);
    expect(target.unit!.hasMoved).toBe(false);
    expect(target.unit!.hasAttacked).toBe(false);
    expect(result.attackerDamage).toBe(20);
    expect(result.targetDamage).toBe(5);
  });

  it('kills the target at zero hp and removes it from the tile', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const dying = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('b', 1, 1, 0, 1));
    map.tiles[1]! = dying;
    const result = performAttack(map, attacker, dying, noMiss);
    expect(dying.unit).toBe(attacker);
    expect(result.targetDied).toBe(true);
  });

  it('moves the attacker onto the killed unit tile', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const dying = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('b', 1, 1, 0, 1));
    map.tiles[1]! = dying;
    performAttack(map, attacker, dying, noMiss);
    expect(map.tiles[0]!.unit).toBeNull();
    expect(map.tiles[1]!.unit).toBe(attacker);
    expect(attacker.q).toBe(1);
    expect(attacker.r).toBe(0);
  });

  it('does not move an archer onto the killed tile', () => {
    const map = makeMap();
    const archer: Unit = { id: 'arc', owner: 0, type: 'archer', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 30, attack: 20, attackDistance: 3, defense: 10, spawnVillage: null };
    map.tiles[0]!.unit = archer;
    const dying = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('b', 1, 1, 0, 1));
    map.tiles[1]! = dying;
    performAttack(map, archer, dying, noMiss);
    expect(map.tiles[0]!.unit).toBe(archer);
    expect(map.tiles[1]!.unit).toBeNull();
  });

  it('does not move a catapult onto the killed tile and deals fixed formula damage', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const catapult = makeCatapult('c', 0, 0, 0, 30);
    const dying = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('b', 1, 1, 0, 5));
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, catapult), dying);
    const result = performAttack(map, catapult, dying, noMiss);
    // attackForce 50, defenseForce 10*(5/50)=1, total 51:
    // round((50/51)*50*1.5) = round(73.5) = 74
    expect(result.attackerDamage).toBe(74);
    expect(result.targetDied).toBe(true);
    expect(map.tiles[0]!.unit).toBe(catapult);
    expect(map.tiles[1]!.unit).toBeNull();
    expect(catapult.q).toBe(0);
    expect(catapult.r).toBe(0);
  });

  it('a shield reduces a catapult volley via its defense force', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const catapult = makeCatapult('c', 0, 0, 0, 30);
    const shield = makeTile(1, 0, TileType.GrasslandLand, makeShield('s', 1, 1, 0, 80));
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, catapult), shield);
    const result = performAttack(map, catapult, shield, noMiss);
    // attackForce 50, defenseForce 20, total 70:
    // round((50/70)*50*1.5) = round(53.6) = 54
    expect(result.attackerDamage).toBe(54);
    expect(shield.unit!.hp).toBe(26);
  });

  it('a shield absorbs a warrior hit down via its defense force (no floor)', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const warrior = makeWarrior('w', 0, 0, 0, 50);
    const shield = makeTile(1, 0, TileType.GrasslandLand, makeShield('s', 1, 1, 0, 80));
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, warrior), shield);
    const result = performAttack(map, warrior, shield, noMiss);
    // attackForce 20, defenseForce 20, total 40:
    // round((20/40)*20*1.5) = 15
    expect(result.attackerDamage).toBe(15);
    expect(shield.unit!.hp).toBe(65);
  });

  it('does not move a ship onto the killed tile', () => {
    const map = makeMap();
    const ship: Unit = { id: 'ship', owner: 0, type: 'warrior', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 50, attack: 20, attackDistance: 1, defense: 10, spawnVillage: null, shipLevel: 1 };
    map.tiles[0]!.unit = ship;
    const dying = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('b', 1, 1, 0, 1));
    map.tiles[1]! = dying;
    performAttack(map, ship, dying, noMiss);
    expect(map.tiles[0]!.unit).toBe(ship);
    expect(map.tiles[1]!.unit).toBeNull();
  });

  it('does not move a land attacker onto a killed ship tile', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const dyingShip: Unit = { id: 'ship', owner: 1, type: 'warrior', q: 0, r: -1, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 1, attack: 20, attackDistance: 1, defense: 10, spawnVillage: null, shipLevel: 1 };
    const shipTile = makeTile(0, -1, TileType.Water, dyingShip);
    map.tiles[2]! = shipTile;
    performAttack(map, attacker, shipTile, noMiss);
    expect(map.tiles[0]!.unit).toBe(attacker);
    expect(map.tiles[2]!.unit).toBeNull();
    expect(attacker.q).toBe(0);
    expect(attacker.r).toBe(0);
  });

  it('does not move a ship attacker onto a killed ship tile', () => {
    const map = makeMap();
    const ship: Unit = { id: 'shipA', owner: 0, type: 'warrior', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 50, attack: 20, attackDistance: 1, defense: 10, spawnVillage: null, shipLevel: 1 };
    map.tiles[0]!.unit = ship;
    const dyingShip: Unit = { id: 'shipB', owner: 1, type: 'warrior', q: 0, r: -1, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 1, attack: 20, attackDistance: 1, defense: 10, spawnVillage: null, shipLevel: 1 };
    const shipTile = makeTile(0, -1, TileType.Water, dyingShip);
    map.tiles[2]! = shipTile;
    performAttack(map, ship, shipTile, noMiss);
    expect(map.tiles[0]!.unit).toBe(ship);
    expect(map.tiles[2]!.unit).toBeNull();
  });

  it('does not move a land attacker onto a killed pirate tile', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const pirate: Unit = { id: 'pir', owner: -1, type: 'pirate', q: 0, r: -1, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 1, attack: 30, attackDistance: 3, defense: 5, spawnVillage: null };
    const pirateTile = makeTile(0, -1, TileType.Water, pirate);
    map.tiles[2]! = pirateTile;
    performAttack(map, attacker, pirateTile, noMiss);
    expect(map.tiles[0]!.unit).toBe(attacker);
    expect(map.tiles[2]!.unit).toBeNull();
    expect(attacker.q).toBe(0);
    expect(attacker.r).toBe(0);
  });

  it('a defending shield counters with defense-based damage', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const attacker = makeWarrior('a', 0, 0, 0, MAX_HP);
    const shield = makeTile(1, 0, TileType.GrasslandLand, makeShield('s', 1, 1, 0, 80));
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, attacker), shield);
    const result = performAttack(map, attacker, shield, noMiss);
    // Both forces 20 -> attack 15, counter 15.
    expect(result.attackerDamage).toBe(15);
    expect(result.targetDamage).toBe(15);
    expect(shield.unit!.hp).toBe(65);
    expect(attacker.hp).toBe(35);
    expect(result.attackerDied).toBe(false);
  });

  it('a land catapult never counter-attacks when hit', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const attacker = makeWarrior('a', 0, 0, 0, MAX_HP);
    const catapult = makeCatapult('c', 1, 1, 0, 40);
    const catapultTile = makeTile(1, 0, TileType.GrasslandLand, catapult);
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, attacker), catapultTile);
    const result = performAttack(map, attacker, catapultTile, noMiss);
    // defenseForce 0, attackForce 20: round((20/20)*20*1.5) = 30
    expect(catapultTile.unit!.hp).toBe(10);
    expect(result.targetDamage).toBe(0);
    expect(attacker.hp).toBe(MAX_HP);
  });

  it('a ship crew counter-attacks with its defense', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const attacker = makeWarrior('a', 0, 0, 0, MAX_HP);
    const shipWarrior = makeWarrior('c', 1, 1, 0, MAX_HP);
    shipWarrior.shipLevel = 1;
    const target = makeTile(1, 0, TileType.Water, shipWarrior);
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, attacker), target);
    const result = performAttack(map, attacker, target, noMiss);
    // attackForce 20, defenseForce 10, total 30: 20 / 5.
    expect(result.attackerDamage).toBe(20);
    expect(result.targetDamage).toBe(5);
    expect(attacker.hp).toBe(45);
  });

  it('does not apply counter-damage when the attacker is beyond the target reach', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const archer: Unit = { id: 'arc', owner: 0, type: 'archer', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 30, attack: 20, attackDistance: 2, defense: 10, spawnVillage: null };
    const far = makeTile(2, 0, TileType.GrasslandLand, makeWarrior('w', 1, 2, 0, 30));
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, archer), far);
    const result = performAttack(map, archer, far, noMiss);
    expect(result.targetDamage).toBe(0);
    expect(archer.hp).toBe(30);
    // attackForce 20, defenseForce 10*(30/50)=6, total 26: round((20/26)*20*1.5)=23
    expect(far.unit!.hp).toBe(7);
  });
});

describe('ship attacks', () => {  it('a level-3 ship attacks at distance 3 with damage 30 and can target water units', () => {
    const ship: Unit = {
      id: 's', owner: 0, type: 'archer', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 30, attack: 20, attackDistance: 2, defense: 10, spawnVillage: null,
      shipLevel: 3,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const enemy = makeWarrior('e', 1, 0, 3, 5);
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, ship), makeTile(0, 3, TileType.GrasslandLand, enemy));
    expect(attackDamage(ship)).toBe(30);
    expect(attackableTargets(map, ship).some((t) => t.q === 0 && t.r === 3)).toBe(true);
    const waterEnemy = makeWarrior('w', 1, 0, -1, 5);
    map.tiles.push(makeTile(0, -1, TileType.Water, waterEnemy));
    expect(attackableTargets(map, ship).some((t) => t.q === 0 && t.r === -1)).toBe(true);
  });

  it('a land unit can target an enemy ship on water', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    expect(attackableTargets(map, attacker).some((t) => t.q === 0 && t.r === -1)).toBe(true);
  });
});

describe('miss', () => {
  it('has a 10% miss chance', () => {
    expect(MISS_CHANCE).toBe(0.1);
  });

  it('misses when the roll is below the threshold, dealing no damage and no counter', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const target = map.tiles[1]!;
    const before = target.unit!.hp;
    const result = performAttack(map, attacker, target, () => 0.05);
    expect(result.missed).toBe(true);
    expect(result.attackerDamage).toBe(0);
    expect(result.targetDamage).toBe(0);
    expect(result.targetDied).toBe(false);
    expect(result.attackerDied).toBe(false);
    expect(target.unit!.hp).toBe(before);
    expect(attacker.hp).toBe(attacker.hp);
    expect(attacker.hasAttacked).toBe(true);
  });

  it('hits when the roll is at or above the threshold', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const target = map.tiles[1]!;
    const result = performAttack(map, attacker, target, () => 0.2);
    expect(result.missed).toBe(false);
    expect(result.attackerDamage).toBe(20);
    expect(target.unit!.hp).toBe(30);
  });
});

describe('science miss chance', () => {
  it('missChanceFor returns 0.05 with Science and 0.1 without', () => {
    expect(missChanceFor({ skills: ['science'] } as unknown as Player)).toBe(0.05);
    expect(missChanceFor({ skills: [] } as unknown as Player)).toBe(0.1);
  });

  it('honours an explicit miss chance lower than the default', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const target = map.tiles[1]!;
    const before = target.unit!.hp;
    const result = performAttack(map, attacker, target, () => 0.04, 0.05);
    expect(result.missed).toBe(true);
    expect(result.attackerDamage).toBe(0);
    expect(target.unit!.hp).toBe(before);
  });

  it('hits when an explicit miss chance is not exceeded', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const target = map.tiles[1]!;
    const result = performAttack(map, attacker, target, () => 0.08, 0.05);
    expect(result.missed).toBe(false);
    expect(result.attackerDamage).toBe(20);
    expect(target.unit!.hp).toBe(30);
  });

  it('clears capture-ready on a village when its standing unit dies and the killer advances', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const attacker = makeWarrior('a', 0, 0, 0, 50);
    const village = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('b', 1, 1, 0, 1));
    village.settlement = { owner: 2, level: 1, captureReady: true };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, attacker), village);
    const result = performAttack(map, attacker, village, noMiss);
    expect(result.targetDied).toBe(true);
    // The new occupant must hold the village for a full turn before capturing.
    expect(village.settlement!.captureReady).toBe(false);
    expect(village.unit).toBe(attacker);
  });

  it('keeps a village capture-ready when its own captain holds despite winning a fight', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const holder = makeWarrior('a', 0, 0, 0, 50);
    const village = makeTile(0, 0, TileType.GrasslandLand, holder);
    village.settlement = { owner: 2, level: 1, captureReady: true };
    const intruder = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('b', 1, 1, 0, 1));
    map.tiles.push(village, intruder);
    performAttack(map, holder, intruder, noMiss);
    expect(village.settlement!.captureReady).toBe(true);
  });

  it('clears capture-ready when the unit that earned it dies on the village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const doomed = makeWarrior('a', 0, 0, 0, 1);
    const village = makeTile(0, 0, TileType.GrasslandLand, doomed);
    village.settlement = { owner: 2, level: 1, captureReady: true };
    const killer = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('b', 1, 1, 0, 50));
    map.tiles.push(village, killer);
    const result = performAttack(map, doomed, killer, noMiss);
    expect(result.attackerDied).toBe(true);
    expect(village.unit).toBeNull();
    expect(village.settlement!.captureReady).toBe(false);
  });
});

describe('temple protection', () => {
  function waterProtectedMap(): GameMap {
    const map = makeMap();
    const b = map.tiles.find((t) => t.unit?.id === 'b')!;
    b.unit!.shipLevel = 1;
    b.terrain = TileType.Water;
    for (const q of [2, 3, 4]) {
      const t = makeTile(q, 0, TileType.Water);
      t.ownedBy = 1;
      t.building = { kind: 'temple', level: 1 };
      map.tiles.push(t);
    }
    return map;
  }

  it('reduces damage the target receives when it has water protection', () => {
    const map = waterProtectedMap();
    const attacker = map.tiles.find((t) => t.unit?.id === 'a')!.unit!;
    const target = map.tiles.find((t) => t.unit?.id === 'b')!;
    const result = performAttack(map, attacker, target, noMiss);
    // defenseBonus 1 + 10/10 = 2 -> defenseForce 20, total 40: round((20/40)*20*1.5) = 15
    expect(result.attackerDamage).toBe(15);
    expect(target.unit!.hp).toBe(35);
  });

  it('applies the attacker own-buff bonus to the counter it receives', () => {
    const map = waterProtectedMap();
    const attacker = map.tiles.find((t) => t.unit?.id === 'b')!.unit!;
    const target = map.tiles.find((t) => t.unit?.id === 'a')!;
    const result = performAttack(map, attacker, target, noMiss);
    // attacker(df?) is b a level-1 ship: attackForce = 10. target defenseForce 10,
    // total 20: attack round((10/20)*20*1.5)=15, counter round((10/20)*10*1.5)=8
    expect(result.attackerDamage).toBe(15);
    expect(result.targetDamage).toBe(8);
  });
});

describe('tradeIsFavorable', () => {
  function unitOf(id: string, type: keyof typeof UNIT_TYPES, owner: number, q: number, r: number): Unit {
    return { id, owner, type, q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: UNIT_TYPES[type].maxHp, attack: UNIT_TYPES[type].attack, attackDistance: UNIT_TYPES[type].attackDistance, defense: UNIT_TYPES[type].defense, spawnVillage: null };
  }
  function tileWith(q: number, r: number, u: Unit): MapTile {
    return { q, r, terrain: TileType.GrasslandLand, settlement: null, building: null, unit: u, ownedBy: null, claimedByVillage: null, exploredBy: [0, 1] };
  }

  it('returns true for a kill', () => {
    const knight = unitOf('k', 'knight', 0, 0, 0); // damage 50
    const weak = unitOf('w', 'warrior', 1, 1, 0);
    weak.hp = 10;
    expect(tradeIsFavorable(knight, tileWith(1, 0, weak))).toBe(true);
  });

  it('returns true when the target cannot counter', () => {
    const archer = unitOf('a', 'archer', 0, 0, 0); // range 2, damage 20
    const warrior = unitOf('w', 'warrior', 1, 2, 0); // range 1 -> cannot counter at distance 2
    expect(tradeIsFavorable(archer, tileWith(2, 0, warrior))).toBe(true);
  });

  it('returns true when the target is a land catapult, even in range', () => {
    const warrior = unitOf('w', 'warrior', 0, 0, 0);
    const catapult = unitOf('c', 'catapult', 1, 1, 0); // range 4, adjacent, but cannot counter
    expect(tradeIsFavorable(warrior, tileWith(1, 0, catapult))).toBe(true);
  });

  it('returns false for a losing melee trade', () => {
    const warrior = unitOf('w', 'warrior', 0, 0, 0);
    warrior.hp = 10; // this warrior is wounded: low attack force
    const swordsman = unitOf('s', 'swordsman', 1, 1, 0);
    expect(tradeIsFavorable(warrior, tileWith(1, 0, swordsman))).toBe(false);
  });

  it('returns true for an equal melee trade', () => {
    const a = unitOf('a', 'warrior', 0, 0, 0);
    const b = unitOf('b', 'warrior', 1, 1, 0);
    expect(tradeIsFavorable(a, tileWith(1, 0, b))).toBe(true);
  });
});