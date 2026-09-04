import { describe, it, expect, beforeEach } from 'vitest';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { TRIBES } from '../src/game/tribes';
import { NetworkController } from '../src/controller/networkController';

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

  it('cheatResources grants +100 of every resource in single-player', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, 'capture');
    const sim = gameController.getSim()!;
    const before = { ...sim.players[0]!.resources };
    expect(gameController.cheatResources()).toBe(true);
    const after = sim.players[0]!.resources;
    expect(after.money).toBe(before.money + 100);
    expect(after.wood).toBe(before.wood + 100);
    expect(after.stone).toBe(before.stone + 100);
    expect(after.ore).toBe(before.ore + 100);
  });

  it('cheatResources is refused outside single-player', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, 'capture');
    const sim = gameController.getSim()!;
    const before = { ...sim.players[0]!.resources };
    useGameStore.setState({ netMode: 'host' });
    expect(gameController.cheatResources()).toBe(false);
    expect(sim.players[0]!.resources).toEqual(before);
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
