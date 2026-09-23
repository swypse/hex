import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement, SettlementBuild } from '../src/game/map-gen';
import { TileType } from '../src/game/tile-types';
import { claimRadius, ownedTilesFor, upgradeVillage } from '../src/game/village';

function makeTile(
  q: number,
  r: number,
  ownedBy: number | null = null,
  settlement: Settlement | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit: null, ownedBy, claimedByVillage: null, building: null };
}

function makeMap(): GameMap {
  const a = makeTile(0, 0, 0, { owner: 0, level: 1, captureReady: false });
  const b = makeTile(3, 0, 1, { owner: 1, level: 1, captureReady: false });
  const free = makeTile(0, 3, null, { owner: null, level: 1, captureReady: false });
  const empty = makeTile(2, 0, null);
  const tiles = [a, b, free, empty];
  return { radius: 5, tiles, spawns: [] };
}

describe('claimRadius', () => {
  it('maps level to radius', () => {
    expect(claimRadius(1)).toBe(1);
    expect(claimRadius(2)).toBe(2);
    expect(claimRadius(5)).toBe(3);
  });
});

describe('ownedTilesFor', () => {
  it('returns all tiles owned by the same player', () => {
    const map = makeMap();
    const a = map.tiles[0]!;
    expect(ownedTilesFor(map, a)).toHaveLength(1);
    expect(ownedTilesFor(map, a)[0]!.q).toBe(0);
  });
});

describe('upgradeVillage', () => {
  it('increments level and claims unowned tiles within radius 2', () => {
    const map = makeMap();
    const a = map.tiles[0]!;
    upgradeVillage(map, a);
    expect(a.settlement!.level).toBe(2);
    const owned = map.tiles.filter((t) => t.ownedBy === 0);
    expect(owned).toContain(a);
    expect(owned.some((t) => t.q === 2 && t.r === 0)).toBe(true);
    expect(map.tiles.find((t) => t.q === 3 && t.r === 0)!.ownedBy).toBe(1);
  });

  it('does nothing for a neutral village', () => {
    const map = makeMap();
    const free = map.tiles[2]!;
    upgradeVillage(map, free);
    expect(free.settlement!.level).toBe(1);
  });
});

describe('upgradeVillage build rolling', () => {
  const alwaysM1 = () => 0.0;
  const alwaysM2 = () => 0.25;
  const alwaysM3 = () => 0.5;
  const alwaysM4 = () => 0.75;

  function upgraded(level: number, roll: () => number = alwaysM1): SettlementBuild {
    const map = makeMap();
    const a = map.tiles[0]!;
    while (a.settlement!.level < level) upgradeVillage(map, a, roll);
    return a.settlement!.build!;
  }

  it('level 2: only the tall main columns get an added middle block', () => {
    const b = upgraded(2);
    expect(b.l.map((c) => c.length)).toEqual([0, 1, 1]);
    expect(b.r.map((c) => c.length)).toEqual([1, 1]);
    expect(b.lBack!.map((c) => c.length)).toEqual([0, 0]);
    expect(b.rBack!.map((c) => c.length)).toEqual([0]);
  });

  it('level 3: every column has one middle block', () => {
    const b = upgraded(3);
    expect(b.l.map((c) => c.length)).toEqual([1, 1, 1]);
    expect(b.r.map((c) => c.length)).toEqual([1, 1]);
    expect(b.lBack!.map((c) => c.length)).toEqual([1, 1]);
    expect(b.rBack!.map((c) => c.length)).toEqual([1]);
  });

  it('level 4: tall main columns get a second middle block', () => {
    const b = upgraded(4);
    expect(b.l.map((c) => c.length)).toEqual([1, 2, 2]);
    expect(b.r.map((c) => c.length)).toEqual([2, 2]);
    expect(b.lBack!.map((c) => c.length)).toEqual([1, 1]);
    expect(b.rBack!.map((c) => c.length)).toEqual([1]);
  });

  it('maps roll quarters to the four middle-block variants m1..m4', () => {
    const m1 = upgraded(3, alwaysM1);
    const m2 = upgraded(3, alwaysM2);
    const m3 = upgraded(3, alwaysM3);
    const m4 = upgraded(3, alwaysM4);
    for (const col of [...m1.l, ...m1.r, ...m1.lBack!, ...m1.rBack!]) expect(col).toEqual(['m1']);
    for (const col of [...m2.l, ...m2.r, ...m2.lBack!, ...m2.rBack!]) expect(col).toEqual(['m2']);
    for (const col of [...m3.l, ...m3.r, ...m3.lBack!, ...m3.rBack!]) expect(col).toEqual(['m3']);
    for (const col of [...m4.l, ...m4.r, ...m4.lBack!, ...m4.rBack!]) expect(col).toEqual(['m4']);
  });

  it('top-ups a legacy settlement that already has a level but no build', () => {
    const map = makeMap();
    const a = map.tiles[0]!;
    a.settlement!.level = 3;
    upgradeVillage(map, a, alwaysM1);
    expect(a.settlement!.level).toBe(4);
    const b = a.settlement!.build!;
    expect(b.l.map((c) => c.length)).toEqual([1, 2, 2]);
    expect(b.r.map((c) => c.length)).toEqual([2, 2]);
    expect(b.lBack!.map((c) => c.length)).toEqual([1, 1]);
    expect(b.rBack!.map((c) => c.length)).toEqual([1]);
    for (const col of [...b.l, ...b.r, ...b.lBack!, ...b.rBack!]) {
      expect(col.every((v) => v === 'm1')).toBe(true);
    }
  });

  it('top-ups back columns of an existing record created before back columns existed', () => {
    const map = makeMap();
    const a = map.tiles[0]!;
    a.settlement!.build = { l: [['m1']], r: [['m1'], ['m1']] };
    a.settlement!.level = 2;
    upgradeVillage(map, a, alwaysM1);
    expect(a.settlement!.level).toBe(3);
    const b = a.settlement!.build!;
    expect(b.l[0]).toEqual(['m1']);
    expect(b.r.map((c) => c.length)).toEqual([1, 1]);
    for (const col of [...b.lBack!, ...b.rBack!]) {
      expect(col).toEqual(['m1']);
    }
  });

  it('does not record build choices for neutral villages', () => {
    const map = makeMap();
    const free = map.tiles[2]!;
    upgradeVillage(map, free, alwaysM1);
    expect(free.settlement!.level).toBe(1);
    expect(free.settlement!.build).toBeUndefined();
  });
});
