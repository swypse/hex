import { describe, it, expect } from 'vitest';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { Tribe } from '../src/game/tribes';

describe('scratch host start 2h+4ai', () => {
  it('starts a 6-player host game with one joined guest', async () => {
    useGameStore.setState({
      screen: 'start',
      players: [],
      turn: 1,
      currentPlayerIndex: 0,
      aiActive: false,
      selection: null,
      overlay: null,
    });
    gameController.hostGame({ mode: 'capture', totalPlayers: 6, aiCount: 4, name: 'Player', tribe: Tribe.Cats });
    const g = gameController as unknown as { getNetwork: () => import('../src/controller/networkController').NetworkController };
    g.getNetwork().hostPlayers.push({ peerId: 'guest-x', name: 'Player2', tribeId: Tribe.Warriors, playerIndex: null, ready: true, online: true });
    try {
      await g.getNetwork().startHostGame();
      expect(gameController.getSim()?.players.length).toBe(6);
      console.log('HOST START OK');
    } catch (err) {
      console.error('HOST START THREW', (err as Error)?.stack ?? err);
      throw err;
    }
  });
});
