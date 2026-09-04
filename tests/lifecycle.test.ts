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
});
