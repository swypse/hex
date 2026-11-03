import { ResourceKind, SkillId } from '@enums';
import { canAffordAt, totalStock, type Stock } from '../economy/stock';
import { villageUpgradeCost, type Resources } from '../economy/resources';
import { hexDistance } from '../map/hex';
import type { GameMap, MapTile } from '../map/map-gen';
import type { Player } from '../players';
import { hasSkill } from '../skills';
import {
  goodsValue, MAX_ORDER_QUANTITY, orderFee, type Order, paymentValue, priceInRange, TRADE_VALUE, type Trading,
} from '../trade';
import { UNIT_TYPES } from '../units/units';
import { personalityFor } from './ai-personality';

/** Materials the AI keeps for itself on top of what its plans need. */
const SPARE_RESERVE = 2;
/** The AI refuses to pay more than this multiple of the fair value. */
const MAX_PAY_FACTOR = 1.5;
/** Turns an AI waits for proposals before cancelling its order. */
const STALE_ORDER_TURNS = 3;
/** Turns between two orders of one AI. */
const ORDER_COOLDOWN = 3;
/** Most proposals an AI keeps open at once. */
const MAX_OPEN_PROPOSALS = 2;
const LEAD_FACTOR = 1.25;
const LEAD_POINTS = 60;
const BORDER_DISTANCE = 6;
const TRADED: ResourceKind[] = [ResourceKind.WOOD, ResourceKind.STONE, ResourceKind.ORE];

const stockKey = (k: ResourceKind): keyof Stock => k as keyof Stock;

/** Materials the AI's next plans need: the cheapest village upgrade and, with the skill, swordsmen. */
function needs(map: GameMap, player: Player): Stock {
  const need: Stock = { wood: 0, stone: 0, ore: 0, food: 0 };
  const levels = map.tiles.filter((t) => t.settlement?.owner === player.index).map((t) => t.settlement!.level);
  if (levels.length > 0) {
    const cost = villageUpgradeCost(Math.min(...levels));
    need.wood += cost.wood;
    need.stone += cost.stone;
  }
  if (hasSkill(player, SkillId.SWORDSMAN)) need.ore += UNIT_TYPES.swordsman.priceOre;
  return need;
}

function villagesOf(map: GameMap, owner: number): MapTile[] {
  return map.tiles.filter((t) => t.settlement?.owner === owner);
}

/** Whether `other` is clearly ahead of `me` and borders them: the AI does not feed such a player. */
function isBorderingLeader(map: GameMap, me: Player, other: Player): boolean {
  if (other.score < me.score * LEAD_FACTOR || other.score < me.score + LEAD_POINTS) return false;
  const theirs = villagesOf(map, other.index);
  return villagesOf(map, me.index).some((a) => theirs.some((b) => hexDistance(a, b) <= BORDER_DISTANCE));
}

function shortage(need: Stock, have: Stock, k: ResourceKind): number {
  return Math.max(0, need[stockKey(k)] - have[stockKey(k)]);
}

/** The AI keeps at most one order open. Starts of the AI turn: picks a proposal for its own orders, answers other orders, posts a new order when short of materials. */
export function runAiTrading(trading: Trading, map: GameMap, players: Player[], ai: Player, turn: number): void {
  acceptBest(trading, map, players, ai, turn);
  proposeOnOrders(trading, map, players, ai);
  postOrder(trading, map, players, ai, turn);
}

/** Settles each own order with its best proposal; an order nobody satisfies for a few turns is cancelled so a new one can be posted. */
function acceptBest(trading: Trading, map: GameMap, players: Player[], ai: Player, turn: number): void {
  for (const order of trading.ordersOf(ai.index)) {
    acceptOn(trading, map, players, ai, order);
    if (trading.ordersOf(ai.index).includes(order) && turn - order.turn >= STALE_ORDER_TURNS) trading.cancelOrder(order.id);
  }
}

