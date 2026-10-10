import { describe, expect, it } from 'vitest';
import { planAiActions } from '../src/game/ai/ai';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt, makeUnit, giveResources } from './helpers/test-map';
import { TileType } from '../src/game/map/tile-types';
import { AiActionType, AiDifficulty, BuildingKind, SkillId, UnitType } from '@enums';

function makeAI(): ReturnType<typeof buildPlayers>[number] {
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(11), AiDifficulty.NORMAL);
  return players[1]!;
}

describe('AI keeps villages defended', () => {
  it('does not march the only defender out of a village an enemy can reach next turn', () => {
    const map = makeTestMap(6);
    const ai = makeAI();
    // Own village (0,0) with its only guard.
    const home = tileAt(map, 0, 0)!;
    home.settlement = { owner: 1, level: 1, captureReady: false };
    home.ownedBy = 1;
    home.exploredBy = [1];
    const guard = makeUnit('guard', 1, UnitType.WARRIOR, 0, 0);
    home.unit = guard;
    // A fast enemy rider three hexes east: can reach the village next turn.
    const riderTile = tileAt(map, 3, 0)!;
    riderTile.unit = makeUnit('rider', 0, UnitType.RIDER, 3, 0);
    riderTile.exploredBy = [1];
    // An enemy village adjacent to our guard that it could 'push' into.
    const enemyVillage = tileAt(map, 0, -1)!;
    enemyVillage.settlement = { owner: 0, level: 1, captureReady: false };
    enemyVillage.ownedBy = 0;
    enemyVillage.exploredBy = [1];

    const actions = planAiActions(map, ai, new SeededRandom(5));
    expect(actions.some((a) => a.type === AiActionType.MOVE && a.unitId === 'guard')).toBe(false);
  });
});

describe('AI opening order in the first village', () => {
  function setup(level: number) {
    const map = makeTestMap(6);
    const ai = makeAI();
    ai.skills = [SkillId.FORESTRY, SkillId.SMITHERY, SkillId.AGRICULTURE, SkillId.GRANARY];
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 1, level, captureReady: false, capital: true };
    village.ownedBy = 1;
    village.exploredBy = [1];
    const claim = (q: number, r: number, terrain?: TileType) => {
      const t = tileAt(map, q, r)!;
      if (terrain) t.terrain = terrain;
      t.ownedBy = 1;
      t.claimedByVillage = { q: 0, r: 0 };
    };
    claim(0, 1, TileType.GrasslandMountain);
    claim(0, -1, TileType.GrasslandForest);
    claim(1, 0);
    claim(-1, 0);
    claim(1, -1);
    giveResources(map, ai, { money: 300, wood: 60, stone: 60, food: 30 });
    return { map, ai };
  }
  const kinds = (actions: ReturnType<typeof planAiActions>) =>
    actions.flatMap((a) => (a.type === AiActionType.UPGRADE ? ['upgrade'] : a.type === AiActionType.BUILD ? [a.kind] : []));

  it('upgrades the first village before building anything', () => {
    const { map, ai } = setup(1);
    const order = kinds(planAiActions(map, ai, new SeededRandom(9)));
    expect(order[0]).toBe('upgrade');
  });

  it('then builds sawmill, mine and farm in that order', () => {
    const { map, ai } = setup(2);
    const order = kinds(planAiActions(map, ai, new SeededRandom(9)));
    const idx = (k: BuildingKind) => order.indexOf(k);
    expect(idx(BuildingKind.SAWMILL)).toBeGreaterThanOrEqual(0);
    expect(idx(BuildingKind.SAWMILL)).toBeLessThan(idx(BuildingKind.MINE));
    expect(idx(BuildingKind.MINE)).toBeLessThan(idx(BuildingKind.FARM));
    expect(idx(BuildingKind.FARM)).toBeGreaterThan(idx(BuildingKind.MINE));
  });

  it('finishes with a granary next to the farm, whatever the food situation', () => {
    const { map, ai } = setup(3);
    tileAt(map, 0, 1)!.building = { kind: BuildingKind.MINE, level: 1 };
    tileAt(map, -1, 0)!.building = { kind: BuildingKind.SAWMILL, level: 1 };
    tileAt(map, 1, 0)!.building = { kind: BuildingKind.FARM, level: 1 };
    const order = kinds(planAiActions(map, ai, new SeededRandom(9)));
    expect(order).toContain(BuildingKind.GRANARY);
  });
});

