import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { Simulator } from '../src/game/simulator';
import { generateMap, type MapTile } from '../src/game/mapGen';
import { buildPlayers } from '../src/game/players';
import { SeededRandom } from '../src/util/random';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { HudToolbar } from '../src/ui/hud/HudToolbar';
import { TileType } from '../src/game/tileTypes';
import { hexNeighbors } from '../src/game/hex';
import { type UIHost } from '../src/ui/host';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({
      width: s.length * 8,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: s.length * 8,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 3,
    }),
  };
}

function makeHost(): UIHost {
  return {
    app: {
      screen: { width: 1280, height: 800 },
      ticker: { add: () => {}, remove: () => {} },
    },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

const isIconButton = (c: Container): boolean => c.children.some((ch) => ch instanceof Sprite);

describe('HudToolbar build actions', () => {
  let map: ReturnType<typeof generateMap>;
  let row: Container;
  let toolbar: HudToolbar;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    map = generateMap(2, 42);
    const players = buildPlayers(0, 1, new SeededRandom(1));
    players[0]!.skills.push('forestry', 'smithery', 'water');
    players[0]!.resources = { wood: 100, stone: 100, money: 500, ore: 100 };
    const sim = new Simulator(map, players, 'capture');
    sim.startGame();
    sim.drainEvents();
    (gameController as unknown as { sim: unknown }).sim = sim;
    const store = useGameStore.getState();
    store.setLocalPlayerIndex(0);
    store.setPlayers(players);
    store.setSelection(null);
    store.setTutorial(false);
    store.setTutorialStep(null);
    store.setTutorialHighlightEndTurn(false);
    const root = new Container();
    toolbar = new HudToolbar();
    toolbar.mount(makeHost(), root);
    row = (toolbar as unknown as { row: Container }).row;
  });

  afterEach(() => {
    toolbar.destroy();
  });

  function select(tile: MapTile): void {
    useGameStore.getState().setSelection({ kind: 'unit', q: tile.q, r: tile.r });
  }

  function ownedTile(terrain: TileType): MapTile {
    const tile = map.tiles.find((t) => t.settlement === null && t.unit === null)!;
    tile.terrain = terrain;
    tile.ownedBy = 0;
    tile.building = null;
    return tile;
  }

  it('renders the build sawmill action as an icon button', () => {
    const tile = ownedTile(TileType.GrasslandLand);
    const neighbor = map.tiles.find((t) =>
      hexNeighbors(tile).some((n) => n.q === t.q && n.r === t.r))!;
    neighbor.terrain = TileType.GrasslandForest;
    select(tile);
    expect(row.children.length).toBe(1);
    expect(isIconButton(row.children[0] as Container)).toBe(true);
  });

  it('renders the build mine action as an icon button', () => {
    const tile = ownedTile(TileType.GrasslandMountain);
    select(tile);
    expect(row.children.length).toBe(1);
    expect(isIconButton(row.children[0] as Container)).toBe(true);
  });

  it('renders the build port action as an icon button', () => {
    const tile = ownedTile(TileType.Water);
    select(tile);
    expect(row.children.length).toBe(1);
    expect(isIconButton(row.children[0] as Container)).toBe(true);
  });

  it('shows a Get the bonus button when a claimable bonus cell is selected', () => {
    const t = map.tiles.find((x) => x.settlement === null && x.unit === null)!;
    t.bonus = { kind: 'money', claimer: 0, arrivalTurn: 1 };
    t.unit = {
      id: 'b1', owner: 0, type: 'warrior', q: t.q, r: t.r,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    useGameStore.getState().setTurn(2);
    select(t);
    const labels = row.children.map((c) =>
      (c as Container).children.map((ch) => (ch as Text).text ?? '').join(''),
    );
    expect(labels.some((l) => l.includes('Get the bonus'))).toBe(true);
  });

  it('hides an action the player cannot afford', () => {
    useGameStore.getState().players[0]!.resources.money = 0;
    const tile = ownedTile(TileType.GrasslandLand);
    const neighbor = map.tiles.find((t) =>
      hexNeighbors(tile).some((n) => n.q === t.q && n.r === t.r))!;
    neighbor.terrain = TileType.GrasslandForest;
    select(tile);
    expect(row.children.length).toBe(0);
  });

  it('shows no action buttons while the AI is acting but keeps end turn visible', () => {
    const tile = ownedTile(TileType.GrasslandLand);
    const neighbor = map.tiles.find((t) =>
      hexNeighbors(tile).some((n) => n.q === t.q && n.r === t.r))!;
    neighbor.terrain = TileType.GrasslandForest;
    useGameStore.getState().setAiActive(true);
    select(tile);
    expect(row.children.length).toBe(0);
    const endTurnRow = (toolbar as unknown as { endTurnRow: Container }).endTurnRow;
    expect(endTurnRow.children.length).toBe(1);
    useGameStore.getState().setAiActive(false);
  });
});

describe('HudToolbar tutorial build highlights', () => {
  let map: ReturnType<typeof generateMap>;
  let row: Container;
  let toolbar: HudToolbar;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    map = generateMap(2, 42);
    const players = buildPlayers(0, 1, new SeededRandom(1));
    players[0]!.skills.push('forestry', 'smithery');
    players[0]!.resources = { wood: 100, stone: 100, money: 500, ore: 100 };
    const sim = new Simulator(map, players, 'capture');
    sim.startGame();
    sim.drainEvents();
    (gameController as unknown as { sim: unknown }).sim = sim;
    const store = useGameStore.getState();
    store.setLocalPlayerIndex(0);
    store.setPlayers(players);
    store.setSelection(null);
    store.setTutorial(false);
    store.setTutorialStep(null);
    const root = new Container();
    toolbar = new HudToolbar();
    toolbar.mount(makeHost(), root);
    row = (toolbar as unknown as { row: Container }).row;
  });

  afterEach(() => {
    toolbar.destroy();
  });

  function select(tile: MapTile): void {
    useGameStore.getState().setSelection({ kind: 'unit', q: tile.q, r: tile.r });
  }

  function ownedTile(terrain: TileType): MapTile {
    const tile = map.tiles.find((t) => t.settlement === null && t.unit === null)!;
    tile.terrain = terrain;
    tile.ownedBy = 0;
    tile.building = null;
    return tile;
  }

  it('pulses the build sawmill button during the buildSawmill step', () => {
    const tile = ownedTile(TileType.GrasslandLand);
    const neighbor = map.tiles.find((t) =>
      hexNeighbors(tile).some((n) => n.q === t.q && n.r === t.r))!;
    neighbor.terrain = TileType.GrasslandForest;
    const store = useGameStore.getState();
    store.setTutorial(true);
    store.setTutorialStep('buildSawmill');
    select(tile);
    expect(row.children.length).toBe(2);
    expect(row.children[1]).toBeInstanceOf(Graphics);
  });

  it('pulses the build mine button during the buildMine step', () => {
    const tile = ownedTile(TileType.GrasslandMountain);
    const store = useGameStore.getState();
    store.setTutorial(true);
    store.setTutorialStep('buildMine');
    select(tile);
    expect(row.children.length).toBe(2);
    expect(row.children[1]).toBeInstanceOf(Graphics);
  });

  it('pulses the upgrade village button during the upgradeVillage step', () => {
    const capital = map.tiles.find((t) => t.settlement?.owner === 0)!;
    const store = useGameStore.getState();
    store.setTutorial(true);
    store.setTutorialStep('upgradeVillage');
    select(capital);
    expect(row.children.length).toBe(2);
    expect(row.children[1]).toBeInstanceOf(Graphics);
  });

  it('does not add a ring when no build step is active', () => {
    const tile = ownedTile(TileType.GrasslandLand);
    const neighbor = map.tiles.find((t) =>
      hexNeighbors(tile).some((n) => n.q === t.q && n.r === t.r))!;
    neighbor.terrain = TileType.GrasslandForest;
    const store = useGameStore.getState();
    store.setTutorial(true);
    store.setTutorialStep('spawnArcher');
    select(tile);
    expect(row.children.length).toBe(1);
  });
});