function acceptOn(trading: Trading, map: GameMap, players: Player[], ai: Player, order: Order): void {
  const delivery = map.tiles.find((t) => t.q === order.deliverTo.q && t.r === order.deliverTo.r);
  if (!delivery) return;
  const need = needs(map, ai);
  const have = totalStock(map, ai.index);
  const fair = goodsValue(order.resource, order.quantity);
  let best: { seller: number; cost: number } | null = null;
  for (const p of order.proposals) {
    const seller = players[p.seller];
    const value = paymentValue(p.payment);
    if (!seller || value > fair * MAX_PAY_FACTOR || !canAffordAt(map, ai, delivery, p.payment)) continue;
    if (value > fair && isBorderingLeader(map, ai, seller)) continue;
    // Resources the AI needs itself hurt twice as much to give away.
    const cost = (Object.keys(TRADE_VALUE) as ResourceKind[]).reduce((sum, k) => {
      const scarce = k !== ResourceKind.MONEY && have[stockKey(k)] - p.payment[k] < need[stockKey(k)];
      return sum + p.payment[k] * TRADE_VALUE[k] * (scarce ? 2 : 1);
    }, 0);
    if (!best || cost < best.cost) best = { seller: p.seller, cost };
  }
  if (best) trading.acceptProposal(order.id, best.seller);
}

function proposeOnOrders(trading: Trading, map: GameMap, players: Player[], ai: Player): void {
  const need = needs(map, ai);
  const have = totalStock(map, ai.index);
  const margin = personalityFor(ai).tradeMargin;
  let open = trading.state.orders.reduce((n, o) => n + o.proposals.filter((p) => p.seller === ai.index).length, 0);
  for (const order of trading.visibleOrders(ai)) {
    if (open >= MAX_OPEN_PROPOSALS) return;
    if (order.proposals.some((p) => p.seller === ai.index) || !TRADED.includes(order.resource)) continue;
    const buyer = players[order.buyer];
    if (!buyer || isBorderingLeader(map, ai, buyer)) continue;
    const spare = have[stockKey(order.resource)] - need[stockKey(order.resource)] - SPARE_RESERVE;
    if (spare < order.quantity) continue;
    const payment = askFor(order, need, have, margin);
    if (priceInRange(order.resource, order.quantity, payment) && trading.propose(order.id, payment)) open++;
  }
}

/** The price: fair value times the margin, in the materials the AI lacks first, the rest in money. */
function askFor(order: Order, need: Stock, have: Stock, margin: number): Resources {
  const payment: Resources = { wood: 0, stone: 0, money: 0, ore: 0, food: 0 };
  let left = Math.ceil(goodsValue(order.resource, order.quantity) * margin);
  for (const k of TRADED.filter((r) => r !== order.resource)) {
    const units = Math.min(shortage(need, have, k), Math.floor(left / TRADE_VALUE[k]));
    payment[k] = units;
    left -= units * TRADE_VALUE[k];
  }
  payment.money = left;
  return payment;
}

function postOrder(trading: Trading, map: GameMap, players: Player[], ai: Player, turn: number): void {
  if (trading.ordersOf(ai.index).length > 0 || turn < (ai.tradeCooldownTurn ?? 0)) return;
  const need = needs(map, ai);
  const have = totalStock(map, ai.index);
  let pick: { resource: ResourceKind; quantity: number } | null = null;
  for (const k of TRADED) {
    const missing = Math.min(shortage(need, have, k), MAX_ORDER_QUANTITY);
    if (missing > 0 && (!pick || missing * TRADE_VALUE[k] > pick.quantity * TRADE_VALUE[pick.resource])) pick = { resource: k, quantity: missing };
  }
  if (!pick) return;
  // Enough money to pay a fair price on top of the fee.
  if (ai.resources.money < orderFee(ai) + goodsValue(pick.resource, pick.quantity)) return;
  if (!players.some((p) => p.index !== ai.index && p.isActive && trading.sees(p, ai))) return;
  ai.tradeCooldownTurn = turn + ORDER_COOLDOWN;
  trading.placeOrder(pick.resource, pick.quantity);
}
