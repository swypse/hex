import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { gameController } from '../src/controller/game-controller';
import { useGameStore } from '../src/store/game-store';
import { axialKey } from '../src/game/hex';
import type { MapTile } from '../src/game/map-gen';

describe('catapult move-or-attack dialog', () => {
  let map: ReturnType<typeof makeTestMap>;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  beforeEach(() => {
    map = makeTestMap(2);
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    const store = useGameStore.getState();
    store.setLocalPlayerIndex(0);
    store.setPlayers(players);
    store.setSelection(null);
    store.setOverlay(null);
  });

  afterEach(() => {
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  function catapultWithAdjacentBuilding(): { catapultTile: MapTile; target: MapTile } {
    const catapult = makeUnit('c', 0, 'catapult', 0, 0);
    const catapultTile = tileAt(map, 0, 0)!;
    catapultTile.unit = catapult;
    catapultTile.ownedBy = 0;
    const target = tileAt(map, 1, 0)!;
    target.ownedBy = 1;
    target.building = { kind: 'sawmill', level: 1 };
    const store = useGameStore.getState();
    store.setSelection({ kind: 'unit', q: 0, r: 0 });
    (gameController as unknown as { app: unknown }).app = { screen: {} };
    (gameController as unknown as { reachableKeys: Set<string> }).reachableKeys = new Set([axialKey(target)]);
    (gameController as unknown as { attackableKeys: Set<string> }).attackableKeys = new Set([axialKey(target)]);
    return { catapultTile, target };
  }

  it('opens the move-or-attack dialog when a catapult target is both attackable and reachable', async () => {
    const { target } = catapultWithAdjacentBuilding();
    const spy = vi
      .spyOn(gameController as unknown as { runCommand: (c: unknown) => Promise<void> }, 'runCommand')
      .mockResolvedValue(undefined);
    await gameController.handleMapClick(target.q, target.r);
    expect(useGameStore.getState().overlay).toEqual({ kind: 'moveAttack', target: { q: target.q, r: target.r } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('moves onto the tile when the player picks Move', async () => {
    const { target } = catapultWithAdjacentBuilding();
    useGameStore.getState().setOverlay({ kind: 'moveAttack', target: { q: target.q, r: target.r } });
    const spy = vi
      .spyOn(gameController as unknown as { runCommand: (c: unknown) => Promise<void> }, 'runCommand')
      .mockResolvedValue(undefined);
    gameController.chooseMoveFromDialog();
    expect(spy).toHaveBeenCalledWith({ type: 'move', unitId: 'c', q: target.q, r: target.r });
    const store = useGameStore.getState();
    expect(store.overlay).toBeNull();
    expect(store.selection).toEqual({ kind: 'unit', q: target.q, r: target.r });
    spy.mockRestore();
  });

  it('attacks the building when the player picks Attack', async () => {
    const { target } = catapultWithAdjacentBuilding();
    useGameStore.getState().setOverlay({ kind: 'moveAttack', target: { q: target.q, r: target.r } });
    const spy = vi
      .spyOn(gameController as unknown as { runCommand: (c: unknown) => Promise<void> }, 'runCommand')
      .mockResolvedValue(undefined);
    gameController.chooseAttackFromDialog();
    expect(spy).toHaveBeenCalledWith({ type: 'attack', unitId: 'c', q: target.q, r: target.r });
    expect(useGameStore.getState().overlay).toBeNull();
    spy.mockRestore();
  });

  it('cancels the dialog without acting', async () => {
    const { target } = catapultWithAdjacentBuilding();
    useGameStore.getState().setOverlay({ kind: 'moveAttack', target: { q: target.q, r: target.r } });
    const spy = vi
      .spyOn(gameController as unknown as { runCommand: (c: unknown) => Promise<void> }, 'runCommand')
      .mockResolvedValue(undefined);
    gameController.cancelMoveAttack();
    expect(useGameStore.getState().overlay).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('attacks immediately when the target is attackable but not reachable', async () => {
    const { catapultTile } = catapultWithAdjacentBuilding();
    (gameController as unknown as { reachableKeys: Set<string> }).reachableKeys = new Set();
    const target = tileAt(map, 1, 0)!;
    const spy = vi
      .spyOn(gameController as unknown as { runCommand: (c: unknown) => Promise<void> }, 'runCommand')
      .mockResolvedValue(undefined);
    await gameController.handleMapClick(target.q, target.r);
    expect(spy).toHaveBeenCalledWith({ type: 'attack', unitId: catapultTile.unit!.id, q: target.q, r: target.r });
    expect(useGameStore.getState().overlay).toBeNull();
    spy.mockRestore();
  });
});