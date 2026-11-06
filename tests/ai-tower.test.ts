import { BuildingKind,SkillId,UnitType } from '@enums';
import { describe,expect,it } from 'vitest';
import { bestTowerSite } from '../src/game/ai/defense/best-tower-site';
import { towerSkillWanted } from '../src/game/ai/defense/tower-skill-wanted';
import type { AiPlannerState } from '../src/game/ai/types/planner-state';
import { hexDistance } from '../src/game/map/hex';
import { type GameMap,type MapTile } from '../src/game/map/map-gen';
import { TileType } from '../src/game/map/tile-types';
import { Tribe } from '../src/game/tribes';
import { makeUnit } from '../src/game/units/units';

function tile(q: number, r: number): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement: null, unit: null, ownedBy: 0, claimedByVillage: null, building: null, exploredBy: [0, 1] };
}

function player(skills: SkillId[]): import('../src/game/players').Player {
  return {
    index: 0, tribe: Tribe.Villagers, isHuman: false, name: 'ai', isActive: true, score: 0, kills: 0, skills,
    resources: { wood: 0, stone: 10, money: 30, ore: 5, food: 20 },
  };
}

const state = (): AiPlannerState => ({ moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(), built: new Set(), opened: new Set(), occupied: new Set() });

function world(enemies: number): { map: GameMap; village: MapTile } {
  const tiles: MapTile[] = [];
  for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) if (Math.abs(q + r) <= 6) tiles.push(tile(q, r));
  const village = tiles.find((t) => t.q === 0 && t.r === 0)!;
  village.settlement = { owner: 0, level: 2, captureReady: false, stock: { wood: 0, stone: 10, ore: 5, food: 0 } };
  // Enemies stand east of the village.
  const spots = [[3, 0], [3, -1], [4, -1], [2, 1]].slice(0, enemies);
  for (const [q, r] of spots) {
    const t = tiles.find((x) => x.q === q && x.r === r)!;
    t.ownedBy = 1;
    t.unit = makeUnit(1, UnitType.WARRIOR, q!, r!);
  }
  return { map: { radius: 6, tiles, spawns: [] }, village };
}

describe('ai towers', () => {
  it('builds between the village and the enemies, on the enemy side', () => {
    const { map, village } = world(4);
    const site = bestTowerSite(map, player([SkillId.TOWER]), village, state());
    expect(site).not.toBeNull();
    const t = site!.tile;
    expect(hexDistance(village, t)).toBeLessThanOrEqual(2);
    expect(hexDistance(t, site!.threat.center)).toBeLessThan(hexDistance(village, site!.threat.center));
    expect(t.q).toBeGreaterThan(0);
  });

  it('needs 3+ enemies, the skill and no tower already guarding', () => {
    expect(bestTowerSite(world(2).map, player([SkillId.TOWER]), world(2).village, state())).toBeNull();
    const { map, village } = world(4);
    expect(bestTowerSite(map, player([]), village, state())).toBeNull();
    const site = bestTowerSite(map, player([SkillId.TOWER]), village, state())!;
    site.tile.building = { kind: BuildingKind.TOWER, level: 1 };
    expect(bestTowerSite(map, player([SkillId.TOWER]), village, state())).toBeNull();
  });

  it('heads for the Tower skill step by step while pressed', () => {
    const { map } = world(4);
    expect(towerSkillWanted(map, player([]))).toBe(SkillId.SHIELDS);
    expect(towerSkillWanted(map, player([SkillId.SHIELDS]))).toBe(SkillId.DEFENSE);
    expect(towerSkillWanted(map, player([SkillId.SHIELDS, SkillId.DEFENSE]))).toBe(SkillId.TOWER);
    expect(towerSkillWanted(map, player([SkillId.TOWER]))).toBeNull();
    expect(towerSkillWanted(world(1).map, player([]))).toBeNull();
  });
});
