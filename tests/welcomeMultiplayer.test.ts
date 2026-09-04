import { describe, it, expect, beforeEach } from 'vitest';
import { generateMap } from '../src/game/mapGen';
import { buildMultiplayerPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { SeededRandom } from '../src/util/random';
import { initialExplorationFor } from '../src/game/explore';
import { Tribe } from '../src/game/tribes';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import type { HostMessage } from '../src/net/peerSession';

function buildSim(): Simulator {
  const players = buildMultiplayerPlayers(
    [
      { name: 'Host', tribe: Tribe.Cats },
      { name: 'Guest', tribe: Tribe.Warriors },
    ],
    1,
    new SeededRandom(11),
  );
  const map = generateMap(players.length, 42);
  for (const p of players) initialExplorationFor(map, p.index);
  return new Simulator(map, players, 'turns30', { rng: () => 0.5 });
}

const controller = gameController as unknown as { onHostMessage(msg: HostMessage): void };

describe('client welcome dialog', () => {
  beforeEach(() => {
    useGameStore.setState({
      screen: 'lobby',
      overlay: null,
      pendingSnapshot: null,
      localPlayerIndex: -1,
    });
  });

  it('opens the welcome dialog when the client first enters the game', () => {
    const sim = buildSim();
    sim.startGame();
    sim.drainEvents();
    controller.onHostMessage({ type: 'state', state: sim.snapshot(), playerIndex: 1 });
    expect(useGameStore.getState().screen).toBe('game');
    expect(useGameStore.getState().overlay).toEqual({ kind: 'welcome' });
  });

  it('does not reopen the welcome dialog on later state syncs after it was dismissed', () => {
    const sim = buildSim();
    sim.startGame();
    sim.drainEvents();
    controller.onHostMessage({ type: 'state', state: sim.snapshot(), playerIndex: 1 });
    useGameStore.getState().setOverlay(null);
    controller.onHostMessage({ type: 'state', state: sim.snapshot(), playerIndex: 1 });
    expect(useGameStore.getState().overlay).toBeNull();
  });
});
