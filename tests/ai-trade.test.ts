import { CommandType, GameMode, ResourceKind } from '@enums';
import { describe, expect, it } from 'vitest';
import { readStock } from '../src/game/economy/stock';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt } from './helpers/test-map';

/** Human 0 and AI 1, one capital each with a stock. */
function scene(humanStock: number, aiStock: number) {
  const map = makeTestMap(5);
  [0, 3].forEach((q, i) => {
    const t = tileAt(map, q, 0)!;
    t.settlement = { owner: i, level: 1, captureReady: false, capital: true, stock: { wood: 5, stone: i === 0 ? humanStock : aiStock, ore: 0, food: 25 } };
    t.ownedBy = i;
  });
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  players[0]!.resources.money = 30;
  players[1]!.resources.money = 30;
  const sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5, aiRng: () => new SeededRandom(1), disablePirates: true });
  sim.startGame();
  return { sim, map, players, human: tileAt(map, 0, 0)!, ai: tileAt(map, 3, 0)! };
}

describe('AI trading', () => {
  it('a short AI posts an order, accepts a human proposal and pays', () => {
    const s = scene(6, 0);
    s.sim.applyCommand({ type: CommandType.END_TURN });
    const order = s.sim.trading.ordersOf(1)[0]!;
    expect(order).toMatchObject({ resource: ResourceKind.STONE, quantity: 1 });
    expect(s.sim.trading.visibleOrders(s.players[0]!)).toHaveLength(1);
    expect(s.sim.applyCommand({ type: CommandType.PROPOSE, orderId: order.id, payment: { wood: 0, stone: 0, money: 3, ore: 0, food: 0 } })).toBe(true);
    s.sim.applyCommand({ type: CommandType.END_TURN });
    expect(s.sim.trading.ordersOf(1)).toHaveLength(0);
    expect(readStock(s.ai).stone).toBe(1);
    expect(s.players[1]!.score).toBeGreaterThanOrEqual(10);
  });

  it('an AI with spare stock answers a human order, asking at least the fair price', () => {
    const s = scene(0, 12);
    s.sim.applyCommand({ type: CommandType.PLACE_ORDER, resource: ResourceKind.STONE, quantity: 4 });
    s.sim.applyCommand({ type: CommandType.END_TURN });
    const proposal = s.sim.trading.ordersOf(0)[0]!.proposals[0]!;
    expect(proposal.seller).toBe(1);
    expect(proposal.payment.money + proposal.payment.wood * 2 + proposal.payment.ore * 5).toBeGreaterThanOrEqual(12 * 0.7);
    expect(readStock(s.ai).stone).toBeLessThanOrEqual(8); // 4 held in escrow (the AI may also spend some)
  });

  it('an AI keeps stock its plans need', () => {
    const s = scene(0, 3);
    s.sim.applyCommand({ type: CommandType.PLACE_ORDER, resource: ResourceKind.STONE, quantity: 4 });
    s.sim.applyCommand({ type: CommandType.END_TURN });
    expect(s.sim.trading.ordersOf(0)[0]!.proposals).toHaveLength(0);
  });
});
