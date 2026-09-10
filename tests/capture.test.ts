import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Unit } from '../src/game/units';
import { captureVillage, setCaptureReady, villageIncome, villageIncomeTotal } from '../src/game/capture';

function makeTile(
  q: number,
  r: number,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy: settlement ? settlement.owner : null, claimedByVillage: null, building: null };
}

function makeUnit(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: true, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 99, r: 99 } };
}

describe('setCaptureReady', () => {
  it('sets and clears the flag', () => {
    const tile = makeTile(0, 0, { owner: 1, level: 1, captureReady: false });
    setCaptureReady(tile, true);
    expect(tile.settlement!.captureReady).toBe(true);
  });
});

describe('captureVillage', () => {
  it('transfers ownership and territory, re-links the capturer', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = makeTile(0, 0, { owner: 1, level: 1, captureReady: true });
    village.ownedBy = 1;
    village.claimedByVillage = { q: 0, r: 0 };
    const capturer = makeUnit('c', 0, 0, 0);
    village.unit = capturer;
    const territory = makeTile(1, 0);
    territory.ownedBy = 1;
    territory.claimedByVillage = { q: 0, r: 0 };
    map.tiles.push(village, territory);
    const result = captureVillage(map, village, capturer);
    expect(village.settlement!.owner).toBe(0);
    expect(village.ownedBy).toBe(0);
    expect(territory.ownedBy).toBe(0);
    expect(capturer.spawnVillage).toEqual({ q: 0, r: 0 });
    expect(result.ownerDied).toBe(true);
  });

  it('marks the previous owner inactive when it was their last village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = makeTile(0, 0, { owner: 1, level: 1, captureReady: true });
    village.unit = makeUnit('c', 0, 0, 0);
    const leftover = makeTile(2, 0, null, makeUnit('l', 1, 2, 0));
    map.tiles.push(village, leftover);
    const result = captureVillage(map, village, village.unit!);
    expect(result.ownerDied).toBe(true);
    expect(leftover.unit).toBeNull();
  });

  it('transfers only the captured village territory, not other villages of the same owner', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const captured = makeTile(0, 0, { owner: 1, level: 1, captureReady: true });
    captured.ownedBy = 1;
    captured.claimedByVillage = { q: 0, r: 0 };
    captured.unit = makeUnit('c', 0, 0, 0);
    const capturedCell = makeTile(1, 0);
    capturedCell.ownedBy = 1;
    capturedCell.claimedByVillage = { q: 0, r: 0 };
    const otherVillage = makeTile(3, 0, { owner: 1, level: 1, captureReady: false });
    otherVillage.ownedBy = 1;
    otherVillage.claimedByVillage = { q: 3, r: 0 };
    const otherCell = makeTile(4, 0);
    otherCell.ownedBy = 1;
    otherCell.claimedByVillage = { q: 3, r: 0 };
    map.tiles.push(captured, capturedCell, otherVillage, otherCell);
    captureVillage(map, captured, captured.unit!);
    expect(capturedCell.ownedBy).toBe(0);
    expect(otherCell.ownedBy).toBe(1);
    expect(otherVillage.ownedBy).toBe(1);
  });

  it('capturing a free village transfers its radius-1 territory', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = makeTile(0, 0, { owner: null, level: 1, captureReady: true });
    village.claimedByVillage = { q: 0, r: 0 };
    village.unit = makeUnit('c', 0, 0, 0);
    const freeCell = makeTile(1, 0);
    freeCell.ownedBy = null;
    freeCell.claimedByVillage = { q: 0, r: 0 };
    const otherFreeCell = makeTile(0, 1);
    otherFreeCell.ownedBy = null;
    otherFreeCell.claimedByVillage = { q: 0, r: 0 };
    map.tiles.push(village, freeCell, otherFreeCell);
    const result = captureVillage(map, village, village.unit!);
    expect(result.ownerDied).toBe(false);
    expect(freeCell.ownedBy).toBe(0);
    expect(otherFreeCell.ownedBy).toBe(0);
    expect(village.settlement!.owner).toBe(0);
  });

  it('disables the capturer for the rest of the round', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = makeTile(0, 0, { owner: 1, level: 1, captureReady: true });
    village.ownedBy = 1;
    village.claimedByVillage = { q: 0, r: 0 };
    const capturer = makeUnit('c', 0, 0, 0);
    village.unit = capturer;
    map.tiles.push(village);
    captureVillage(map, village, capturer);
    expect(capturer.hasMoved).toBe(true);
    expect(capturer.hasAttacked).toBe(true);
    expect(capturer.hasHealed).toBe(true);
  });
});

