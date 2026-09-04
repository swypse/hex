import { describe, it, expect } from 'vitest';
import { allTiles, axialKey, hexDistance, hexNeighbors, ringOf, tilesInRange } from '../src/game/hex';
import { generateMap, mapRadiusFor, bridgeIslandVillages } from '../src/game/mapGen';
import { MapTile, Settlement } from '../src/game/mapGen';
import { isLandType, isWaterType, TileType } from '../src/game/tileTypes';
import { isForestType, isMountainType } from '../src/game/tileTypes';
import { Biome } from '../src/game/biomes';

describe('map generation', () => {
  it('chooses radius by player count', () => {
    expect(mapRadiusFor(2)).toBe(7);
    expect(mapRadiusFor(3)).toBe(8);
    expect(mapRadiusFor(4)).toBe(9);
    expect(mapRadiusFor(5)).toBe(10);
    expect(mapRadiusFor(6)).toBe(11);
    expect(() => mapRadiusFor(1)).toThrow();
    expect(() => mapRadiusFor(7)).toThrow();
  });

  it('generates the expected number of tiles', () => {
    const map = generateMap(2, 42);
    expect(map.tiles).toHaveLength(allTiles(8).length);
  });

  it('keeps starting villages at least 2 tiles from the map edge', () => {
    const map = generateMap(2, 42);
    for (const s of map.spawns) {
      expect(hexDistance({ q: 0, r: 0 }, s.start)).toBeLessThanOrEqual(map.radius - 2);
    }
  });

  it('keeps all villages at pairwise distance >= 4', () => {
    const map = generateMap(3, 42);
    const villages = map.tiles.filter((t) => t.settlement !== null);
    for (let i = 0; i < villages.length; i++) {
      for (let j = i + 1; j < villages.length; j++) {
        expect(hexDistance(villages[i]!, villages[j]!)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('varies starting positions across seeds', () => {
    const a = generateMap(2, 1).spawns.map((s) => `${s.start.q},${s.start.r}`).join('|');
    const b = generateMap(2, 2).spawns.map((s) => `${s.start.q},${s.start.r}`).join('|');
    expect(a).not.toBe(b);
  });

  it('is deterministic for a fixed seed', () => {
    expect(generateMap(2, 42).tiles).toEqual(generateMap(2, 42).tiles);
  });

  it('stores climate data and a biome on every tile', () => {
    const map = generateMap(2, 42);
    for (const t of map.tiles) {
      expect(t.biome).toBeDefined();
      expect(typeof t.temperature).toBe('number');
      expect(typeof t.rain).toBe('number');
      expect(typeof t.height).toBe('number');
    }
  });

  it('produces roughly 40% water and 10% mountains away from villages', () => {
    const map = generateMap(3, 42);
    const radius = map.radius;
    const nearVillage = new Set<string>();
    for (const s of map.tiles.filter((t) => t.settlement !== null)) {
      for (const n of tilesInRange(s, 1)) nearVillage.add(axialKey(n));
    }
    const wild = map.tiles.filter(
      (t) => !nearVillage.has(axialKey(t)) && hexDistance({ q: 0, r: 0 }, t) < radius,
    );
    expect(wild.length).toBeGreaterThan(0);
    const water = wild.filter((t) => t.terrain === TileType.Water).length / wild.length;
    const mountain =
      wild.filter(
        (t) =>
          t.terrain === TileType.GrasslandMountain ||
          t.terrain === TileType.DesertMountain ||
          t.terrain === TileType.TundraMountain ||
          t.terrain === TileType.TaigaMountain ||
          t.terrain === TileType.RainforestMountain,
      ).length / wild.length;
    expect(water).toBeGreaterThan(0.32);
    expect(water).toBeLessThan(0.48);
    expect(mountain).toBeGreaterThan(0.09);
    expect(mountain).toBeLessThan(0.16);
  });

  it('keeps every village and its radius-1 area out of the water', () => {
    const map = generateMap(3, 42);
    const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
    const settlements = map.tiles.filter((t) => t.settlement !== null);
    for (const s of settlements) {
      expect(isWaterType(s.terrain)).toBe(false);
      for (const n of hexNeighbors(s)) {
        const neighbor = byKey.get(axialKey(n));
        if (neighbor) expect(isWaterType(neighbor.terrain)).toBe(false);
      }
    }
  });

  it('assigns a name to every settlement', () => {
    const map = generateMap(2, 123);
    const settlements = map.tiles.filter((t) => t.settlement);
    expect(settlements.length).toBe(4);
    for (const t of settlements) {
      expect(t.settlement!.name).toBeTruthy();
    }
  });

  it('places one owned settlement per player and one free settlement per player', () => {
    const map = generateMap(2, 42);
    const owned = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner !== null);
    const free = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner === null);
    expect(owned).toHaveLength(2);
    expect(free).toHaveLength(2);
    expect(new Set(owned.map((t) => t.settlement!.owner))).toEqual(new Set([0, 1]));
  });

  it('has no settlement adjacent to another settlement', () => {
    const map = generateMap(3, 42);
    const settlements = map.tiles.filter((t) => t.settlement !== null);
    const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
    for (const s of settlements) {
      for (const n of hexNeighbors(s)) {
        const neighbor = byKey.get(axialKey(n));
        if (neighbor) {
          expect(neighbor.settlement).toBeNull();
        }
      }
    }
  });

  it('guarantees a mountain and a forest within distance 2 of every starting village', () => {
    for (const pc of [2, 3, 4]) {
      for (let seed = 1; seed <= 6; seed++) {
        const map = generateMap(pc, seed * 7 + pc);
        for (const s of map.spawns) {
          for (const v of [s.start, s.free]) {
            const near = map.tiles.filter((t) => {
              const d = hexDistance(t, v);
              return d >= 1 && d <= 2;
            });
            expect(
              near.some((t) => isMountainType(t.terrain)),
              `mountain within 2 of village ${v.q},${v.r} (pc=${pc} seed=${seed})`,
            ).toBe(true);
            expect(
              near.some((t) => isForestType(t.terrain)),
              `forest within 2 of village ${v.q},${v.r} (pc=${pc} seed=${seed})`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('pairs each player with a free village at distance >= 4', () => {
    const map = generateMap(3, 42);
    expect(map.spawns).toHaveLength(3);
    for (const s of map.spawns) {
      expect(hexDistance(s.start, s.free)).toBeGreaterThanOrEqual(4);
    }
  });

  it('places each free village near its starting village', () => {
    for (const pc of [2, 3, 4]) {
      for (let seed = 1; seed <= 8; seed++) {
        const map = generateMap(pc, seed * 11 + pc);
        for (const s of map.spawns) {
          const d = hexDistance(s.start, s.free);
          expect(d, `pc=${pc} seed=${seed}`).toBeGreaterThanOrEqual(4);
          expect(d, `pc=${pc} seed=${seed}`).toBeLessThanOrEqual(7);
        }
      }
    }
  });

  it('never places a settlement on the map center tile', () => {
    const map = generateMap(3, 42);
    const center = map.tiles.find((t) => t.q === 0 && t.r === 0);
    expect(center?.settlement).toBeNull();
  });

  it('keeps a land-ish terrain type under every settlement', () => {
    const map = generateMap(3, 42);
    const settlements = map.tiles.filter((t) => t.settlement !== null);
    expect(settlements.length).toBeGreaterThan(0);
    for (const s of settlements) {
      expect(isLandType(s.terrain)).toBe(true);
      expect(s.terrain).not.toBe(TileType.Settlement);
    }
  });

  it('places a warrior unit on every owned village and none on free villages', () => {
    const map = generateMap(2, 42);
    const owned = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner !== null);
    const free = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner === null);
    expect(owned.length).toBeGreaterThan(0);
    for (const s of owned) {
      expect(s.unit).not.toBeNull();
      expect(s.unit!.type).toBe('warrior');
      expect(s.unit!.owner).toBe(s.settlement!.owner);
      expect(s.unit!.q).toBe(s.q);
      expect(s.unit!.r).toBe(s.r);
      expect(s.unit!.hasMoved).toBe(false);
      expect(s.unit!.hp).toBe(50);
      expect(s.unit!.attack).toBe(20);
      expect(s.unit!.attackDistance).toBe(1);
    }
    for (const f of free) {
      expect(f.unit).toBeNull();
    }
  });

  it('claims owned cells for owned villages, first-claim-wins', () => {
    const map = generateMap(3, 42);
    const ownedSettlements = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner !== null);
    expect(ownedSettlements.length).toBeGreaterThan(0);
    for (const s of ownedSettlements) {
      expect(s.ownedBy).toBe(s.settlement!.owner);
      expect(s.settlement!.level).toBe(1);
      expect(s.settlement!.captureReady).toBe(false);
    }
    const free = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner === null);
    for (const f of free) {
      expect(f.ownedBy).toBeNull();
      expect(f.settlement!.level).toBe(1);
      expect(f.settlement!.captureReady).toBe(false);
    }
    const owned = map.tiles.filter((t) => t.ownedBy !== null);
    expect(owned.length).toBeGreaterThan(0);
    for (const t of owned) {
      const nearby = map.tiles.some(
        (s) =>
          s.settlement !== null &&
          s.settlement.owner === t.ownedBy &&
          hexDistance(s, t) <= 1,
      );
      expect(nearby).toBe(true);
    }
  });

  it('marks each owned starting village as capital, free villages not', () => {
    const map = generateMap(2, 42);
    const owned = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner !== null);
    const free = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner === null);
    expect(owned.length).toBeGreaterThan(0);
    for (const t of owned) {
      expect(t.settlement!.capital).toBe(true);
    }
    for (const f of free) {
      expect(f.settlement!.capital).toBeFalsy();
    }
  });

  it('connects every stranded village to land', () => {
    const map = generateMap(3, 42);
    const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
    for (const s of map.tiles.filter((t) => t.settlement !== null)) {
      const ring2 = ringOf(s, 2);
      const ring2AllWater = ring2.every((n) => {
        const t = byKey.get(axialKey(n));
        return t !== undefined && isWaterType(t.terrain);
      });
      if (!ring2AllWater) continue;
      const reachable = new Set<string>();
      const frontier = [{ q: s.q, r: s.r }];
      while (frontier.length > 0) {
        const cur = frontier.pop()!;
        for (const n of hexNeighbors(cur)) {
          const k = axialKey(n);
          const t = byKey.get(k);
          if (!t || reachable.has(k) || isWaterType(t.terrain)) continue;
          reachable.add(k);
          frontier.push(n);
        }
      }
      const outsideLand = map.tiles.some(
        (t) => !isWaterType(t.terrain) && hexDistance(s, t) >= 2 && reachable.has(axialKey(t)),
      );
      expect(outsideLand).toBe(true);
    }
  });

  it('free villages claim their radius-1 territory with ownedBy null', () => {
    const map = generateMap(3, 42);
    const free = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner === null);
    expect(free.length).toBeGreaterThan(0);
    for (const f of free) {
      const claimed = map.tiles.filter(
        (t) => t.claimedByVillage && t.claimedByVillage.q === f.q && t.claimedByVillage.r === f.r,
      );
      expect(claimed.length).toBeGreaterThanOrEqual(6);
      for (const c of claimed) {
        expect(hexDistance({ q: f.q, r: f.r }, c)).toBeLessThanOrEqual(1);
      }
    }
  });
});

function tileAt(q: number, r: number, terrain: TileType, settlement: Settlement | null = null): MapTile {
  return {
    q,
    r,
    terrain,
    biome: Biome.Grassland,
    settlement,
    building: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
  };
}

describe('bridgeIslandVillages', () => {
  it('builds a land bridge for a village stranded on a 1-ring island', () => {
    const tiles = [
      tileAt(0, 0, TileType.GrasslandLand, { owner: 0, level: 1, captureReady: false, capital: true }),
      ...ringOf({ q: 0, r: 0 }, 1).map((n) => tileAt(n.q, n.r, TileType.GrasslandLand)),
      ...ringOf({ q: 0, r: 0 }, 2).map((n) => tileAt(n.q, n.r, TileType.Water)),
    ];
    const mainland = { q: 3, r: 0 };
    tiles.push(tileAt(mainland.q, mainland.r, TileType.GrasslandLand));

    bridgeIslandVillages(tiles);

    const byKey = new Map(tiles.map((t) => [axialKey(t), t]));
    expect(isWaterType(byKey.get('1,0')!.terrain)).toBe(false);
    expect(isWaterType(byKey.get('2,0')!.terrain)).toBe(false);
    const reachable = new Set<string>();
    const frontier = [{ q: 0, r: 0 }];
    while (frontier.length > 0) {
      const cur = frontier.pop()!;
      for (const n of hexNeighbors(cur)) {
        const k = axialKey(n);
        const t = byKey.get(k);
        if (!t || reachable.has(k) || isWaterType(t.terrain)) continue;
        reachable.add(k);
        frontier.push(n);
      }
    }
    expect(reachable.has(axialKey(mainland))).toBe(true);
  });

  it('leaves the map untouched when the village is not stranded', () => {
    const tiles = [
      tileAt(0, 0, TileType.GrasslandLand, { owner: 0, level: 1, captureReady: false, capital: true }),
      ...ringOf({ q: 0, r: 0 }, 1).map((n) => tileAt(n.q, n.r, TileType.GrasslandLand)),
      ...ringOf({ q: 0, r: 0 }, 2).map((n) => tileAt(n.q, n.r, TileType.Water)),
      tileAt(2, 0, TileType.GrasslandLand),
    ];
    const before = tiles.map((t) => t.terrain);

    bridgeIslandVillages(tiles);

    expect(tiles.map((t) => t.terrain)).toEqual(before);
  });
});
