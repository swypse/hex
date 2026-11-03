import { CommandType, GameMode, OverlayKind, ResourceKind } from '@enums';
import { beforeEach, describe, expect, it } from 'vitest';
import { TradeActions } from '../src/controller/trade-actions';
import { buildMultiplayerPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe } from '../src/game/tribes';
import { useGameStore } from '../src/store/game-store';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt } from './helpers/test-map';

function setup() {
  const map = makeTestMap(5);
  [0, 3].forEach((q, i) => {
    const t = tileAt(map, q, 0)!;
    t.settlement = { owner: i, level: 1, captureReady: false, capital: true, stock: { wood: 0, stone: i === 1 ? 10 : 0, ore: 0, food: 0 } };
    t.ownedBy = i;
  });
  const players = buildMultiplayerPlayers([{ name: 'A', tribe: Tribe.Cats }, { name: 'B', tribe: Tribe.Warriors }], 0, new SeededRandom(1));
  players.forEach((p) => { p.resources.money = 30; });
  const sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5 });
  sim.startGame();
  const actions = new TradeActions({ sim, sendCommand: (cmd) => sim.applyCommand(cmd), render: () => undefined });
  return { sim, actions };
}

/** A buyer order with one proposal, back on the buyer's turn. */
function withProposal() {
  const s = setup();
  s.sim.applyCommand({ type: CommandType.PLACE_ORDER, resource: ResourceKind.STONE, quantity: 5 });
  s.sim.applyCommand({ type: CommandType.END_TURN });
  const id = s.sim.trading.ordersOf(0)[0]!.id;
  s.sim.applyCommand({ type: CommandType.PROPOSE, orderId: id, payment: { wood: 0, stone: 0, money: 12, ore: 0, food: 0 } });
  s.sim.applyCommand({ type: CommandType.END_TURN });
  return { ...s, id };
}

describe('trade proposal prompt', () => {
  beforeEach(() => {
    useGameStore.setState({ overlay: null, aiActive: false, tutorial: false, localPlayerIndex: 0 });
  });

  it('opens once for the waiting proposals on the buyer turn', () => {
    const { actions } = withProposal();
    actions.promptNextProposal();
    expect(useGameStore.getState().overlay).toEqual({ kind: OverlayKind.TRADE_PROPOSAL });
    useGameStore.getState().setOverlay(null);
    actions.promptNextProposal();
    expect(useGameStore.getState().overlay).toBeNull();
  });

  it('does not open while an AI is acting or off the buyer turn', () => {
    const { sim, actions } = withProposal();
    useGameStore.setState({ aiActive: true });
    actions.promptNextProposal();
    expect(useGameStore.getState().overlay).toBeNull();
    useGameStore.setState({ aiActive: false, localPlayerIndex: 1 });
    expect(sim.currentPlayerIndex).toBe(0);
    actions.promptNextProposal();
    expect(useGameStore.getState().overlay).toBeNull();
  });

  it('canAccept reflects whether the buyer can pay', () => {
    const { sim, actions } = withProposal();
    const order = sim.trading.ordersOf(0)[0]!;
    expect(actions.canAccept(order, order.proposals[0]!)).toBe(true);
    sim.players[0]!.resources.money = 3;
    expect(actions.canAccept(order, order.proposals[0]!)).toBe(false);
  });
});