describe('villageIncome', () => {
  function mapWithVillage(level: number): { map: GameMap; village: MapTile } {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = makeTile(0, 0, { owner: 0, level, captureReady: false });
    map.tiles.push(village);
    return { map, village };
  }

  it('pays a base of 3 + 2 × level with no units', () => {
    const l1 = mapWithVillage(1);
    expect(villageIncome(l1.map, l1.village)).toBe(5);
    const l3 = mapWithVillage(3);
    expect(villageIncome(l3.map, l3.village)).toBe(9);
  });

  it('subtracts the upkeep of the units the village raised', () => {
    const { map, village } = mapWithVillage(2); // base 7
    for (const [id, type] of [['a', 'warrior'], ['b', 'rider']] as const) {
      const t = makeTile(1, 0, null, makeUnit(id, 0, 1, 0));
      t.unit!.type = type;
      t.unit!.spawnVillage = { q: 0, r: 0 };
      map.tiles.push(t);
    }
    expect(villageIncome(map, village)).toBe(7 - 1 - 2);
  });

  it('clamps income to zero when upkeep exceeds the base', () => {
    const { map, village } = mapWithVillage(2); // base 7
    const costs: { type: Unit['type']; cost: number }[] = [
      { type: 'knight', cost: 4 }, { type: 'catapult', cost: 5 },
    ];
    for (const [i, c] of costs.entries()) {
      const t = makeTile(1 + i, 0, null, makeUnit(`u${i}`, 0, 1 + i, 0));
      t.unit!.type = c.type;
      t.unit!.spawnVillage = { q: 0, r: 0 };
      map.tiles.push(t);
    }
    expect(villageIncome(map, village)).toBe(0);
  });

  it('charges ships by their level', () => {
    const { map, village } = mapWithVillage(3); // base 9
    for (const [i, level] of [[0, 1], [1, 3]] as const) {
      const t = makeTile(1 + i, 0, null, makeUnit(`s${i}`, 0, 1 + i, 0));
      t.unit!.shipLevel = level;
      t.unit!.spawnVillage = { q: 0, r: 0 };
      map.tiles.push(t);
    }
    // ship upkeep 2 + 4 = 6
    expect(villageIncome(map, village)).toBe(9 - 6);
  });

  it('ignores units that do not belong to the village owner', () => {
    const { map, village } = mapWithVillage(1); // base 5
    const enemy = makeTile(1, 0, null, makeUnit('e', 1, 1, 0));
    enemy.unit!.spawnVillage = { q: 0, r: 0 }; // raised here, but not ours
    map.tiles.push(enemy);
    const foreign = makeTile(2, 0, null, makeUnit('f', 0, 2, 0));
    foreign.unit!.spawnVillage = { q: 9, r: 9 }; // ours, raised elsewhere
    map.tiles.push(foreign);
    expect(villageIncome(map, village)).toBe(5);
  });

  it('yields nothing while an enemy unit stands on the village itself', () => {
    const { map, village } = mapWithVillage(3); // base 9
    const enemy = makeUnit('e', 1, 0, 0);
    enemy.spawnVillage = null;
    village.unit = enemy;
    expect(villageIncome(map, village)).toBe(0);
  });

  it('respects the owner after the enemy leaves', () => {
    const { map, village } = mapWithVillage(1); // base 5
    const enemy = makeUnit('e', 1, 0, 0);
    village.unit = enemy;
    expect(villageIncome(map, village)).toBe(0);
    village.unit = null;
    expect(villageIncome(map, village)).toBe(5);
  });
});

describe('villageIncomeTotal', () => {
  it('sums the income of all villages owned by the player', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const v1 = makeTile(0, 0, { owner: 0, level: 1, captureReady: false });
    const v2 = makeTile(1, 0, { owner: 0, level: 2, captureReady: false });
    const other = makeTile(2, 0, { owner: 1, level: 1, captureReady: false });
    map.tiles.push(v1, v2, other);
    expect(villageIncomeTotal(map, 0)).toBe(villageIncome(map, v1) + villageIncome(map, v2));
  });
});

