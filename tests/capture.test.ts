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
  it('reduces income when over capacity', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = makeTile(0, 0, { owner: 0, level: 1, captureReady: false });
    village.unit = makeUnit('a', 0, 0, 0);
    village.unit.spawnVillage = { q: 0, r: 0 };
    const b = makeTile(1, 0, null, makeUnit('b', 0, 1, 0));
    b.unit!.spawnVillage = { q: 0, r: 0 };
    const c = makeTile(2, 0, null, makeUnit('c', 0, 2, 0));
    c.unit!.spawnVillage = { q: 0, r: 0 };
    const d = makeTile(3, 0, null, makeUnit('d', 0, 3, 0));
    d.unit!.spawnVillage = { q: 0, r: 0 };
    map.tiles.push(village, b, c, d);
    expect(villageIncome(map, village)).toBe(2);
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

