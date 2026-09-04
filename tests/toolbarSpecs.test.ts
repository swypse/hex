import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { generateMap, type MapTile } from '../src/game/mapGen';
import { buildPlayers } from '../src/game/players';
import { SeededRandom } from '../src/util/random';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { toolbarSpecs } from '../src/ui/hud/toolbarSpecs';
import { TileType } from '../src/game/tileTypes';
import { UNIT_TYPES } from '../src/game/units';
import { storageService } from '../src/storage/storageService';
import { setAttackConfirmation } from '../src/storage/settings';

describe('toolbarSpecs', () => {
  let map: ReturnType<typeof generateMap>;

  beforeEach(() => {
    map = generateMap(2, 42);
    const players = buildPlayers(0, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture');
    sim.startGame();
    sim.drainEvents();
    (gameController as unknown as { sim: unknown }).sim = sim;
    const store = useGameStore.getState();
    store.setLocalPlayerIndex(0);
    store.setPlayers(players);
    store.setSelection(null);
  });

  function select(tile: MapTile): void {
    useGameStore.getState().setSelection({ kind: 'unit', q: tile.q, r: tile.r });
  }

  it('does not offer the extract forest action on a forest tile', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.terrain = TileType.GrasslandForest;
    tile.ownedBy = 0;
    tile.unit = {
      id: 'u', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.warrior.maxHp, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'extract')).toBe(false);
  });

  it('offers the upgrade-ship action for a level-1 ship unit', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 's', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null, shipLevel: 1,
    };
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'upgrade-ship')).toBe(true);
  });

  it('applies the ship upgrade when only the ship cell (not the unit) is selected', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 's', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null, shipLevel: 1,
    };
    useGameStore.getState().setSelection({ kind: 'terrain', q: tile.q, r: tile.r });
    expect(toolbarSpecs().some((a) => a.key === 'upgrade-ship')).toBe(true);
    const spy = vi
      .spyOn(gameController as unknown as { runCommand: (c: unknown) => Promise<void> }, 'runCommand')
      .mockResolvedValue(undefined);
    gameController.upgradeSelectedShip();
    expect(spy).toHaveBeenCalledWith({ type: 'upgradeShip', unitId: 's' });
    spy.mockRestore();
  });

  it('attacks immediately when the attack confirmation setting is disabled', async () => {
    const store = new Map<string, string>();
    vi.spyOn(storageService, 'getItem').mockImplementation((k) => store.get(k) ?? null);
    vi.spyOn(storageService, 'setItem').mockImplementation((k, v) => {
      store.set(k, v);
    });
    setAttackConfirmation(false);

    const own = map.tiles.find((t) => t.unit === null)!;
    const enemy = map.tiles.find((t) => t !== own && t.unit === null)!;
    own.exploredBy = [0];
    enemy.exploredBy = [0];
    own.unit = {
      id: 'u1', owner: 0, type: 'warrior', q: own.q, r: own.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.warrior.maxHp, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    enemy.unit = {
      id: 'e1', owner: 1, type: 'warrior', q: enemy.q, r: enemy.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.warrior.maxHp, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    useGameStore.getState().setSelection({ kind: 'unit', q: own.q, r: own.r });
    const key = `${enemy.q},${enemy.r}`;
    (gameController as unknown as { app: unknown; attackableKeys: Set<string> }).app = { screen: {} };
    (gameController as unknown as { attackableKeys: Set<string> }).attackableKeys = new Set([key]);

    const spy = vi
      .spyOn(gameController as unknown as { runCommand: (c: unknown) => Promise<void> }, 'runCommand')
      .mockResolvedValue(undefined);
    await gameController.handleMapClick(enemy.q, enemy.r);
    expect(useGameStore.getState().overlay).toBeNull();
    expect(spy).toHaveBeenCalledWith({ type: 'attack', unitId: 'u1', q: enemy.q, r: enemy.r });
    spy.mockRestore();

    // Re-enable: the click now shows the confirmation popup instead of attacking.
    setAttackConfirmation(true);
    useGameStore.getState().setSelection({ kind: 'unit', q: own.q, r: own.r });
    (gameController as unknown as { attackableKeys: Set<string> }).attackableKeys = new Set([key]);
    const spy2 = vi
      .spyOn(gameController as unknown as { runCommand: (c: unknown) => Promise<void> }, 'runCommand')
      .mockResolvedValue(undefined);
    await gameController.handleMapClick(enemy.q, enemy.r);
    expect(useGameStore.getState().overlay).toEqual({ kind: 'confirm', target: { q: enemy.q, r: enemy.r } });
    expect(spy2).not.toHaveBeenCalled();
    spy2.mockRestore();
    useGameStore.getState().setOverlay(null);
  });

  it('offers the build water temple action on an own water tile with the skill', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.terrain = TileType.Water;
    tile.ownedBy = 0;
    tile.settlement = null;
    const store = useGameStore.getState();
    store.setPlayers(store.players.map((p, i) => (i === 0 ? { ...p, skills: ['waterTemples'] } : p)));
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'temple')).toBe(true);
  });

  it('offers the build bridge action on a water gap with the skill', () => {
    const by = (q: number, r: number): MapTile => map.tiles.find((t) => t.q === q && t.r === r)!;
    const tile = by(1, 0);
    by(0, 0).terrain = TileType.GrasslandLand;
    by(2, 0).terrain = TileType.GrasslandLand;
    tile.terrain = TileType.Water;
    tile.settlement = null;
    tile.unit = null;
    tile.ownedBy = null;
    const store = useGameStore.getState();
    store.setPlayers(store.players.map((p, i) => (i === 0 ? { ...p, skills: ['bridges'] } : p)));
    useGameStore.getState().setSelection({ kind: 'terrain', q: 1, r: 0 });
    expect(toolbarSpecs().some((a) => a.key === 'bridge')).toBe(true);
  });

  it('does not offer the build bridge action without the skill', () => {
    const by = (q: number, r: number): MapTile => map.tiles.find((t) => t.q === q && t.r === r)!;
    const tile = by(1, 0);
    by(0, 0).terrain = TileType.GrasslandLand;
    by(2, 0).terrain = TileType.GrasslandLand;
    tile.terrain = TileType.Water;
    tile.settlement = null;
    tile.unit = null;
    tile.ownedBy = null;
    useGameStore.getState().setSelection({ kind: 'terrain', q: 1, r: 0 });
    expect(toolbarSpecs().some((a) => a.key === 'bridge')).toBe(false);
  });
});