describe('AI prepares for winter food', () => {
  it('builds a granary next to a farm for a network that has none', () => {
    const map = makeTestMap(6);
    const ai = makeAI();
    ai.skills = [SkillId.AGRICULTURE, SkillId.GRANARY];
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 1, level: 2, captureReady: false };
    village.ownedBy = 1;
    village.settlement.capital = true;
    giveResources(map, ai, { money: 200, wood: 40, stone: 40, food: 0 });
    village.unit = makeUnit('w', 1, UnitType.WARRIOR, 0, 0);
    village.unit.spawnVillage = { q: 0, r: 0 };
    // Upkeep equals the farm's yield: balance 0, so only winter planning wants a granary.
    const second = tileAt(map, -1, 0)!;
    second.unit = makeUnit('w2', 1, UnitType.WARRIOR, -1, 0);
    second.unit.spawnVillage = { q: 0, r: 0 };
    const farm = tileAt(map, 1, 0)!;
    farm.ownedBy = 1;
    farm.claimedByVillage = { q: 0, r: 0 };
    farm.building = { kind: BuildingKind.FARM, level: 1 };
    for (const [q, r] of [[0, 1], [1, -1], [2, -1], [2, 0], [1, 1]] as const) {
      const t = tileAt(map, q, r)!;
      t.ownedBy = 1;
      t.claimedByVillage = { q: 0, r: 0 };
    }
    const actions = planAiActions(map, ai, new SeededRandom(3));
    expect(actions.some((a) => a.type === AiActionType.BUILD && a.kind === BuildingKind.GRANARY)).toBe(true);
  });

  it('demolishes a sawmill that boxes in its farm to make room for a granary, and does not rebuild it', () => {
    const map = makeTestMap(6);
    const ai = makeAI();
    ai.skills = [SkillId.AGRICULTURE, SkillId.GRANARY, SkillId.FORESTRY];
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 1, level: 3, captureReady: false, capital: true };
    village.ownedBy = 1;
    giveResources(map, ai, { money: 200, wood: 40, stone: 40, food: 0 });
    village.unit = makeUnit('w', 1, UnitType.WARRIOR, 0, 0);
    village.unit.spawnVillage = { q: 0, r: 0 };
    const second = tileAt(map, -1, 0)!;
    second.unit = makeUnit('w2', 1, UnitType.WARRIOR, -1, 0);
    second.unit.spawnVillage = { q: 0, r: 0 };
    const farm = tileAt(map, 1, 0)!;
    farm.ownedBy = 1;
    farm.claimedByVillage = { q: 0, r: 0 };
    farm.building = { kind: BuildingKind.FARM, level: 1 };
    // Every other tile next to the farm holds a sawmill.
    for (const [q, r] of [[0, 1], [1, -1], [2, -1], [2, 0], [1, 1]] as const) {
      const t = tileAt(map, q, r)!;
      t.ownedBy = 1;
      t.claimedByVillage = { q: 0, r: 0 };
      t.building = { kind: BuildingKind.SAWMILL, level: 1 };
    }
    const actions = planAiActions(map, ai, new SeededRandom(3));
    expect(actions.some((a) => a.type === AiActionType.DESTROY_BUILDING)).toBe(true);
    expect(actions.some((a) => a.type === AiActionType.BUILD && a.kind === BuildingKind.SAWMILL)).toBe(false);
  });
});

describe('AI stone focus', () => {
  function village(map: ReturnType<typeof makeTestMap>, ai: ReturnType<typeof makeAI>) {
    const v = tileAt(map, 0, 0)!;
    v.settlement = { owner: 1, level: 3, captureReady: false, capital: true };
    v.ownedBy = 1;
    v.exploredBy = [1];
    const mountain = tileAt(map, 0, 1)!;
    mountain.terrain = TileType.GrasslandMountain;
    mountain.ownedBy = 1;
    mountain.claimedByVillage = { q: 0, r: 0 };
    for (const [q, r] of [[1, 0], [-1, 0], [0, -1]] as const) {
      const t = tileAt(map, q, r)!;
      t.ownedBy = 1;
      t.claimedByVillage = { q: 0, r: 0 };
    }
    giveResources(map, ai, { money: 200, wood: 40, stone: 40, food: 30 });
    return v;
  }

  it('builds only a mine (and one sawmill), no spawns or other buildings, until a village has a mine', () => {
    const map = makeTestMap(6);
    const ai = makeAI();
    ai.skills = [SkillId.FORESTRY, SkillId.SMITHERY, SkillId.AGRICULTURE];
    village(map, ai);
    tileAt(map, -1, 0)!.terrain = TileType.GrasslandForest;
    const actions = planAiActions(map, ai, new SeededRandom(4));
    expect(actions.some((a) => a.type === AiActionType.BUILD && a.kind === BuildingKind.MINE)).toBe(true);
    const firstMine = actions.findIndex((a) => a.type === AiActionType.BUILD && a.kind === BuildingKind.MINE);
    const spawn = actions.findIndex((a) => a.type === AiActionType.SPAWN);
    if (spawn >= 0) expect(spawn).toBeGreaterThan(firstMine);
    const farm = actions.findIndex((a) => a.type === AiActionType.BUILD && a.kind === BuildingKind.FARM);
    if (farm >= 0) expect(farm).toBeGreaterThan(firstMine);
  });

  it('opens Geology (via Science) when it has a mine and little stone', () => {
    const map = makeTestMap(6);
    const ai = makeAI();
    ai.skills = [SkillId.FORESTRY, SkillId.SMITHERY, SkillId.CLIMBING, SkillId.AGRICULTURE];
    const v = village(map, ai);
    tileAt(map, 0, 1)!.building = { kind: BuildingKind.MINE, level: 1 };
    giveResources(map, ai, { money: 200, wood: 40, stone: 2, food: 30 });
    void v;
    const actions = planAiActions(map, ai, new SeededRandom(4));
    expect(actions.some((a) => a.type === AiActionType.OPEN_SKILL && (a.skill === SkillId.SCIENCE || a.skill === SkillId.GEOLOGY))).toBe(true);
  });
});
