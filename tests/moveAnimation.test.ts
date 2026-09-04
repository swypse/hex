import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Application, Container, Graphics, ImageSource, Text, Texture } from 'pixi.js';
import { gameController } from '../src/controller/gameController';
import { Simulator, type Command } from '../src/game/simulator';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import { UNIT_TYPES, type Unit } from '../src/game/units';
import { allTiles, axialKey } from '../src/game/hex';
import { type GameEvent } from '../src/game/events';
import { MapView } from '../src/render/mapRenderer';
import { useGameStore } from '../src/store/gameStore';
import { type TextureSet, type TileTexture } from '../src/render/textureFactory';
import { installCamera } from './helpers/testMap';

function tex(w: number, h: number): Texture {
  return new Texture({ source: new ImageSource({ width: w, height: h }) });
}

function tileTex(w: number, h: number, anchorY = 0.5): TileTexture {
  return { texture: tex(w, h), anchorY };
}

function buildTextures(map: GameMap): TextureSet {
  const unitTex = tileTex(100, 100, 0.7);
  const shipTex = tileTex(100, 100, 0.7);
  const allTribes: Tribe[] = [Tribe.Cats, Tribe.Warriors, Tribe.Barbarians, Tribe.Villagers];
  const unitTextures = Object.fromEntries(
    allTribes.map((t) => [t, { warrior: unitTex, rider: unitTex, archer: unitTex, swordsman: unitTex }]),
  ) as TextureSet['unitTextures'];
  const shipTextures = Object.fromEntries(
    allTribes.map((t) => [t, { 1: shipTex, 2: shipTex, 3: shipTex }]),
  ) as TextureSet['shipTextures'];
  const portTextures = {
    e: tileTex(40, 40, 0.7),
    ne: tileTex(40, 40, 0.7),
    nw: tileTex(40, 40, 0.7),
    w: tileTex(40, 40, 0.7),
    sw: tileTex(40, 40, 0.7),
    se: tileTex(40, 40, 0.7),
  };
  return {
    tileTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTopTexture: tileTex(50, 50),
    villageTextures: { level1: tileTex(40, 40, 0.7), level2: tileTex(40, 40, 0.7) },
    freeVillageTexture: tileTex(40, 40),
    unitTextures,
    pirateTexture: unitTex,
    sawmillTexture: tileTex(50, 50),
    mineTexture: tileTex(50, 50),
    portTextures,
    bridgeTextures: { nw: unitTex, ne: unitTex, we: unitTex },
    freePortTexture: tex(40, 40),
    templeTextures: {
      1: tileTex(40, 40, 0.7),
      2: tileTex(40, 40, 0.7),
      3: tileTex(40, 40, 0.7),
      4: tileTex(40, 40, 0.7),
    },
    forestTempleTextures: {
      1: tileTex(40, 40, 0.7),
      2: tileTex(40, 40, 0.7),
      3: tileTex(40, 40, 0.7),
      4: tileTex(40, 40, 0.7),
    },
    shipTextures,
    bonusTexture: tileTex(50, 50),
    villageConnectedTexture: null,
    captureTexture: null,
  };
}

function makeMap(): GameMap {
  const unitTile: MapTile = {
    q: 0,
    r: 0,
    terrain: TileType.GrasslandLand,
    height: 0.1,
    settlement: null,
    building: null,
    roadOwner: null,
    unit: {
      id: 'u1',
      owner: 0,
      type: 'warrior',
      q: 0,
      r: 0,
      hasMoved: false,
      hasAttacked: false,
      hasHealed: false,
      hp: UNIT_TYPES.warrior.maxHp,
      attack: UNIT_TYPES.warrior.attack,
      attackDistance: UNIT_TYPES.warrior.attackDistance,
      spawnVillage: { q: 0, r: 0 },
    },
    ownedBy: 0,
    claimedByVillage: null,
    exploredBy: [0],
  };
  const neighbor = (q: number, r: number): MapTile => ({
    q,
    r,
    terrain: TileType.GrasslandLand,
    height: 0.1,
    settlement: null,
    building: null,
    roadOwner: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
    exploredBy: [0],
  });
  return {
    radius: 1,
    spawns: [],
    tiles: [
      unitTile,
      neighbor(1, 0), neighbor(1, -1), neighbor(0, -1),
      neighbor(-1, 0), neighbor(-1, 1), neighbor(0, 1),
    ],
  };
}

function makeOpenMap(): GameMap {
  const tiles: MapTile[] = allTiles(2).map(({ q, r }) => ({
    q,
    r,
    terrain: TileType.GrasslandLand,
    height: 0.1,
    settlement: null,
    building: null,
    roadOwner: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
    exploredBy: [0, 1, 2],
  }));
  return { radius: 2, spawns: [], tiles };
}

function unitAt(map: GameMap, q: number, r: number): MapTile {
  return map.tiles.find((t) => t.q === q && t.r === r)!;
}

function makeEnemy(id: string, owner: number, q: number, r: number): Unit {
  return {
    id,
    owner,
    type: 'warrior',
    q,
    r,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: UNIT_TYPES.warrior.maxHp,
    attack: UNIT_TYPES.warrior.attack,
    attackDistance: UNIT_TYPES.warrior.attackDistance,
    spawnVillage: { q, r },
  };
}

