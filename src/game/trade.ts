import { GameEventType, ResourceKind, TradeCloseReason, Tribe } from '@enums';
import { knownTribesFor } from './discovery';
import type { Resources } from './economy/resources';
import { addStock, capitalOf, payAt, payerVillage, type Stock } from './economy/stock';
import { tileAt } from './map/tile-index';
import type { MapTile } from './map/map-gen';
import type { Player } from './players';
import { TRADE_SCORE } from './score';
import type { SimContext } from './sim-context';

export const MAX_ORDER_QUANTITY = 10;
/** Orders one player may have open at once. */
export const MAX_OPEN_ORDERS = 3;
export const ORDER_FEE = 5;
export const VILLAGERS_ORDER_FEE = 3;
/** Settled trades between the same two players in one round. */
export const MAX_PAIR_TRADES_PER_ROUND = 2;
/** A payment must be worth at least this share of the goods... */
export const PRICE_FLOOR = 0.7;
/** ...and at most this multiple of them (a guard against mis-clicks). */
export const PRICE_CEILING = 3;

/** Money-equivalent worth of one unit, used for the price floor/ceiling. */
export const TRADE_VALUE: Record<ResourceKind, number> = {
  [ResourceKind.MONEY]: 1,
  [ResourceKind.FOOD]: 1,
  [ResourceKind.WOOD]: 2,
  [ResourceKind.STONE]: 3,
  [ResourceKind.ORE]: 5,
};

const KINDS = Object.values(ResourceKind);

export interface Proposal {
  seller: number;
  /** The seller's village the goods are taken from (its network) and the payment goes to. */
  village: { q: number; r: number };
  /** Turn the proposal was made (or last revised). */
  turn: number;
  /** What the seller asks for the whole order. The goods are held back from the seller's stock (escrow) until the proposal ends. */
  payment: Resources;
}

export interface Order {
  id: number;
  buyer: number;
  resource: ResourceKind;
  quantity: number;
  deliverTo: { q: number; r: number };
  /** Turn the order was placed. */
  turn: number;
  proposals: Proposal[];
}

export interface TradeState {
  orders: Order[];
  nextId: number;
  /** Settled trades, kept for the current round only (the pair limit). */
  settled: { a: number; b: number; turn: number }[];
}

export function emptyTradeState(): TradeState {
  return { orders: [], nextId: 1, settled: [] };
}

export function orderFee(player: Player): number {
  return player.tribe === Tribe.Villagers ? VILLAGERS_ORDER_FEE : ORDER_FEE;
}

export function paymentValue(payment: Resources): number {
  return KINDS.reduce((sum, k) => sum + payment[k] * TRADE_VALUE[k], 0);
}

export function goodsValue(resource: ResourceKind, quantity: number): number {
  return TRADE_VALUE[resource] * quantity;
}

/** Whether a payment is inside the price floor and ceiling for the goods. */
export function priceInRange(resource: ResourceKind, quantity: number, payment: Resources): boolean {
  const goods = goodsValue(resource, quantity);
  const value = paymentValue(payment);
  return value >= goods * PRICE_FLOOR && value <= goods * PRICE_CEILING;
}

function goodsCost(resource: ResourceKind, quantity: number): Resources {
  return { wood: 0, stone: 0, money: 0, ore: 0, food: 0, [resource]: quantity };
}

function validPayment(payment: Resources, resource: ResourceKind): boolean {
  return KINDS.every((k) => Number.isInteger(payment[k]) && payment[k] >= 0) && payment[resource] === 0;
}

/** Orders (up to `MAX_OPEN_ORDERS` per player), proposals, escrow and settlement. Orders are placed on the buyer's
 *  turn and stay open until the buyer accepts a proposal or cancels. Other players propose on their own turns;
 *  the buyer accepts on theirs. */
export class Trading {
  state: TradeState = emptyTradeState();

  constructor(private readonly ctx: SimContext) {}

  ordersOf(buyer: number): Order[] {
    return this.state.orders.filter((o) => o.buyer === buyer);
  }

  private find(orderId: number): Order | undefined {
    return this.state.orders.find((o) => o.id === orderId);
  }

  /** Whether `player` has met `buyer`, so that they can see the buyer's orders. */
  sees(player: Player, buyer: Player): boolean {
    return knownTribesFor(this.ctx.map, this.ctx.players, player.index).has(buyer.tribe);
  }

