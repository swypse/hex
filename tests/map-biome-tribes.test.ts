import { describe, expect, it } from 'vitest';
import { biomeAffinity } from '../src/game/map/biomes';
import { generateMap } from '../src/game/map/map-gen';
import { Tribe } from '../src/game/tribes';

const TRIBES = [Tribe.Villagers, Tribe.Warriors, Tribe.Barbarians, Tribe.Forest, Tribe.Aqua, Tribe.Sand];

function matchRate(withTribes: boolean): number {
  let hits = 0;
  let total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const tribes = [0, 1, 2, 3].map((i) => TRIBES[(seed + i * 2) % TRIBES.length]!);
    const map = generateMap(4, seed, withTribes ? tribes : undefined);
    tribes.forEach((tribe, p) => {
      const start = map.tiles.find((t) => t.q === map.spawns[p]!.start.q && t.r === map.spawns[p]!.start.r)!;
      if (biomeAffinity(tribe, start.biome) > 0) hits += 1;
      total += 1;
    });
  }
  return hits / total;
}

describe('start biome matches the tribe', () => {
  it('puts most players on a biome their tribe prefers', () => {
    expect(matchRate(true)).toBeGreaterThan(0.6);
    expect(matchRate(true)).toBeGreaterThan(matchRate(false) + 0.3);
  });

  it('is unchanged when no tribes are given', () => {
    const a = generateMap(4, 7);
    const b = generateMap(4, 7, undefined);
    expect(a.spawns).toEqual(b.spawns);
  });

  it('keeps spawn index = player index', () => {
    const map = generateMap(3, 11, [Tribe.Sand, Tribe.Barbarians, Tribe.Villagers]);
    map.spawns.forEach(({ start }, p) => {
      expect(map.tiles.find((t) => t.q === start.q && t.r === start.r)!.settlement?.owner).toBe(p);
    });
  });
});
