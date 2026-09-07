import { describe, it, expect } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { unitMaintenance } from '../src/game/units';

describe('disband command', () => {
  function setup(money: number): Simulator {
    const map = makeTestMap(2);
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.resources.money = money;
    const sim = new Simulator(map, players, 'capture');
    sim.startGame();
    sim.drainEvents();
    return sim;
  }

  it('removes the unit and pays 3x its upkeep', () => {
    const sim = setup(50);
    const before = sim.players[0]!.resources.money;
    const cost = 3 * unitMaintenance(tileAt(sim.map, 0, 0)!.unit!);
    expect(sim.applyCommand({ type: 'disband', unitId: 'u1' })).toBe(true);
    expect(tileAt(sim.map, 0, 0)!.unit).toBeNull();
    expect(sim.players[0]!.resources.money).toBe(before - cost);
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'unitDisbanded', unitId: 'u1', playerIndex: 0 }),
    );
  });

  it('rejects disbanding when the money cannot cover the cost', () => {
    const sim = setup(1);
    expect(sim.applyCommand({ type: 'disband', unitId: 'u1' })).toBe(false);
    expect(tileAt(sim.map, 0, 0)!.unit).not.toBeNull();
  });
});
