import { CommandType, GameEventType, GameMode, ResourceKind, TradeCloseReason } from '@enums';
import { describe, expect, it } from 'vitest';
import { buildMultiplayerPlayers } from '../src/game/players';
import { Simulator, type Command } from '../src/game/simulator';
import { readStock } from '../src/game/economy/stock';
import { TRADE_SCORE } from '../src/game/score';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt } from './helpers/test-map';
import type { Resources } from '../src/game/economy/resources';

const pay = (p: Partial<Resources>): Resources => ({ wood: 0, stone: 0, money: 0, ore: 0, food: 0, ...p });

/** Buyer 0 (Cats) and seller 1 (Warriors), one capital each, humans. */
function scene(buyerTribe = Tribe.Cats) {
  const map = makeTestMap(5);
  for (const [i, q] of [0, 3].entries()) {
    const t = tileAt(map, q, 0)!;
    t.settlement = { owner: i, level: 1, captureReady: false, capital: true, stock: { wood: 0, stone: 0, ore: 0, food: 0 } };
    t.ownedBy = i;
  }
  const players = buildMultiplayerPlayers([{ name: 'A', tribe: buyerTribe }, { name: 'B', tribe: Tribe.Warriors }], 0, new SeededRandom(1));
  players[0]!.resources.money = 20;
  players[1]!.resources.money = 20;
  const sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
  const buyerVillage = tileAt(map, 0, 0)!;
  const sellerVillage = tileAt(map, 3, 0)!;
  const run = (cmd: Command): boolean => sim.applyCommand(cmd);
  const order = () => sim.snapshot().trades!.orders[0];
  return { sim, map, players, buyerVillage, sellerVillage, run, order };
}

const PLACE = { type: CommandType.PLACE_ORDER, resource: ResourceKind.STONE, quantity: 5 } as const;

