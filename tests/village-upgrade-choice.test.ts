import { villageUpgradeCost } from '@/game/economy/resources';
import { describe, expect, it } from 'vitest';
import { AiActionType, CommandType, GameMode, UnitType, VillageUpgradeBonus } from '@enums';
import { villageIncomeBreakdown } from '../src/game/economy/capture';
import { migrateLegacyResources } from '../src/game/economy/stock';
import {
  settlementIncomeLevel, settlementRadius, UPGRADE_MONEY_BONUS, upgradeVillage, villageUpgradeChoices,
} from '../src/game/economy/village';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe } from '../src/game/tribes';
import { AI_PATTERNS } from '../src/game/ai/ai-patterns';
import { type AiPlannerState } from '../src/game/ai/ai-types';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

function villageAt(level: number, radius = 8) {
  const map = makeTestMap(radius);
  const v = tileAt(map, 0, 0)!;
  v.settlement = { owner: 0, level, captureReady: false, capital: true };
  v.ownedBy = 0;
  return { map, v };
}

describe('villageUpgradeChoices', () => {
  it('offers a pick only at levels 5, 9 and 10+', () => {
    expect(villageUpgradeChoices(4)).toEqual([]);
    expect(villageUpgradeChoices(5)).toEqual([VillageUpgradeBonus.EXPAND_TERRITORY, VillageUpgradeBonus.MONEY]);
    expect(villageUpgradeChoices(6)).toEqual([]);
    expect(villageUpgradeChoices(9)).toEqual([VillageUpgradeBonus.EXPAND_TERRITORY, VillageUpgradeBonus.VETERAN_SWORDSMAN]);
    expect(villageUpgradeChoices(10)).toEqual([VillageUpgradeBonus.INCOME, VillageUpgradeBonus.VETERAN_SWORDSMAN]);
    expect(villageUpgradeChoices(14)).toEqual([VillageUpgradeBonus.INCOME, VillageUpgradeBonus.VETERAN_SWORDSMAN]);
  });
});

describe('upgradeVillage bonuses', () => {
  it('5→6: territory grows with the expand pick, stays with the money pick', () => {
    const a = villageAt(5);
    a.v.settlement!.radius = 2;
    const rA = upgradeVillage(a.map, a.v, () => 0, VillageUpgradeBonus.EXPAND_TERRITORY);
    expect(settlementRadius(a.v.settlement!)).toBe(3);
    expect(rA.money).toBe(0);
    const b = villageAt(5);
    b.v.settlement!.radius = 2;
    const rB = upgradeVillage(b.map, b.v, () => 0, VillageUpgradeBonus.MONEY);
    expect(settlementRadius(b.v.settlement!)).toBe(2);
    expect(rB.money).toBe(UPGRADE_MONEY_BONUS);
    expect(b.v.settlement!.level).toBe(6);
  });

  it('level 1→2 still widens the territory to 2', () => {
    const { map, v } = villageAt(1);
    upgradeVillage(map, v, () => 0);
    expect(settlementRadius(v.settlement!)).toBe(2);
  });

  it('10+: the swordsman pick leaves the income level behind the level', () => {
    const { map, v } = villageAt(10);
    v.settlement!.radius = 3;
    upgradeVillage(map, v, () => 0, VillageUpgradeBonus.VETERAN_SWORDSMAN);
    expect(v.settlement!.level).toBe(11);
    expect(settlementIncomeLevel(v.settlement!)).toBe(10);
    expect(villageIncomeBreakdown(map, v).raw).toBe(3 + 10 * 2);
    upgradeVillage(map, v, () => 0, VillageUpgradeBonus.INCOME);
    expect(settlementIncomeLevel(v.settlement!)).toBe(11);
  });

  it('9→10 keeps income following the level with either pick', () => {
    const { map, v } = villageAt(9);
    v.settlement!.radius = 3;
    upgradeVillage(map, v, () => 0, VillageUpgradeBonus.VETERAN_SWORDSMAN);
    expect(settlementIncomeLevel(v.settlement!)).toBe(10);
  });

  it('the veteran swordsman appears free; the unit standing there steps to a free neighbour', () => {
    const { map, v } = villageAt(10);
    const enemy = makeUnit('e', 1, UnitType.WARRIOR, 0, 0);
    v.unit = enemy;
    v.settlement!.captureReady = true;
    const r = upgradeVillage(map, v, () => 0, VillageUpgradeBonus.VETERAN_SWORDSMAN);
    expect(v.unit?.type).toBe(UnitType.SWORDSMAN);
    expect(v.unit?.owner).toBe(0);
    expect(v.unit?.veteran).toBe(true);
    expect(v.settlement!.captureReady).toBe(false);
    expect(r.displaced).toBe(enemy);
    expect(tileAt(map, enemy.q, enemy.r)!.unit).toBe(enemy);
    expect(enemy.q === 0 && enemy.r === 0).toBe(false);
  });

  it('a unit with no free neighbour is lost', () => {
    const { map, v } = villageAt(10, 2);
    for (const t of map.tiles) if (!(t.q === 0 && t.r === 0) && Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r)) === 1) t.unit = makeUnit(`b${t.q},${t.r}`, 0, UnitType.WARRIOR, t.q, t.r);
    v.unit = makeUnit('e', 1, UnitType.WARRIOR, 0, 0);
    const r = upgradeVillage(map, v, () => 0, VillageUpgradeBonus.VETERAN_SWORDSMAN);
    expect(r.removed?.id).toBe('e');
    expect(map.tiles.some((t) => t.unit?.id === 'e')).toBe(false);
    expect(v.unit?.type).toBe(UnitType.SWORDSMAN);
  });
});

