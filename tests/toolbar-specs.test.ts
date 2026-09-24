import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { generateMap, type MapTile } from '../src/game/map-gen';
import { buildPlayers } from '../src/game/players';
import { SeededRandom } from '../src/util/random';
import { gameController } from '../src/controller/game-controller';
import { useGameStore } from '../src/store/game-store';
import { toolbarSpecs } from '../src/ui/hud/toolbar-specs';
import { TileType } from '../src/game/tile-types';
import { hexNeighbors } from '../src/game/hex';
import { UNIT_TYPES } from '../src/game/units';
import { Tribe } from '../src/game/tribes';
import { sfx } from '../src/sound/sfx';

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

  function selectCell(tile: MapTile): void {
    useGameStore.getState().setSelection({ kind: 'terrain', q: tile.q, r: tile.r });
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

  it('offers the get-bottle action when an own ship stands on a collectable bottle', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.terrain = TileType.Water;
    tile.ownedBy = null;
    tile.unit = {
      id: 's', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null, shipLevel: 1,
    };
    tile.bottle = { bornTurn: 1, arrivalTurn: 1 };
    useGameStore.getState().setTurn(2);
    // The bottle is a cell action: shown once the ship is unselected (cell).
    selectCell(tile);
    const spec = toolbarSpecs().find((a) => a.key === 'bottle');
    expect(spec).toBeDefined();
    expect(spec!.disabled).toBe(false);
  });

  it('does not offer the get-bottle action the turn the ship landed', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.terrain = TileType.Water;
    tile.ownedBy = null;
    tile.unit = {
      id: 's', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null, shipLevel: 1,
    };
    tile.bottle = { bornTurn: 1, arrivalTurn: 2 };
    useGameStore.getState().setTurn(2);
    selectCell(tile);
    expect(toolbarSpecs().some((a) => a.key === 'bottle')).toBe(false);
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

  it('offers the disband action for an own unit with its cost', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 'w', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.warrior.maxHp, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    select(tile);
    const spec = toolbarSpecs().find((a) => a.key === 'disband');
    expect(spec).toBeDefined();
    expect(spec!.label).toContain('Disband Warrior');
    expect(spec!.disabled).toBe(false);
  });

  it('does not offer the disband action once the unit has moved', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 'w', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: true, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.warrior.maxHp, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'disband')).toBe(false);
  });

  it('does not offer the disband action once the unit has attacked', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 'w', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: true, hasHealed: false,
      hp: UNIT_TYPES.warrior.maxHp, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'disband')).toBe(false);
  });

  it('offers heal whether the unit or the cell is selected', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 'h', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 10, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'heal')).toBe(true);
    const spy = vi
      .spyOn(gameController as unknown as { runCommand: (c: unknown) => Promise<void> }, 'runCommand')
      .mockResolvedValue(undefined);
    gameController.healSelectedUnit();
    expect(spy).toHaveBeenCalledWith({ type: 'heal', unitId: 'h' });
    spy.mockRestore();
    selectCell(tile);
    expect(toolbarSpecs().some((a) => a.key === 'heal')).toBe(true);
  });

  it('offers no actions while the game is paused for a disconnect', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 'w', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.warrior.maxHp, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    select(tile);
    expect(toolbarSpecs().length).toBeGreaterThan(0);
    useGameStore.getState().setPaused('disconnect', 'Other');
    expect(toolbarSpecs()).toEqual([]);
    useGameStore.getState().setPaused(null);
  });

  it('offers the ship upgrade whether the ship or the cell is selected', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 's', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null, shipLevel: 1,
    };
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'upgrade-ship')).toBe(true);
    const spy = vi
      .spyOn(gameController as unknown as { runCommand: (c: unknown) => Promise<void> }, 'runCommand')
      .mockResolvedValue(undefined);
    gameController.upgradeSelectedShip();
    expect(spy).toHaveBeenCalledWith({ type: 'upgradeShip', unitId: 's' });
    spy.mockRestore();
    selectCell(tile);
    expect(toolbarSpecs().some((a) => a.key === 'upgrade-ship')).toBe(true);
  });

  it('attacks an enemy on click without a confirmation dialog', async () => {
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
  });

  it('offers the build water temple action on an own water tile with the skill', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.terrain = TileType.Water;
    tile.ownedBy = 0;
    tile.settlement = null;
    const store = useGameStore.getState();
    store.setPlayers(store.players.map((p, i) => (i === 0 ? { ...p, skills: ['waterTemples'] } : p)));
    selectCell(tile);
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

  it('plays the click sound when a hex tap selects a tile', async () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.exploredBy = [0];
    (gameController as unknown as { app: unknown }).app = { screen: {} };
    const spy = vi.spyOn(sfx, 'play');
    await gameController.handleMapClick(tile.q, tile.r);
    expect(useGameStore.getState().selection).not.toBeNull();
    expect(spy).toHaveBeenCalledWith('click');
    spy.mockRestore();
  });

  it('offers an enabled deal action for an affordable pirate with no active deal', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.terrain = TileType.Water;
    tile.ownedBy = null;
    tile.unit = {
      id: 'p', owner: -1, type: 'pirate', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 80, attack: 30, attackDistance: 3, defense: 5, spawnVillage: null,
    };
    const store = useGameStore.getState();
    store.setPlayers(store.players.map((p, i) => (i === 0 ? { ...p, resources: { ...p.resources, money: 100 } } : p)));
    select(tile);
    const spec = toolbarSpecs().find((a) => a.key === 'deal');
    expect(spec).toBeDefined();
    expect(spec!.disabled).toBe(false);
    expect(spec!.label).toContain('50');
  });

  it('disables the deal action when the player cannot afford it', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.terrain = TileType.Water;
    tile.ownedBy = null;
    tile.unit = {
      id: 'p', owner: -1, type: 'pirate', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 80, attack: 30, attackDistance: 3, defense: 5, spawnVillage: null,
    };
    select(tile);
    const spec = toolbarSpecs().find((a) => a.key === 'deal');
    expect(spec).toBeDefined();
    expect(spec!.disabled).toBe(true);
  });

  it('disables the deal action once the deal with the pirate is already active', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.terrain = TileType.Water;
    tile.ownedBy = null;
    tile.unit = {
      id: 'p', owner: -1, type: 'pirate', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 80, attack: 30, attackDistance: 3, defense: 5, spawnVillage: null, paidBy: [0],
    };
    const store = useGameStore.getState();
    store.setPlayers(store.players.map((p, i) => (i === 0 ? { ...p, resources: { ...p.resources, money: 100 } } : p)));
    select(tile);
    const spec = toolbarSpecs().find((a) => a.key === 'deal');
    expect(spec).toBeDefined();
    expect(spec!.disabled).toBe(true);
  });

  it('does not offer a deal action for a selected non-pirate unit', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 'w', owner: 0, type: 'warrior', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.warrior.maxHp, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'deal')).toBe(false);
  });

  it('offers repair for a damaged own building but not a full one', () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.terrain = TileType.GrasslandLand;
    tile.ownedBy = 0;
    tile.settlement = null;
    tile.building = { kind: 'mine', level: 1, hp: 1 };
    selectCell(tile);
    expect(toolbarSpecs().some((a) => a.key === 'repair')).toBe(true);

    tile.building = { kind: 'mine', level: 1 };
    selectCell(tile);
    expect(toolbarSpecs().some((a) => a.key === 'repair')).toBe(false);
  });

  it('offers enable stealth only for a visible idle stalker', () => {
    const players = useGameStore.getState().players;
    players[0]!.tribe = Tribe.Cats;
    players[0]!.resources = { wood: 100, stone: 100, money: 100, ore: 100 };
    useGameStore.getState().setPlayers(players);
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 's', owner: 0, type: 'stalker', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.stalker.maxHp, attack: 30, attackDistance: 1, spawnVillage: null,
    };
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'stealth')).toBe(true);
    tile.unit = { ...tile.unit, isStealthed: true };
    expect(toolbarSpecs().some((a) => a.key === 'stealth')).toBe(false);
  });

  it('offers build only for a builder, and thorn-trap only for a trapper', () => {
    const players = useGameStore.getState().players;
    players[0]!.resources = { wood: 100, stone: 100, money: 100, ore: 100 };
    useGameStore.getState().setPlayers(players);
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.terrain = TileType.GrasslandLand;
    // an owned empty land neighbor so the trapper has a trap candidate
    const nb = hexNeighbors(tile).map((n) => map.tiles.find((x) => x.q === n.q && x.r === n.r)).find((t) => t !== undefined)!;
    nb.terrain = TileType.GrasslandLand;
    nb.ownedBy = 0;
    tile.unit = {
      id: 'b', owner: 0, type: 'builder', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.builder.maxHp, attack: 10, attackDistance: 1, spawnVillage: null,
    };
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'build')).toBe(true);
    expect(toolbarSpecs().some((a) => a.key === 'thorn-trap')).toBe(false);

    tile.unit = {
      id: 'tr', owner: 0, type: 'trapper', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.trapper.maxHp, attack: 20, attackDistance: 1, spawnVillage: null,
    };
    expect(toolbarSpecs().some((a) => a.key === 'build')).toBe(false);
    expect(toolbarSpecs().some((a) => a.key === 'thorn-trap')).toBe(true);
  });

  it('does not offer storm when the stormcaller village has no water', () => {
    const players = useGameStore.getState().players;
    players[0]!.tribe = Tribe.Aqua;
    players[0]!.resources = { wood: 100, stone: 100, money: 100, ore: 100 };
    useGameStore.getState().setPlayers(players);
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.ownedBy = 0;
    tile.unit = {
      id: 'st', owner: 0, type: 'stormcaller', q: tile.q, r: tile.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: UNIT_TYPES.stormcaller.maxHp, attack: 20, attackDistance: 1, spawnVillage: null,
    };
    select(tile);
    expect(toolbarSpecs().some((a) => a.key === 'storm')).toBe(false);
  });
});
