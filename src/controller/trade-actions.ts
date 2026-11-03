import { CommandType, OverlayKind, type ResourceKind } from '@enums';
import { canAffordAt } from '../game/economy/stock';
import type { Resources } from '../game/economy/resources';
import { tileAt } from '../game/map/tile-index';
import type { Order, Proposal } from '../game/trade';
import { useGameStore } from '../store/game-store';
import type { UnitActionsHost } from './unit-actions';

/** Trade dialog commands: each one is validated by the simulator. */
export class TradeActions {
  /** Proposals the player has already been shown (`orderId:seller:turn`), so each one pops up once. */
  private readonly shown = new Set<string>();
  private lastTurn = 0;

  constructor(private readonly host: UnitActionsHost) {}

  placeOrder(resource: ResourceKind, quantity: number, deliverTo?: { q: number; r: number }): void {
    this.host.sendCommand({ type: CommandType.PLACE_ORDER, resource, quantity, deliverTo });
  }

  cancelOrder(orderId: number): void {
    this.host.sendCommand({ type: CommandType.CANCEL_ORDER, orderId });
  }

  propose(orderId: number, payment: Resources, village?: { q: number; r: number }): void {
    this.host.sendCommand({ type: CommandType.PROPOSE, orderId, payment, village });
  }

  withdraw(orderId: number): void {
    this.host.sendCommand({ type: CommandType.WITHDRAW_PROPOSAL, orderId });
  }

  accept(orderId: number, seller: number): void {
    this.host.sendCommand({ type: CommandType.ACCEPT_PROPOSAL, orderId, seller });
  }

  decline(orderId: number, seller: number): void {
    this.host.sendCommand({ type: CommandType.DECLINE_PROPOSAL, orderId, seller });
  }

  /** Whether the buyer can pay the proposal from the order's delivery village (the simulator re-checks on accept). */
  canAccept(order: Order, proposal: Proposal): boolean {
    const sim = this.host.sim;
    const buyer = sim?.players[order.buyer];
    const delivery = sim ? tileAt(sim.map, order.deliverTo.q, order.deliverTo.r) : undefined;
    return !!sim && !!buyer && !!delivery && canAffordAt(sim.map, buyer, delivery, proposal.payment);
  }

  /** On the local player's turn, opens the proposal popup when a proposal on their orders has not been shown yet. */
  promptNextProposal(): void {
    const store = useGameStore.getState();
    const sim = this.host.sim;
    if (!sim || sim.gameOver || store.overlay !== null || store.aiActive || store.tutorial) return;
    if (sim.currentPlayerIndex !== store.localPlayerIndex) return;
    if (sim.turn < this.lastTurn) this.shown.clear();
    this.lastTurn = sim.turn;
    const pending = sim.trading.ordersOf(store.localPlayerIndex).flatMap((o) => o.proposals.map((p) => `${o.id}:${p.seller}:${p.turn}`));
    if (!pending.some((key) => !this.shown.has(key))) return;
    // The popup lists every proposal waiting for the player, so all of them count as shown.
    for (const key of pending) this.shown.add(key);
    store.setOverlay({ kind: OverlayKind.TRADE_PROPOSAL });
  }
}