describe('upgrading through the simulator', () => {
  function sim(level: number) {
    const { map, v } = villageAt(level, 6);
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    players[0]!.isHuman = true;
    migrateLegacyResources(map, players);
    players[0]!.resources.money = 1000;
    v.settlement!.stock = { wood: 1000, stone: 1000, ore: 0, food: 50 };
    const s = new Simulator(map, players, GameMode.CAPTURE, { rng: () => 0.5 });
    s.currentPlayerIndex = 0;
    return { s, map, v, players };
  }

  it('upgrades a village an enemy unit stands on, and the swordsman takes the cell', () => {
    const { s, map, v } = sim(10);
    v.unit = makeUnit('e', 1, UnitType.WARRIOR, 0, 0);
    const before = s.players[0]!.resources.money;
    s.applyCommand({ type: CommandType.UPGRADE_VILLAGE, q: 0, r: 0, bonus: VillageUpgradeBonus.VETERAN_SWORDSMAN });
    expect(v.settlement!.level).toBe(11);
    expect(v.unit?.type).toBe(UnitType.SWORDSMAN);
    expect(v.unit?.owner).toBe(0);
    expect(map.tiles.some((t) => t.unit?.id === 'e')).toBe(true);
    // The unit itself costs nothing; only the upgrade is paid.
    expect(s.players[0]!.resources.money).toBe(before - villageUpgradeCost(10).money);
  });

  it('the money pick adds money; a pick the level does not offer is refused', () => {
    const { s, v } = sim(5);
    const before = s.players[0]!.resources.money;
    s.applyCommand({ type: CommandType.UPGRADE_VILLAGE, q: 0, r: 0, bonus: VillageUpgradeBonus.VETERAN_SWORDSMAN });
    expect(v.settlement!.level).toBe(5);
    s.applyCommand({ type: CommandType.UPGRADE_VILLAGE, q: 0, r: 0, bonus: VillageUpgradeBonus.MONEY });
    expect(v.settlement!.level).toBe(6);
    expect(s.players[0]!.resources.money).toBe(before - villageUpgradeCost(5).money + UPGRADE_MONEY_BONUS);
  });
});

describe('AI last-chance upgrade', () => {
  it('upgrades for the swordsman when an enemy stands on its village', () => {
    const { map, v } = villageAt(10, 6);
    v.unit = makeUnit('e', 1, UnitType.WARRIOR, 0, 0);
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    migrateLegacyResources(map, players);
    players[0]!.resources.money = 1000;
    v.settlement!.stock = { wood: 1000, stone: 1000, ore: 0, food: 50 };
    const state: AiPlannerState = { moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(), built: new Set(), opened: new Set(), occupied: new Set() };
    const pattern = AI_PATTERNS.find((p) => p.id === 'upgrade-for-swordsman')!;
    const step = pattern.evaluate({ map, player: players[0]!, rng: new SeededRandom(1), state });
    expect(step).toEqual([{ type: AiActionType.UPGRADE, q: 0, r: 0, bonus: VillageUpgradeBonus.VETERAN_SWORDSMAN }]);
  });
});
