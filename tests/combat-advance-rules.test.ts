import { describe, expect, it } from 'vitest';
import { REPAIR_COST } from '../src/game/economy/buildings';
import { addStock } from '../src/game/economy/stock';
import { bonusEligibleFor } from '../src/game/map/bonus';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';
import { BonusKind, BuildingKind, CommandType, GameMode, UnitType } from '@enums';

function setup() {
  const map = makeTestMap(3);
  for (const t of map.tiles) t.exploredBy = [0, 1];
  tileAt(map, -2, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
  tileAt(map, 2, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  const sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.99 });
  sim.startGame();
  sim.drainEvents();
  return { map, players, sim };
}

describe('combat advance rules', () => {
  it('a melee killer stepping onto a bonus tile cannot claim it that turn', () => {
    const { map, sim } = setup();
    const bonusTile = tileAt(map, 0, 1)!;
    // A stale claim by the killer's own player (an earlier unit touched it, then left).
    bonusTile.bonus = { kind: BonusKind.MONEY, claimer: 0, arrivalTurn: 0 };
    const victim = makeUnit('v', 1, UnitType.WARRIOR, 0, 1);
    victim.hp = 1;
    bonusTile.unit = victim;
    const rider = makeUnit('r', 0, UnitType.RIDER, 0, 0);
    tileAt(map, 0, 0)!.unit = rider;
    expect(sim.applyCommand({ type: CommandType.ATTACK, unitId: 'r', q: 0, r: 1 })).toBe(true);
    expect(bonusTile.unit).toBe(rider);
    expect(bonusEligibleFor(map, 0, sim.turn)).toEqual([]);
    expect(bonusTile.bonus!.arrivalTurn).toBe(sim.turn);
  });

  it('a melee unit that razes an enemy tower takes its cell', () => {
    const { map, sim } = setup();
    const towerTile = tileAt(map, 0, 1)!;
    towerTile.ownedBy = 1;
    towerTile.building = { kind: BuildingKind.TOWER, level: 1, hp: 1 };
    const warrior = makeUnit('w', 0, UnitType.WARRIOR, 0, 0);
    tileAt(map, 0, 0)!.unit = warrior;
    expect(sim.applyCommand({ type: CommandType.ATTACK, unitId: 'w', q: 0, r: 1 })).toBe(true);
    expect(towerTile.building).toBeNull();
    expect(towerTile.unit).toBe(warrior);
    expect(tileAt(map, 0, 0)!.unit).toBeNull();
    expect([warrior.q, warrior.r]).toEqual([0, 1]);
  });

  it('a unit standing on a repaired building spends its whole turn', () => {
    const { map, players, sim } = setup();
    const farmTile = tileAt(map, -2, 1)!;
    farmTile.ownedBy = 0;
    farmTile.building = { kind: BuildingKind.FARM, level: 1, hp: 1 };
    const unit = makeUnit('b', 0, UnitType.WARRIOR, -2, 1);
    farmTile.unit = unit;
    players[0]!.resources.money += 50;
    addStock(tileAt(map, -2, 0)!, { wood: REPAIR_COST.wood ?? 0, stone: REPAIR_COST.stone ?? 0, ore: REPAIR_COST.ore ?? 0 });
    expect(sim.applyCommand({ type: CommandType.REPAIR, q: -2, r: 1 })).toBe(true);
    expect(farmTile.building!.hp).toBeUndefined();
    expect(unit.hasMoved).toBe(true);
    expect(unit.hasAttacked).toBe(true);
  });
});