async function waitFor(cond: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

interface Harness {
  gc: {
    runCommand: (cmd: Command) => Promise<void>;
    presentEvents: (events: GameEvent[], pre: Set<string>) => Promise<void>;
    exploredKeysFor: (player: number) => Set<string>;
    app: unknown;
    sim: unknown;
    mapView: MapView;
    textures: TextureSet;
    hiddenUnitIds: Set<string>;
    taskQueue: Promise<void>;
  };
  mapView: MapView;
  tileViews: () => Map<string, { unitSprite: { visible: boolean } | null }>;
}

let realRaf: typeof requestAnimationFrame | undefined;
let rafStep = 30;

function setupGame(map: GameMap, players: Player[]): Harness {
  const sim = new Simulator(map, players, 'capture');
  sim.startGame();
  sim.drainEvents();

  const app = {
    screen: { width: 800, height: 600 },
    ticker: { add: (): void => {}, remove: (): void => {} },
  } as unknown as Application;

  const textures = buildTextures(map);
  const mapView = new MapView(app, textures, 40, 0.5, 2);
  mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
    x: 400, y: 300, scale: 1, width: 800, height: 600,
  });

  const store = useGameStore.getState();
  store.setLocalPlayerIndex(0);
  store.setNetMode('single');
  store.setAiActive(false);
  store.setSelection({ kind: 'unit', q: 0, r: 0 });
  store.setPlayers(players);

  const gc = gameController as unknown as Harness['gc'];
  gc.app = app;
  gc.sim = sim;
  gc.mapView = mapView;
  gc.textures = textures;
  gc.hiddenUnitIds.clear();
  installCamera(gc, app, map.radius);
  gc.taskQueue = Promise.resolve();

  let now = 0;
  realRaf = (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame!;
  (globalThis as { performance: Performance }).performance.now = () => now;
  (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = ((cb: (t: number) => void) => {
    now += rafStep;
    return setTimeout(() => cb(now), 0);
  }) as typeof requestAnimationFrame;

  return {
    gc,
    mapView,
    tileViews: () =>
      (mapView as unknown as { tileViews: Map<string, { unitSprite: { visible: boolean } | null }> }).tileViews,
  };
}

function player(index: number, tribe: Tribe): Player {
  return { index, tribe, isHuman: true, name: `P${index}`, resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true };
}

describe('move animation', () => {
  let h: Harness;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    h = setupGame(makeMap(), [player(0, Tribe.Cats)]);
  });

  afterEach(() => {
    if (realRaf) (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = realRaf;
    h.mapView.destroy();
  });

  it('keeps the unit off the destination while a ghost walks from the start, then reveals it', async () => {
    const p = h.gc.runCommand({ type: 'move', unitId: 'u1', q: 1, r: 0 });

    await waitFor(() => h.gc.hiddenUnitIds.has('u1'));

    const destView = h.tileViews().get(axialKey({ q: 1, r: 0 }))!;
    const srcView = h.tileViews().get(axialKey({ q: 0, r: 0 }))!;
    const last = h.mapView.container.children[h.mapView.container.children.length - 1] as {
      texture?: unknown;
      anchor?: unknown;
      zIndex?: number;
      destroyed?: boolean;
    };

    try {
      // During the walk the real unit must not be visible on the destination cell.
      expect(destView.unitSprite?.visible).toBe(false);
      // ... and the source cell no longer shows it either.
      expect(srcView.unitSprite).toBeNull();

      // A ghost sprite is walking on the map container, above the tiles.
      expect(last.texture).toBeDefined();
      expect(last.zIndex).toBeGreaterThanOrEqual(10);
    } finally {
      await p;
    }

    expect(h.gc.hiddenUnitIds.has('u1')).toBe(false);
    expect(destView.unitSprite?.visible).toBe(true);
    expect(last.destroyed).toBe(true);
  });

  it('does not show a not-yet-animated batch unit on its destination during another unit walk', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Warriors), player(2, Tribe.Barbarians)];
    h = setupGame(map, players);

    // Enemy units start on explored cells.
    const e1 = makeEnemy('e1', 1, 1, 0);
    const e2 = makeEnemy('e2', 2, -1, 0);
    unitAt(map, 1, 0).unit = e1;
    unitAt(map, -1, 0).unit = e2;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    // Apply both moves to the sim state (as an AI turn batch would) and
    // present them together.
    unitAt(map, 1, 0).unit = null;
    unitAt(map, 2, 0).unit = e1;
    e1.q = 2; e1.r = 0;
    unitAt(map, -1, 0).unit = null;
    unitAt(map, -2, 0).unit = e2;
    e2.q = -2; e2.r = 0;

    const events: GameEvent[] = [
      { type: 'unitMoved', unitId: 'e1', from: { q: 1, r: 0 }, path: [{ q: 2, r: 0 }], to: { q: 2, r: 0 } },
      { type: 'unitMoved', unitId: 'e2', from: { q: -1, r: 0 }, path: [{ q: -2, r: 0 }], to: { q: -2, r: 0 } },
    ];

    const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));

    // Wait until the first unit's walk has begun (its ghost is on the map).
    await waitFor(() =>
      [...h.mapView.container.children].some((c) => (c as { texture?: unknown }).texture !== undefined),
    );

    const d2 = h.tileViews().get(axialKey({ q: -2, r: 0 }))!;
    try {
      // While e1 walks, e2 must not already be sitting on its destination.
      expect(h.gc.hiddenUnitIds.has('e2')).toBe(true);
      expect(d2.unitSprite?.visible).toBe(false);
    } finally {
      await p;
    }

    // After the batch both units are revealed on their destinations.
    expect(h.gc.hiddenUnitIds.has('e1')).toBe(false);
    expect(h.gc.hiddenUnitIds.has('e2')).toBe(false);
    const d1 = h.tileViews().get(axialKey({ q: 2, r: 0 }))!;
    expect(d1.unitSprite?.visible).toBe(true);
    expect(d2.unitSprite?.visible).toBe(true);
  });

  it('keeps the ship texture while a landing move animates', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats)];
    h = setupGame(map, players);
    const from = unitAt(map, 0, 0);
    from.terrain = TileType.Water;
    const ship: Unit = {
      id: 's1', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 }, shipLevel: 1,
    };
    from.unit = ship;
    const dest = unitAt(map, 1, 0);
    from.unit = null;
    const landed: Unit = {
      id: 's1', owner: 0, type: 'warrior', q: 1, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 },
    };
    dest.unit = landed;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const events: GameEvent[] = [
      { type: 'unitMoved', unitId: 's1', from: { q: 0, r: 0 }, path: [{ q: 1, r: 0 }], to: { q: 1, r: 0 }, shipLevel: 1 },
    ];
    const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));
    await waitFor(() =>
      [...h.mapView.container.children].some((c) => (c as { texture?: unknown }).texture !== undefined),
    );
    const ghost = [...h.mapView.container.children]
      .reverse()
      .find((c) => (c as { texture?: unknown }).texture !== undefined) as unknown as { texture: Texture };
    try {
      expect(ghost.texture).toBe(h.gc.textures.shipTextures[Tribe.Cats][1].texture);
    } finally {
      await p;
    }
  });

  it('queues a tribe died notification after the last village is captured', async () => {
    const map = makeOpenMap();
    h = setupGame(map, [player(0, Tribe.Cats), player(1, Tribe.Barbarians)]);
    const village = unitAt(map, 1, 0);
    village.settlement = { owner: 1, level: 1, captureReady: false };
    village.settlement.owner = 0;
    const events: GameEvent[] = [
      { type: 'captured', q: 1, r: 0, oldOwner: 1, newOwner: 0, ownerDied: true },
    ];
    const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));
    await p;
    const s = useGameStore.getState();
    expect(s.centerMessage).toBe('Settlement is captured by Cats!');
    expect(s.centerMessageQueue).toContain('Barbarians died!');
  });

  it('spawns a 10-circle death animation on the dead unit hex and removes it after the rise', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setupGame(map, players);
    const mapRoot = new Container();
    (h.gc as unknown as { mapRoot: Container | null }).mapRoot = mapRoot;

    const target = unitAt(map, 1, 0);
    target.unit = makeEnemy('def', 1, 1, 0);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const callbacks: Array<() => void> = [];
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (fn: () => void) => callbacks.push(fn), remove: (): void => {} },
    } as unknown as Application;
    h.gc.app = app;
    let now = 0;
    (globalThis as { performance: Performance }).performance.now = () => now;

    const events: GameEvent[] = [
      {
        type: 'attack', attackerId: 'att', targetId: 'def',
        attackerIndex: 0, targetIndex: 1,
        attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
        attackerDamage: 0, targetDamage: 0, missed: false,
        attackerDied: false, targetDied: true,
      },
    ];
    const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));
    await p;

    expect(mapRoot.children.length).toBe(1);
    const deathEl = mapRoot.children[0] as Container;
    const circles = deathEl.children.filter((c) => c instanceof Graphics);
    expect(circles.length).toBe(10);

    const deathFn = callbacks[callbacks.length - 1]!;
    now = 2000;
    deathFn();
    expect(mapRoot.children.length).toBe(0);
  });

  it('does not spawn a death animation on an unexplored death tile', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setupGame(map, players);
    const mapRoot = new Container();
    (h.gc as unknown as { mapRoot: Container | null }).mapRoot = mapRoot;

    const target = unitAt(map, 1, 0);
    target.unit = makeEnemy('def', 1, 1, 0);
    target.exploredBy = [];

    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (): void => {}, remove: (): void => {} },
    } as unknown as Application;
    h.gc.app = app;

    const events: GameEvent[] = [
      {
        type: 'attack', attackerId: 'att', targetId: 'def',
        attackerIndex: 0, targetIndex: 1,
        attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
        attackerDamage: 0, targetDamage: 0, missed: false,
        attackerDied: false, targetDied: true,
      },
    ];
    const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));
    await p;

    expect(mapRoot.children.length).toBe(0);
  });
});