  /** Orders `player` may propose on: other players' open orders, from buyers whose tribe the player has met. */
  visibleOrders(player: Player): Order[] {
    const known = knownTribesFor(this.ctx.map, this.ctx.players, player.index);
    return this.state.orders.filter((o) => {
      const buyer = this.ctx.players[o.buyer];
      return o.buyer !== player.index && !!buyer?.isActive && known.has(buyer.tribe);
    });
  }

  placeOrder(resource: ResourceKind, quantity: number, deliverTo?: { q: number; r: number }): boolean {
    const buyer = this.ctx.currentPlayer;
    if (!buyer.isActive || !KINDS.includes(resource)) return false;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_QUANTITY) return false;
    if (this.ordersOf(buyer.index).length >= MAX_OPEN_ORDERS) return false;
    const village = deliverTo ? this.ownVillage(buyer.index, deliverTo) : capitalOf(this.ctx.map, buyer.index);
    if (!village) return false;
    const fee = orderFee(buyer);
    if (buyer.resources.money < fee) return false;
    buyer.resources.money -= fee;
    const order: Order = {
      id: this.state.nextId++,
      buyer: buyer.index,
      resource,
      quantity,
      deliverTo: { q: village.q, r: village.r },
      turn: this.ctx.turn,
      proposals: [],
    };
    this.state.orders.push(order);
    this.ctx.emit({ type: GameEventType.ORDER_PLACED, orderId: order.id, buyer: buyer.index, resource, quantity });
    return true;
  }

  cancelOrder(orderId: number): boolean {
    const order = this.find(orderId);
    if (!order || order.buyer !== this.ctx.currentPlayer.index) return false;
    this.close(order, TradeCloseReason.CANCELED);
    return true;
  }

  /** Offers the whole order for `payment`. Replaces the seller's earlier proposal, if any. */
  propose(orderId: number, payment: Resources, village?: { q: number; r: number }): boolean {
    const seller = this.ctx.currentPlayer;
    const order = this.find(orderId);
    if (!order || !seller.isActive) return false;
    if (!this.visibleOrders(seller).includes(order)) return false;
    if (!validPayment(payment, order.resource) || !priceInRange(order.resource, order.quantity, payment)) return false;
    const home = village ? this.ownVillage(seller.index, village) : capitalOf(this.ctx.map, seller.index);
    if (!home) return false;
    const previous = order.proposals.find((p) => p.seller === seller.index);
    if (previous) this.release(order, previous);
    if (!this.holdGoods(order, seller, home)) {
      if (previous) this.holdGoods(order, seller, this.proposalVillage(previous));
      return false;
    }
    const proposal: Proposal = { seller: seller.index, village: { q: home.q, r: home.r }, turn: this.ctx.turn, payment: { ...payment } };
    order.proposals = order.proposals.filter((p) => p !== previous);
    order.proposals.push(proposal);
    this.ctx.emit({ type: GameEventType.PROPOSAL_MADE, orderId, buyer: order.buyer, seller: seller.index, resource: order.resource, quantity: order.quantity, payment: proposal.payment });
    return true;
  }

  withdrawProposal(orderId: number): boolean {
    const order = this.find(orderId);
    const seller = this.ctx.currentPlayer.index;
    const proposal = order?.proposals.find((p) => p.seller === seller);
    if (!order || !proposal) return false;
    this.release(order, proposal);
    order.proposals = order.proposals.filter((p) => p !== proposal);
    return true;
  }

  declineProposal(orderId: number, seller: number): boolean {
    const order = this.find(orderId);
    const proposal = order?.proposals.find((p) => p.seller === seller);
    if (!order || !proposal || order.buyer !== this.ctx.currentPlayer.index) return false;
    this.release(order, proposal);
    order.proposals = order.proposals.filter((p) => p !== proposal);
    this.ctx.emit({ type: GameEventType.PROPOSAL_DECLINED, orderId, buyer: order.buyer, seller, resource: order.resource, quantity: order.quantity });
    return true;
  }

  /** Settles the order with `seller`'s proposal: the buyer pays, the goods held in escrow are delivered, the other proposals are released. */
  acceptProposal(orderId: number, seller: number): boolean {
    const order = this.find(orderId);
    const proposal = order?.proposals.find((p) => p.seller === seller);
    const buyer = this.ctx.currentPlayer;
    if (!order || !proposal || order.buyer !== buyer.index) return false;
    const seller_ = this.ctx.players[seller];
    const delivery = this.ownVillage(buyer.index, order.deliverTo);
    if (!seller_?.isActive || !delivery || this.pairTrades(buyer.index, seller) >= MAX_PAIR_TRADES_PER_ROUND) return false;
    if (!payAt(this.ctx.map, buyer, delivery, proposal.payment)) return false;
    this.deliver(order, buyer, delivery);
    const receiving = this.proposalVillage(proposal) ?? payerVillage(this.ctx.map, seller, delivery) ?? delivery;
    this.receive(seller_, receiving, proposal.payment);
    order.proposals = order.proposals.filter((p) => p !== proposal);
    this.state.settled = this.state.settled.filter((s) => s.turn === this.ctx.turn);
    this.state.settled.push({ a: buyer.index, b: seller, turn: this.ctx.turn });
    buyer.score += TRADE_SCORE;
    seller_.score += TRADE_SCORE;
    this.ctx.emitScoreFly(buyer.index, TRADE_SCORE, delivery);
    this.ctx.emitScoreFly(seller, TRADE_SCORE, receiving);
    this.ctx.emit({ type: GameEventType.TRADE_SETTLED, orderId, buyer: buyer.index, seller, resource: order.resource, quantity: order.quantity, payment: proposal.payment });
    this.close(order, TradeCloseReason.FILLED);
    return true;
  }

  /** The player's turn begins: orders that can no longer be settled are dropped. Orders otherwise stay open until filled or cancelled. */
  onTurnStart(): void {
    this.dropInvalid();
  }

  /** A player left the game: their order closes and their proposals are withdrawn. */
  onEliminated(playerIndex: number): void {
    for (const order of [...this.state.orders]) {
      if (order.buyer === playerIndex) this.close(order, TradeCloseReason.INVALID);
      else order.proposals = order.proposals.filter((p) => p.seller !== playerIndex);
    }
  }

  private dropInvalid(): void {
    for (const order of [...this.state.orders]) {
      const buyer = this.ctx.players[order.buyer];
      if (!buyer?.isActive || !this.ownVillage(order.buyer, order.deliverTo)) this.close(order, TradeCloseReason.INVALID);
    }
  }

  private ownVillage(owner: number, at: { q: number; r: number }): MapTile | null {
    const tile = tileAt(this.ctx.map, at.q, at.r);
    return tile?.settlement?.owner === owner ? tile : null;
  }

  private pairTrades(a: number, b: number): number {
    return this.state.settled.filter((s) => s.turn === this.ctx.turn && ((s.a === a && s.b === b) || (s.a === b && s.b === a))).length;
  }

  /** Takes the order's goods out of the seller's stock. */
  private holdGoods(order: Order, seller: Player, home: MapTile | null): boolean {
    return !!home && payAt(this.ctx.map, seller, home, goodsCost(order.resource, order.quantity));
  }

  /** The proposal's village while the seller still owns it, else their capital. */
  private proposalVillage(proposal: Proposal): MapTile | null {
    return this.ownVillage(proposal.seller, proposal.village) ?? capitalOf(this.ctx.map, proposal.seller);
  }

  /** Gives a proposal's escrowed goods back to the seller's village (lost when they have no village left). */
  private release(order: Order, proposal: Proposal): void {
    const seller = this.ctx.players[proposal.seller];
    if (!seller) return;
    this.receive(seller, this.proposalVillage(proposal), goodsCost(order.resource, order.quantity));
  }

  private deliver(order: Order, buyer: Player, village: MapTile): void {
    this.receive(buyer, village, goodsCost(order.resource, order.quantity));
  }

  /** Adds money to the player and materials to the village. */
  private receive(player: Player, village: MapTile | null, amount: Resources): void {
    player.resources.money += amount.money;
    if (!village) return;
    const stock: Stock = { wood: amount.wood, stone: amount.stone, ore: amount.ore, food: amount.food };
    addStock(village, stock);
  }

  private close(order: Order, reason: TradeCloseReason): void {
    for (const p of order.proposals) this.release(order, p);
    order.proposals = [];
    this.state.orders = this.state.orders.filter((o) => o !== order);
    this.ctx.emit({ type: GameEventType.ORDER_CLOSED, orderId: order.id, buyer: order.buyer, reason });
  }
}
