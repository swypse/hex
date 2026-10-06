import { beforeEach, describe, expect, it } from 'vitest';
import { gameController } from '../src/controller/game-controller';
import { NetworkController } from '../src/controller/network-controller';
import { totalStock } from '../src/game/economy/stock';
import { TRIBES } from '../src/game/tribes';
import { useGameStore } from '../src/store/game-store';
import { CommandType, GameMode, NetMode, Screen, SelectionKind } from '@enums';

describe('GameController lifecycle', () => {
  beforeEach(() => {
    useGameStore.setState({
      screen: Screen.START,
      players: [],
      turn: 1,
      currentPlayerIndex: 0,
      aiActive: false,
      selection: null,
      overlay: null,
    });
  });

  it('startGame creates a simulator', () => {
    gameController.startGame(TRIBES[0]!.id, 1, GameMode.CAPTURE);
    expect(gameController.getSim()).not.toBeNull();
  });

  it('shutdown preserves the simulator so init can re-render after a remount', () => {
    gameController.startGame(TRIBES[0]!.id, 1, GameMode.CAPTURE);
    const sim = gameController.getSim();
    expect(sim).not.toBeNull();

    gameController.shutdown();
    expect(gameController.getSim()).toBe(sim);
  });

  it('hostGame with tribe 0 (Villagers) still starts the game', () => {
    gameController.hostGame({ mode: GameMode.TURNS30, totalPlayers: 3, aiCount: 1, name: 'Host', tribe: 0 });
    const g = gameController as unknown as { getNetwork: () => NetworkController };
    g.getNetwork().hostPlayers.push({
      peerId: 'fake',
      name: 'Guest',
      tribeId: 2,
      playerIndex: 1,
      ready: true,
      online: true
    });
    gameController.startHostGame();
    expect(gameController.getSim()).not.toBeNull();
  });

  it('cheatResources grants +1000 of every resource in single-player', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, GameMode.CAPTURE);
    const sim = gameController.getSim()!;
    const before = { money: sim.players[0]!.resources.money, ...totalStock(sim.map, 0) };
    const villages = sim.map.tiles.filter((t) => t.settlement?.owner === 0).length;
    expect(gameController.cheats.cheatResources()).toBe(true);
    const after = { money: sim.players[0]!.resources.money, ...totalStock(sim.map, 0) };
    expect(after.money).toBe(before.money + 1000);
    // every own village gets the materials
    expect(after.wood).toBe(before.wood + 1000 * villages);
    expect(after.stone).toBe(before.stone + 1000 * villages);
    expect(after.ore).toBe(before.ore + 1000 * villages);
  });

  it('cheatResources is refused outside single-player', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, GameMode.CAPTURE);
    const sim = gameController.getSim()!;
    const before = { ...sim.players[0]!.resources };
    useGameStore.setState({ netMode: NetMode.HOST });
    expect(gameController.cheats.cheatResources()).toBe(false);
    expect(sim.players[0]!.resources).toEqual(before);
  });

  it('cheatWin eliminates enemies and the next end turn resolves the win', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, GameMode.CAPTURE);
    const sim = gameController.getSim()!;
    expect(sim.gameOver).toBe(false);
    expect(gameController.cheats.cheatWin()).toBe(true);
    expect(sim.players[1]!.isActive).toBe(false);
    // The game is not over until the local player ends their turn.
    expect(sim.gameOver).toBe(false);
    sim.applyCommand({ type: CommandType.END_TURN });
    expect(sim.gameOver).toBe(true);
    expect(sim.winnerIndex).toBe(0);
  });

  it('does not clear the selected cell when ending the turn', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, GameMode.CAPTURE);
    const store = useGameStore.getState();
    const selection: import('../src/game/units/selection').Selection = { kind: SelectionKind.TILE, q: 2, r: 1 };
    store.setSelection(selection);
    gameController.endTurn();
    // The AI turn runs asynchronously; the important regression is that
    // pressing End Turn must not drop the selection synchronously.
    expect(useGameStore.getState().selection).toEqual(selection);
  });
});
