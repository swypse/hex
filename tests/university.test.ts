import { describe, expect, it } from 'vitest';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, makeUnit, tileAt, giveResources } from './helpers/test-map';
import { buildingCostAt, BUILDING_COSTS, canBuildUniversity } from '../src/game/economy/buildings';
import { tileUpkeep } from '../src/game/economy/capture';
import { farmYield, AGRONOMY_WINTER_FOOD } from '../src/game/economy/food';
import { canOpenSkill, randomUnopenedSkill, SKILLS } from '../src/game/skills';
import { costLabel } from '../src/game/economy/resources';
import { gameController } from '../src/controller/game-controller';
import { useGameStore } from '../src/store/game-store';
import { toolbarSpecs } from '../src/ui/hud/toolbar-specs';
import { HEAL_AMOUNT, MEDICINE_HEAL_BONUS } from '../src/game/units/units';
import type { GameMap } from '../src/game/map/map-gen';
import { BuildingKind, CommandType, GameMode, Season, SelectionKind, SkillId, UnitType } from '@enums';

function setup(level = 5) {
  const map = makeTestMap(4);
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  const p = players[0]!;
  const village = tileAt(map, 0, 0)!;
  village.settlement = { owner: 0, level, captureReady: false, capital: true };
  village.ownedBy = 0;
  for (const [q, r] of [[1, 0], [0, 1], [-1, 1], [1, -1]] as const) {
    const t = tileAt(map, q, r)!;
    t.ownedBy = 0;
    t.claimedByVillage = { q: 0, r: 0 };
  }
  p.skills = [SkillId.SCIENCE];
  giveResources(map, p, { money: 200, wood: 50, stone: 50, ore: 20, food: 0 });
  return { map, p, players, site: tileAt(map, 1, 0)! };
}

describe('university', () => {
  it('needs Science, an own empty land tile and a village of level 5+', () => {
    const { map, p, site } = setup();
    expect(canBuildUniversity(map, site, p)).toBe(true);
    p.skills = [];
    expect(canBuildUniversity(map, site, p)).toBe(false);
    p.skills = [SkillId.SCIENCE];
    tileAt(map, 0, 0)!.settlement!.level = 4;
    expect(canBuildUniversity(map, site, p)).toBe(false);
  });

  it('allows only one per village', () => {
    const { map, p, site } = setup();
    site.building = { kind: BuildingKind.UNIVERSITY, level: 1 };
    expect(canBuildUniversity(map, tileAt(map, 0, 1)!, p)).toBe(false);
  });

  it('costs 40 money, 10 stone, 5 ore and 2 money upkeep', () => {
    expect(BUILDING_COSTS.university).toMatchObject({ money: 40, stone: 10, ore: 5 });
    const { site } = setup();
    site.building = { kind: BuildingKind.UNIVERSITY, level: 1 };
    expect(tileUpkeep(site)).toBe(2);
  });

  it('can be built with the build command and pays its cost', () => {
    const { map, players, p, site } = setup();
    const sim = new Simulator(map, players, GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    const money = p.resources.money;
    expect(sim.applyCommand({ type: CommandType.BUILD, q: 1, r: 0, kind: BuildingKind.UNIVERSITY })).toBe(true);
    expect(site.building?.kind).toBe(BuildingKind.UNIVERSITY);
    expect(p.resources.money).toBeLessThanOrEqual(money - 40);
  });
});

describe('university skills', () => {
  it('Geology, Agronomy, Engineering and Medicine need an own university', () => {
    const { map, p, site } = setup();
    p.skills = [SkillId.SCIENCE, SkillId.AGRICULTURE];
    for (const id of [SkillId.GEOLOGY, SkillId.AGRONOMY, SkillId.ENGINEERING, SkillId.MEDICINE]) {
      expect(canOpenSkill(p, id, map)).toBe(false);
      expect(canOpenSkill(p, id, null)).toBe(false);
    }
    site.building = { kind: BuildingKind.UNIVERSITY, level: 1 };
    site.ownedBy = 0;
    for (const id of [SkillId.GEOLOGY, SkillId.AGRONOMY, SkillId.ENGINEERING, SkillId.MEDICINE]) {
      expect(canOpenSkill(p, id, map)).toBe(true);
    }
  });

  it('Catapult is a child of Shields', () => {
    expect(SKILLS.catapult.parent).toBe(SkillId.SHIELDS);
    const { map, p } = setup();
    p.skills = [SkillId.SCIENCE];
    expect(canOpenSkill(p, SkillId.CATAPULT, map)).toBe(false);
    p.skills = [SkillId.SHIELDS];
    expect(canOpenSkill(p, SkillId.CATAPULT, map)).toBe(true);
  });
});

describe('university effects', () => {
  function withUniversity() {
    const s = setup();
    const uni = tileAt(s.map, 1, -1)!;
    uni.building = { kind: BuildingKind.UNIVERSITY, level: 1 };
    return { ...s, uni };
  }

  it('Agronomy: +1 food for a farm in a village with a university, and 1 in winter', () => {
    const { map, p, site } = withUniversity();
    site.building = { kind: BuildingKind.FARM, level: 1 };
    map.season = Season.SUMMER;
    const base = farmYield(p, map as GameMap, site);
    p.skills = [SkillId.SCIENCE, SkillId.AGRICULTURE, SkillId.AGRONOMY];
    expect(farmYield(p, map as GameMap, site)).toBe(base + 1);
    map.season = Season.WINTER;
    expect(farmYield(p, map as GameMap, site)).toBe(AGRONOMY_WINTER_FOOD);
    // A farm outside the village gets nothing extra.
    const far = tileAt(map, -3, 0)!;
    far.building = { kind: BuildingKind.FARM, level: 1 };
    far.ownedBy = 0;
    expect(farmYield(p, map as GameMap, far)).toBe(0);
  });

  it('Engineering: about 10% less wood and stone in a village with a university', () => {
    const { map, p, site } = withUniversity();
    const full = BUILDING_COSTS.granary;
    expect(buildingCostAt(map, p, site, BuildingKind.GRANARY)).toEqual(full);
    p.skills = [SkillId.SCIENCE, SkillId.ENGINEERING];
    const cut = buildingCostAt(map, p, site, BuildingKind.GRANARY);
    expect(cut.wood).toBe(9);
    expect(cut.stone).toBe(9);
    expect(cut.money).toBe(full.money);
  });

  it('Medicine: units heal +10 more on the tiles of a village with a university', () => {
    const { map, players, p, site } = withUniversity();
    p.skills = [SkillId.SCIENCE, SkillId.MEDICINE];
    const unit = makeUnit('w', 0, UnitType.WARRIOR, 1, 0);
    unit.hp = 10;
    unit.spawnVillage = { q: 0, r: 0 };
    site.unit = unit;
    const other = makeUnit('o', 0, UnitType.WARRIOR, 0, 0);
    other.hp = 10;
    const sim = new Simulator(map, players, GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: CommandType.HEAL, unitId: 'w' })).toBe(true);
    expect(unit.hp).toBe(10 + HEAL_AMOUNT + MEDICINE_HEAL_BONUS);
  });
});

