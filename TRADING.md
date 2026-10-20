# Trading

Phase 1 (simulator, commands, escrow, tests; `src/game/trade.ts`) is implemented, no UI or AI yet. Players post orders for resources, other players answer with priced proposals, and the buyer accepts one or more. Built on what the game already has: resources held in village stock networks (`economy/stock.ts`), sequential player turns, met-tribe knowledge, AI profiles, and the command / event / snapshot model used for multiplayer.

## 1. Mechanics

**Resources.** Tradable: wood, stone, ore, food, money. Goods and payment can both be any mix of these (money is just the usual payment).

**Order.** "I need N of resource R", posted by a *buyer*.
- one resource per order, 1-10 units;
- optional delivery village (default: the buyer's capital); the goods are added to that village's stock;
- optional note "max I would pay" is not needed: the buyer sees all proposals and picks.

**Proposal.** A *seller* answers an order with a payment: any mix of resources and money, e.g. "5 stone for 10 money + 2 ore". A seller may revise their proposal for the same order (it replaces the old one). One proposal per seller per order.

**Acceptance.** Orders are filled in full: a proposal covers the whole order and the buyer accepts exactly one.

**Settlement.** Atomic and instant when the buyer accepts, with both sides checked at that moment:
- the seller can deliver the goods from their pooled stock (payer village first, then network, same rules as `payAt`);
- the buyer can pay the payment from theirs.

Delivery is instant: goods go to the buyer's delivery village, payment to the seller's village nearest to it. If the buyer cannot pay, the accept fails and nothing moves.

**Escrow.** A proposal takes the goods out of the seller's stock (capital network) when it is made. They return to the seller when the proposal is withdrawn, replaced, declined or the order closes, so an accepted proposal never fails on the seller's side.

**Order fee.** Placing an order costs 5 money (3 for Villagers), not refunded on cancel. **Score:** +10 to both sides per settled trade.

**Closing.** An order has no time limit: it stays open until the buyer accepts a proposal (it is then filled) or cancels it, or becomes invalid (the buyer is eliminated or loses the delivery village). Open proposals on a closed order are discarded and their goods returned to the sellers.

## 2. When can a player place orders?

- On their **own turn**, as a free action (no unit, no resources).
- At most **three open orders** per player, so the market stays readable; the same two players settle at most two trades per round.
- Not while eliminated or while the game is over.
- An order is visible only to players the buyer has **met** (the existing met-tribe / known-tribes rule). In a 2-player game that is simply the opponent once met.

## 3. When can others propose?

At any time while the order is open, on the seller's **own turn**, once per order (a new proposal replaces the old one; it can also be withdrawn). Players who have not met the buyer cannot see the order. AI sellers propose at the start of their turn, human sellers whenever they open the Trade screen on their turn.

## 4. Who accepts, and when?

- **Only the buyer**, on their **own turn**, at any time after proposals arrive. Accepting costs no movement or unit actions.
- They accept one proposal (the order is filled and closes), decline others, or leave the order open for more.
- If the buyer is AI, it decides at its turn start (see 5). An AI cancels an order that got no acceptable proposal for 3 turns.

## 5. How should the AI choose?

The AI needs a **value table** to compare payments, plus its own scarcity and profile.

**Value table** (money-equivalents, tunable): money 1, food 1, wood 2, stone 3, ore 5. Value of a bundle is the sum over its resources.

**AI as buyer (placing orders)**
- Orders a resource when a planned action is blocked by it and it cannot get it cheaply otherwise: stone for mines (the existing stone focus), ore for knights or walls, wood for roads or upgrades.
- Order size = the shortfall (capped at 10).

**AI as buyer (accepting)**
- Drop proposals it cannot pay or that break the price floor (see 7).
- Score each proposal by *pain-weighted cost*: each paid resource is weighted by how scarce it is for the AI (spare resources cost little, resources it needs for its plan cost a lot). Pick the lowest-cost proposal that covers the need, then top up from the next best if the order is not full.
- Refuse proposals above 1.5× fair value.
- Never pay a player that is far ahead in score and bordering it, unless the deal is clearly cheap (avoid feeding the leader).

**AI as seller (proposing)**
- Only sells what is **spare**: stock above what its current plans need plus a reserve (reuse the money-reserve / stone-focus logic).
- Asks `fair value × margin`, margin by profile: aggressive 1.3, raider 1.25, balanced 1.15, builder 1.0 (more generous).
- Asks for what it **lacks**: prefers payment in the resource it is short of (ore, stone), otherwise money.
- Does not propose to a player it is at war with on the border, or that leads the game by a clear margin.
- At most one proposal per order, and at most two open proposals in total.

AI behaviour is deterministic given the seeded RNG, so replays and multiplayer stay in sync.

## 6. What it looks like in the UI

A **Trade** button in the HUD (a badge with the number of waiting proposals, else of orders you can answer) opens a Trade overlay. Closed on the skill-tree / stats pattern; center messages are held while it is open.

```
┌ Trade ───────────────────────────────────────────┐
│ [ My order ]  [ Market ]  [ Proposals (2) ]       │
├───────────────────────────────────────────────────┤
│ MY ORDER                                          │
│  I need  (stone ▾)  [-] 5 [+]    deliver: Capital │
│  Fair price: ~15 money        [ Post order ]      │
├───────────────────────────────────────────────────┤
│ MARKET   (orders of players you met)              │
│  Aqua    needs 4 wood       [ Propose… ]          │
│  Cats    needs 8 ore        proposed: 30 money    │
├───────────────────────────────────────────────────┤
│ PROPOSALS for "5 stone"                           │
│  Sand   gives 5 stone  for  12 money + 2 ore      │
│         [ Accept ]  [ Decline ]                   │
│  Cats   gives 3 stone  for  9 money   (partial)   │
│         [ Accept ] [ Decline ]   not enough money │
└───────────────────────────────────────────────────┘
```

- **Propose…** opens a small form: payment steppers per resource, a live "fair value / minimum" readout, and the Send button disabled (with the reason) while the price is under the floor or the goods are not available.
- **Accept** is disabled with a reason when the buyer cannot pay.
- A center message at turn start: "Trade: 2 proposals for your order" (collapsed into one message).
- Orders and proposals show tribe icon + name; resource amounts use the existing resource icons.
- In the map context menu, a village row "Order here" could pre-fill the delivery village (later).

## 7. Minimum prices

Trading is meant to be a convenience, not a loophole, so a deal is rejected by the rules when the payment is far below the value of the goods. Rule:

> `value(payment) >= 0.7 × value(goods)` for a proposal to be sendable and for an accept to settle.

- "50 wood for 1 money" is impossible: 50 wood = 100, so the minimum is 70. (It is also impossible by the size cap: an order is at most 10 units.)
- "5 stone for 10 money + 2 ore" = payment 20 vs goods 15, fine.
- The floor is shown in the proposal form and enforced in the simulator (not only in the UI), so a hacked client cannot bypass it.
- Optional ceiling for sanity (reject proposals above 3× value) so a buyer cannot be tricked by a mis-click; the confirm dialog shows both numbers.

Other abuse limits:
- order size ≤ 10 units, 3 open orders per player;
- no trading with eliminated players;
- the same two players may trade at most twice per round (limits resource funnelling between allies).

## 8. Technical sketch

- **State:** `Simulator.trades`: `{ orders: Order[] }`, each with `id, buyer, resource, quantity, deliverTo, placedTurn, proposals: Proposal[]`, saved in snapshots.
- **Commands:** `PLACE_ORDER`, `CANCEL_ORDER`, `PROPOSE` (order id, goods quantity, payment), `WITHDRAW_PROPOSAL`, `ACCEPT_PROPOSAL`, `DECLINE_PROPOSAL`. Validation (turn ownership, met tribes, floor, affordability) lives in the simulator.
- **Events:** `ORDER_PLACED`, `PROPOSAL_MADE`, `TRADE_SETTLED`, `ORDER_CLOSED` for notifications, sound and the log.
- **AI:** `ai-trade.ts` with `placeOrders`, `proposeOn`, `chooseProposals`, called at the start of the AI turn (before the pattern loop).
- **Multiplayer:** commands go through the existing host-authoritative path; orders are only sent to clients who have met the buyer.
- **Tests:** floor enforcement, atomic settlement and failure cases, window timing in 2-4 player turn orders, AI proposal and acceptance decisions, snapshot round trip.

## 9. Decisions and open questions

Decided: instant delivery; +10 score for both sides per trade; escrow; full orders only; order fee 5 money (Villagers 3).

Open:
- Do tribes get trade differences (e.g. Aqua cheaper port trades) later?

## 10. Suggested phases

1. Orders, proposals, accept/decline, floor, simulator + tests (no UI).
2. Trade overlay and notifications.
3. AI as seller, then AI as buyer, then benchmark that it does not hurt AI strength.
4. Tuning (value table, margins), then optional escrow, delivery links and score.