describe('trading', () => {
  it('charges 5 money for an order, 3 for Villagers', () => {
    const a = scene();
    expect(a.run(PLACE)).toBe(true);
    expect(a.players[0]!.resources.money).toBe(15);
    const b = scene(Tribe.Villagers);
    expect(b.run(PLACE)).toBe(true);
    expect(b.players[0]!.resources.money).toBe(17);
  });

  it('rejects bad orders: size, second order, no money', () => {
    const s = scene();
    expect(s.run({ ...PLACE, quantity: 11 })).toBe(false);
    expect(s.run({ ...PLACE, quantity: 0 })).toBe(false);
    s.players[0]!.resources.money = 4;
    expect(s.run(PLACE)).toBe(false);
    s.players[0]!.resources.money = 20;
    expect(s.run(PLACE)).toBe(true);
  });

  it('allows several open orders, up to the limit, each with its own fee', () => {
    const s = scene();
    expect(s.run(PLACE)).toBe(true);
    expect(s.run({ ...PLACE, resource: ResourceKind.WOOD })).toBe(true);
    expect(s.run(PLACE)).toBe(true);
    expect(s.run(PLACE)).toBe(false);
    expect(s.players[0]!.resources.money).toBe(20 - 3 * 5);
    expect(s.sim.snapshot().trades!.orders).toHaveLength(3);
  });

  it('settles a full order: escrow, delivery, payment and score for both', () => {
    const s = scene();
    s.sellerVillage.settlement!.stock!.stone = 6;
    s.run(PLACE);
    s.run({ type: CommandType.END_TURN });
    const id = s.order()!.id;
    // Seller turn: proposal holds the goods back.
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 12, ore: 1 }) })).toBe(true);
    expect(readStock(s.sellerVillage).stone).toBe(1);
    s.run({ type: CommandType.END_TURN });
    // Buyer turn: decide.
    s.players[0]!.resources.money = 12;
    s.buyerVillage.settlement!.stock!.ore = 1;
    s.sim.drainEvents();
    expect(s.run({ type: CommandType.ACCEPT_PROPOSAL, orderId: id, seller: 1 })).toBe(true);
    expect(readStock(s.buyerVillage).stone).toBe(5);
    expect(readStock(s.buyerVillage).ore).toBe(0);
    expect(s.players[0]!.resources.money).toBe(0);
    expect(s.players[1]!.resources.money).toBe(20 + 5 + 12); // start + round income + payment
    expect(readStock(s.sellerVillage).ore).toBe(1);
    expect(s.players[0]!.score).toBe(TRADE_SCORE);
    expect(s.players[1]!.score).toBe(TRADE_SCORE);
    expect(s.order()).toBeUndefined();
    expect(s.sim.drainEvents().some((e) => e.type === GameEventType.TRADE_SETTLED)).toBe(true);
  });

  it('enforces the price floor and ceiling', () => {
    const s = scene();
    s.sellerVillage.settlement!.stock!.stone = 5;
    s.run(PLACE);
    s.run({ type: CommandType.END_TURN });
    const id = s.order()!.id;
    // 5 stone = 15: floor 10.5, ceiling 45.
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 10 }) })).toBe(false);
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 46 }) })).toBe(false);
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ stone: 5 }) })).toBe(false);
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 11 }) })).toBe(true);
  });

  it('cannot propose without the goods, nor on your own order', () => {
    const s = scene();
    s.run(PLACE);
    const id = s.order()!.id;
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 15 }) })).toBe(false);
    s.run({ type: CommandType.END_TURN });
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 15 }) })).toBe(false);
  });

  it('a revised proposal replaces the old one without double escrow', () => {
    const s = scene();
    s.sellerVillage.settlement!.stock!.stone = 5;
    s.run(PLACE);
    s.run({ type: CommandType.END_TURN });
    const id = s.order()!.id;
    s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 15 }) });
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 12 }) })).toBe(true);
    expect(s.order()!.proposals).toEqual([{ seller: 1, village: { q: 3, r: 0 }, turn: 1, payment: pay({ money: 12 }) }]);
    expect(readStock(s.sellerVillage).stone).toBe(0);
    expect(s.run({ type: CommandType.WITHDRAW_PROPOSAL, orderId: id })).toBe(true);
    expect(readStock(s.sellerVillage).stone).toBe(5);
  });

  it('accept fails and moves nothing when the buyer cannot pay', () => {
    const s = scene();
    s.sellerVillage.settlement!.stock!.stone = 5;
    s.run(PLACE);
    s.run({ type: CommandType.END_TURN });
    const id = s.order()!.id;
    s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 15 }) });
    s.run({ type: CommandType.END_TURN });
    s.players[0]!.resources.money = 3;
    expect(s.run({ type: CommandType.ACCEPT_PROPOSAL, orderId: id, seller: 1 })).toBe(false);
    expect(s.players[0]!.resources.money).toBe(3);
    expect(readStock(s.buyerVillage).stone).toBe(0);
    expect(s.order()!.proposals).toHaveLength(1);
  });

  it('an order stays open across rounds until cancelled, which releases the escrow', () => {
    const s = scene();
    s.sellerVillage.settlement!.stock!.stone = 5;
    s.run(PLACE);
    const id = s.order()!.id;
    // Nothing to accept yet.
    expect(s.run({ type: CommandType.ACCEPT_PROPOSAL, orderId: id, seller: 1 })).toBe(false);
    s.run({ type: CommandType.END_TURN });
    s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 15 }) });
    // Buyer ignores the proposal for a couple of rounds.
    for (let i = 0; i < 5; i++) s.run({ type: CommandType.END_TURN }); // ends on the buyer's turn
    expect(s.order()!.proposals).toHaveLength(1);
    expect(readStock(s.sellerVillage).stone).toBe(0);
    s.sim.drainEvents();
    expect(s.run({ type: CommandType.CANCEL_ORDER, orderId: id })).toBe(true);
    expect(s.order()).toBeUndefined();
    expect(readStock(s.sellerVillage).stone).toBe(5);
    expect(s.sim.drainEvents().some((e) => e.type === GameEventType.ORDER_CLOSED && e.reason === TradeCloseReason.CANCELED)).toBe(true);
  });

  it('the seller can propose in a later round and the buyer accepts then', () => {
    const s = scene();
    s.sellerVillage.settlement!.stock!.stone = 5;
    s.run(PLACE);
    const id = s.order()!.id;
    for (let i = 0; i < 2; i++) s.run({ type: CommandType.END_TURN });
    s.run({ type: CommandType.END_TURN });
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 15 }) })).toBe(true);
    s.run({ type: CommandType.END_TURN });
    expect(s.run({ type: CommandType.ACCEPT_PROPOSAL, orderId: id, seller: 1 })).toBe(true);
  });

  it('declining releases the escrow; cancelling keeps the fee', () => {
    const s = scene();
    s.sellerVillage.settlement!.stock!.stone = 5;
    s.run(PLACE);
    s.run({ type: CommandType.END_TURN });
    const id = s.order()!.id;
    s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 15 }) });
    s.run({ type: CommandType.END_TURN });
    expect(s.run({ type: CommandType.DECLINE_PROPOSAL, orderId: id, seller: 1 })).toBe(true);
    expect(readStock(s.sellerVillage).stone).toBe(5);
    expect(s.run({ type: CommandType.CANCEL_ORDER, orderId: id })).toBe(true);
    expect(s.players[0]!.resources.money).toBe(20 - 5 + 5); // fee kept, round income paid
  });

  it('survives a snapshot round trip', () => {
    const s = scene();
    s.run(PLACE);
    const copy = Simulator.fromSnapshot(s.sim.snapshot());
    expect(copy.snapshot().trades).toEqual(s.sim.snapshot().trades);
  });

  it('limits one pair to two trades per round', () => {
    const s = scene();
    s.sellerVillage.settlement!.stock!.stone = 5;
    s.run(PLACE);
    s.run({ type: CommandType.END_TURN });
    const id = s.order()!.id;
    s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 15 }) });
    s.run({ type: CommandType.END_TURN });
    const snap = s.sim.snapshot();
    snap.trades!.settled = [{ a: 0, b: 1, turn: snap.turn }, { a: 1, b: 0, turn: snap.turn }];
    const sim = Simulator.fromSnapshot(snap);
    expect(sim.applyCommand({ type: CommandType.ACCEPT_PROPOSAL, orderId: id, seller: 1 })).toBe(false);
  });

  it('emits PROPOSAL_MADE with the order details and PROPOSAL_DECLINED when the buyer declines', () => {
    const s = scene();
    s.sellerVillage.settlement!.stock!.stone = 5;
    s.run(PLACE);
    s.run({ type: CommandType.END_TURN });
    const id = s.order()!.id;
    s.sim.drainEvents();
    s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 15 }) });
    expect(s.sim.drainEvents()).toContainEqual(expect.objectContaining({
      type: GameEventType.PROPOSAL_MADE, buyer: 0, seller: 1, resource: ResourceKind.STONE, quantity: 5,
    }));
    s.run({ type: CommandType.END_TURN });
    s.sim.drainEvents();
    s.run({ type: CommandType.DECLINE_PROPOSAL, orderId: id, seller: 1 });
    expect(s.sim.drainEvents()).toContainEqual(expect.objectContaining({
      type: GameEventType.PROPOSAL_DECLINED, buyer: 0, seller: 1, resource: ResourceKind.STONE, quantity: 5,
    }));
  });
});

