import { describe, it, expect, beforeEach } from 'vitest';
import { gameController } from '../src/controller/game-controller';
import { useGameStore } from '../src/store/game-store';
import { TRIBES } from '../src/game/tribes';
import { NetworkController } from '../src/controller/network-controller';

describe('GameController lifecycle', () => {
  beforeEach(() => {
    useGameStore.setState({
      screen: 'start',
      players: [],
      turn: 1,
      currentPlayerIndex: 0,
      aiActive: false,
      selection: null,
      overlay: null,
    });
  });

  it('startGame creates a simulator', () => {
    gameController.startGame(TRIBES[0]!.id, 1, 'capture');
    expect(gameController.getSim()).not.toBeNull();
  });

  it('shutdown preserves the simulator so init can re-render after a remount', () => {
    gameController.startGame(TRIBES[0]!.id, 1, 'capture');
    const sim = gameController.getSim();
    expect(sim).not.toBeNull();

    gameController.shutdown();
    expect(gameController.getSim()).toBe(sim);
  });

  it('hostGame with tribe 0 (Villagers) still starts the game', () => {
    gameController.hostGame({ mode: 'turns30', totalPlayers: 3, aiCount: 1, name: 'Host', tribe: 0 });
    const g = gameController as unknown as { getNetwork: () => NetworkController };
    g.getNetwork().hostPlayers.push({ peerId: 'fake', name: 'Guest', tribeId: 2, playerIndex: 1, ready: true, online: true });
    gameController.startHostGame();
    expect(gameController.getSim()).not.toBeNull();
  });

  it('cheatResources grants +1000 of every resource in single-player', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, 'capture');
    const sim = gameController.getSim()!;
    const before = { ...sim.players[0]!.resources };
    expect(gameController.cheatResources()).toBe(true);
    const after = sim.players[0]!.resources;
    expect(after.money).toBe(before.money + 1000);
    expect(after.wood).toBe(before.wood + 1000);
    expect(after.stone).toBe(before.stone + 1000);
    expect(after.ore).toBe(before.ore + 1000);
  });

  it('cheatResources is refused outside single-player', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, 'capture');
    const sim = gameController.getSim()!;
    const before = { ...sim.players[0]!.resources };
    useGameStore.setState({ netMode: 'host' });
    expect(gameController.cheatResources()).toBe(false);
    expect(sim.players[0]!.resources).toEqual(before);
  });

  it('cheatWin eliminates enemies and the next end turn resolves the win', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, 'capture');
    const sim = gameController.getSim()!;
    expect(sim.gameOver).toBe(false);
    expect(gameController.cheatWin()).toBe(true);
    expect(sim.players[1]!.isActive).toBe(false);
    // The game is not over until the local player ends their turn.
    expect(sim.gameOver).toBe(false);
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.gameOver).toBe(true);
    expect(sim.winnerIndex).toBe(0);
  });

  it('does not clear the selected cell when ending the turn', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, 'capture');
    const store = useGameStore.getState();
    const selection: import('../src/game/selection').Selection = { kind: 'terrain', q: 2, r: 1 };
    store.setSelection(selection);
    gameController.endTurn();
    // The AI turn runs asynchronously; the important regression is that
    // pressing End Turn must not drop the selection synchronously.
    expect(useGameStore.getState().selection).toEqual(selection);
  });
});