describe('university prerequisites for random skills', () => {
  it('bottles and bonuses never pick a skill that needs a university the player lacks', () => {
    const { map, p } = setup();
    p.skills = [];
    const needing = [SkillId.GEOLOGY, SkillId.AGRONOMY, SkillId.ENGINEERING, SkillId.MEDICINE];
    for (let i = 0; i < 200; i++) {
      expect(needing).not.toContain(randomUnopenedSkill(p, Math.random, map));
    }
    // Without a map nothing building-gated is offered either.
    for (let i = 0; i < 50; i++) expect(needing).not.toContain(randomUnopenedSkill(p, Math.random));
  });

  it('may pick them once the player owns a university', () => {
    const { map, p, site } = setup();
    site.building = { kind: BuildingKind.UNIVERSITY, level: 1 };
    p.skills = (Object.keys(SKILLS) as SkillId[]).filter((id) => id !== SkillId.MEDICINE);
    expect(randomUnopenedSkill(p, () => 0, map)).toBe(SkillId.MEDICINE);
  });
});

describe('build button prices', () => {
  it('formats a cost with money, wood, stone and ore', () => {
    expect(costLabel({ money: 40, wood: 0, stone: 10, ore: 5, food: 0 })).toBe('40m, 10s, 5o');
  });

  it('shows the Engineering discount in the build label', () => {
    const { map, players, p, site } = setup();
    tileAt(map, 1, -1)!.building = { kind: BuildingKind.UNIVERSITY, level: 1 };
    tileAt(map, 0, 1)!.building = { kind: BuildingKind.FARM, level: 1 };
    p.skills = [SkillId.SCIENCE, SkillId.AGRICULTURE, SkillId.GRANARY];
    const sim = new Simulator(map, players, GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    (gameController as unknown as { sim: unknown }).sim = sim;
    const store = useGameStore.getState();
    store.setLocalPlayerIndex(0);
    store.setPlayers(players);
    store.setSelection({ kind: SelectionKind.TILE, q: site.q, r: site.r });
    const label = (): string => toolbarSpecs().find((a) => a.key === BuildingKind.GRANARY)!.label;
    expect(label()).toBe('Build granary (20m, 10w, 10s)');
    p.skills.push(SkillId.ENGINEERING);
    expect(label()).toBe('Build granary (20m, 9w, 9s)');
  });
});