describe('delivery village', () => {
  it('delivers to the chosen village and rejects one that is not the buyer\'s', () => {
    const s = scene();
    const second = tileAt(s.map, 0, 2)!;
    second.settlement = { owner: 0, level: 1, captureReady: false, stock: { wood: 0, stone: 0, ore: 0, food: 0 } };
    second.ownedBy = 0;
    s.sellerVillage.settlement!.stock!.stone = 5;
    expect(s.run({ ...PLACE, deliverTo: { q: 3, r: 0 } })).toBe(false);
    expect(s.run({ ...PLACE, deliverTo: { q: 0, r: 2 } })).toBe(true);
    s.run({ type: CommandType.END_TURN });
    s.run({ type: CommandType.PROPOSE, orderId: s.order()!.id, payment: pay({ money: 12 }) });
    s.run({ type: CommandType.END_TURN });
    s.players[0]!.resources.money = 12;
    expect(s.run({ type: CommandType.ACCEPT_PROPOSAL, orderId: s.order()!.id, seller: 1 })).toBe(true);
    expect(readStock(second).stone).toBe(5);
    expect(readStock(s.buyerVillage).stone).toBe(0);
  });
});

describe('seller village', () => {
  it('takes the goods from the chosen village, refunds there and receives the payment there', () => {
    const s = scene();
    const other = tileAt(s.map, 3, 2)!;
    other.settlement = { owner: 1, level: 1, captureReady: false, stock: { wood: 0, stone: 5, ore: 0, food: 0 } };
    other.ownedBy = 1;
    expect(s.run(PLACE)).toBe(true);
    const id = s.order()!.id;
    s.run({ type: CommandType.END_TURN });
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 12, ore: 1 }), village: { q: 0, r: 0 } })).toBe(false);
    expect(s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 12, ore: 1 }), village: { q: 3, r: 2 } })).toBe(true);
    expect(readStock(other).stone).toBe(0);
    s.run({ type: CommandType.END_TURN });
    s.players[0]!.resources.money = 12;
    s.buyerVillage.settlement!.stock!.ore = 1;
    expect(s.run({ type: CommandType.ACCEPT_PROPOSAL, orderId: id, seller: 1 })).toBe(true);
    expect(readStock(other).ore).toBe(1);
    expect(readStock(s.sellerVillage).ore).toBe(0);
  });

  it('a withdrawn proposal returns the goods to its village', () => {
    const s = scene();
    const other = tileAt(s.map, 3, 2)!;
    other.settlement = { owner: 1, level: 1, captureReady: false, stock: { wood: 0, stone: 5, ore: 0, food: 0 } };
    other.ownedBy = 1;
    s.run(PLACE);
    const id = s.order()!.id;
    s.run({ type: CommandType.END_TURN });
    s.run({ type: CommandType.PROPOSE, orderId: id, payment: pay({ money: 12 }), village: { q: 3, r: 2 } });
    s.run({ type: CommandType.WITHDRAW_PROPOSAL, orderId: id });
    expect(readStock(other).stone).toBe(5);
    expect(readStock(s.sellerVillage).stone).toBe(0);
  });
});
