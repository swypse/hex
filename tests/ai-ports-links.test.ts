import { describe, expect, it } from 'vitest';
import { analyzeWater, bestOpenPortSite, portSiteValue } from '../src/game/ai/ai-water';
import { planLinks } from '../src/game/ai/ai-links';
import { makeTestMap, tileAt } from './helpers/test-map';
import { TileType } from '../src/game/map/tile-types';
import { Tribe } from '../src/game/tribes';
import type { Player } from '../src/game/players';
import { AiDifficulty, SkillId } from '@enums';

function ai(skills: SkillId[] = []): Player {
  return {
    index: 1, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 50, stone: 50, money: 200, ore: 10, food: 20 },
    score: 0, kills: 0, skills, isActive: true, difficulty: AiDifficulty.NORMAL,
  };
}

function village(map: ReturnType<typeof makeTestMap>, q: number, r: number, owner: number): void {
  const t = tileAt(map, q, r)!;
  t.settlement = { owner, level: 1, captureReady: false };
  t.ownedBy = owner;
  t.exploredBy = [1];
}

describe('AI port sites', () => {
  it('rejects a pond and values open water that reaches the map edge', () => {
    const map = makeTestMap(6);
    // a one-tile pond in the middle of the land
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    // a lake of seven tiles touching the map edge
    for (const [q, r] of [[6, -3], [6, -2], [5, -2], [5, -1], [4, -1], [4, 0], [3, 0]] as const) tileAt(map, q, r)!.terrain = TileType.Water;
    const atlas = analyzeWater(map, 1);
    expect(portSiteValue(atlas, tileAt(map, 0, 0)!)).toBe(-Infinity);
    expect(portSiteValue(atlas, tileAt(map, 4, 0)!)).toBeGreaterThan(0);
  });

  it('prefers the coast that faces an enemy village', () => {
    const map = makeTestMap(8);
    for (let q = -8; q <= 8; q++) for (const r of [0, 1]) {
      const t = tileAt(map, q, r);
      if (t) t.terrain = TileType.Water;
    }
    village(map, -6, -1, 0);
    const atlas = analyzeWater(map, 1);
    const near = tileAt(map, -6, 0)!;
    const far = tileAt(map, 6, 0)!;
    expect(portSiteValue(atlas, near)).toBeGreaterThan(portSiteValue(atlas, far));
    expect(bestOpenPortSite(atlas, [far, near])).toBe(near);
  });
});

describe('AI network links', () => {
  it('lays a road to join two separate villages', () => {
    const map = makeTestMap(8);
    village(map, 0, 0, 1);
    village(map, 4, 0, 1);
    const plan = planLinks(map, ai([SkillId.ROADS]));
    expect(plan.roads.length).toBeGreaterThan(0);
  });

  it('extends a road toward a known enemy village', () => {
    const map = makeTestMap(8);
    village(map, 0, 0, 1);
    village(map, 6, 0, 0);
    const plan = planLinks(map, ai([SkillId.ROADS]));
    expect(plan.enemyRoad).not.toBeNull();
    expect(plan.enemyRoad!.q).toBeGreaterThan(0);
  });

  it('plans nothing without the roads or water skills', () => {
    const map = makeTestMap(8);
    village(map, 0, 0, 1);
    village(map, 4, 0, 1);
    const plan = planLinks(map, ai());
    expect(plan.roads).toEqual([]);
    expect(plan.enemyRoad).toBeNull();
  });
});
