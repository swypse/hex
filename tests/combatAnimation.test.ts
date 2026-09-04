import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Application, Container, Graphics, ImageSource, Text, Texture } from 'pixi.js';
import { gameController } from '../src/controller/gameController';
import { Simulator } from '../src/game/simulator';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import { UNIT_TYPES, type Unit } from '../src/game/units';
import { axialKey } from '../src/game/hex';
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
  const portTextures = { e: tileTex(1, 1), ne: tileTex(1, 1), nw: tileTex(1, 1), w: tileTex(1, 1), sw: tileTex(1, 1), se: tileTex(1, 1) };
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
    freePortTexture: tex(1, 1),
    templeTextures: { 1: tileTex(1, 1), 2: tileTex(1, 1), 3: tileTex(1, 1), 4: tileTex(1, 1) },
    forestTempleTextures: { 1: tileTex(1, 1), 2: tileTex(1, 1), 3: tileTex(1, 1), 4: tileTex(1, 1) },
    shipTextures,
    bonusTexture: tileTex(50, 50),
    villageConnectedTexture: null,
    captureTexture: null,
  };
}

function makeOpenMap(): GameMap {
  const tiles: MapTile[] = [];
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      if (Math.abs(q + r) > 3) continue;
      tiles.push({
        q, r,
        terrain: TileType.GrasslandLand,
        height: 0.1,
        settlement: null,
        building: null,
        roadOwner: null,
        unit: null,
        ownedBy: null,
        claimedByVillage: null,
        exploredBy: [0, 1, 2],
      });
    }
  }
  return { radius: 3, spawns: [], tiles };
}

function unitAt(map: GameMap, q: number, r: number): MapTile {
  return map.tiles.find((t) => t.q === q && t.r === r)!;
}

function makeUnit(id: string, owner: number, q: number, r: number, hp: number): Unit {
  return {
    id, owner, type: 'warrior', q, r,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp, attack: UNIT_TYPES.warrior.attack, attackDistance: UNIT_TYPES.warrior.attackDistance,
    spawnVillage: null,
  };
}

function player(index: number, tribe: Tribe): Player {
  return { index, tribe, isHuman: true, name: `P${index}`, resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true };
}

interface Harness {
  gc: {
    runCommand: (cmd: never) => Promise<void>;
    presentEvents: (events: GameEvent[], pre: Set<string>) => Promise<void>;
    exploredKeysFor: (player: number) => Set<string>;
    app: unknown;
    sim: unknown;
    mapView: MapView;
    textures: TextureSet;
    hiddenUnitIds: Set<string>;
    mapRoot: Container | null;
    camera: unknown;
  };
  mapView: MapView;
  mapRoot: Container;
  tickFns: Array<() => void>;
  tileViews: () => Map<string, { unitSprite: { visible: boolean; texture?: Texture; x: number; y: number } | null }>;
  advanceTicks: (ms: number) => void;
}

let now = 0;
let realPerfNow: typeof performance.now;

function setup(map: GameMap, players: Player[]): Harness {
  const sim = new Simulator(map, players, 'capture');
  sim.startGame();
  sim.drainEvents();

  const tickFns: Array<() => void> = [];
  const app = {
    screen: { width: 800, height: 600 },
    ticker: {
      add: (fn: () => void): void => { tickFns.push(fn); },
      remove: (fn: () => void): void => {
        const i = tickFns.indexOf(fn);
        if (i >= 0) tickFns.splice(i, 1);
      },
    },
  } as unknown as Application;

  const textures = buildTextures(map);
  const mapView = new MapView(app, textures, 40, 0.5, 2);
  mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
    x: 0, y: 0, scale: 1, width: 800, height: 600,
  });
  const mapRoot = new Container();

  const store = useGameStore.getState();
  store.setLocalPlayerIndex(0);
  store.setNetMode('single');
  store.setAiActive(false);
  store.setSelection(null);
  store.setPlayers(players);

  const gc = gameController as unknown as Harness['gc'];
  gc.app = app;
  gc.sim = sim;
  gc.mapView = mapView;
  gc.textures = textures;
  gc.hiddenUnitIds.clear();
  gc.mapRoot = mapRoot;
  installCamera(gc, app, map.radius);
  gc.camera = (gc as { camera: unknown }).camera;

  now = 0;
  realPerfNow = (globalThis as { performance: Performance }).performance.now;
  (globalThis as { performance: Performance }).performance.now = () => now;

  return {
    gc,
    mapView,
    mapRoot,
    tickFns,
    tileViews: () =>
      (mapView as unknown as { tileViews: Map<string, { unitSprite: { visible: boolean; texture?: Texture; x: number; y: number } | null }> }).tileViews,
    advanceTicks: (ms: number): void => {
      now += ms;
      for (const fn of [...tickFns]) fn();
    },
  };
}

async function waitFor(cond: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('combat animation ordering', () => {
  let h: Harness;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
  });

  afterEach(() => {
    if (realPerfNow) (globalThis as { performance: Performance }).performance.now = realPerfNow;
    h?.mapView.destroy();
  });

  it('keeps the dying unit visible through the attack and removes it only after the death gap', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    // Final sim state after the attack: the attacker already advanced onto the
    // dead target's tile (a normal melee kill).
    const attacker = makeUnit('att', 0, 1, 0, 5);
    unitAt(map, 1, 0).unit = attacker;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 5, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: true,
      attackerPre: { type: 'warrior', owner: 0, hp: 5 },
      targetPre: { type: 'warrior', owner: 1, hp: 5 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));

    // The staged presentation must draw the attacker on its original tile and
    // the dying defender back on its tile while combat animates.
    await waitFor(() => {
      const a = h.tileViews().get(axialKey({ q: 0, r: 0 }))!;
      const t = h.tileViews().get(axialKey({ q: 1, r: 0 }))!;
      return a?.unitSprite?.visible === true && t?.unitSprite?.visible === true;
    });

    // Finish the lunge tick, then check the dying defender is STILL drawn while
    // the death gap elapses (it must not disappear before the -hp step).
    h.advanceTicks(500);
    await waitFor(() => {
      const t = h.tileViews().get(axialKey({ q: 1, r: 0 }))!;
      return t?.unitSprite?.visible === true;
    });

    // The attacker-advance slide runs on the ticker too; step it until the
    // presentation settles.
    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;

    // After the full sequence the attacker stands on the killed tile and the
    // staged defender is gone.
    const finalTile = h.tileViews().get(axialKey({ q: 1, r: 0 }))!;
    expect(finalTile?.unitSprite).not.toBeNull();
    expect(unitAt(map, 1, 0).unit?.id).toBe('att');
    // No staging overrides leak into the final view: only the real attacker.
    expect(h.mapRoot.children.length).toBe(0);
  });

  it('keeps a local rider selected after an attack so it can use its follow-up move', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const rider = makeUnit('rd', 0, 0, 0, 4);
    rider.type = 'rider';
    unitAt(map, 0, 0).unit = rider;
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 5);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'rd', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 2, targetDamage: 1, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'rider', owner: 0, hp: 4 },
      targetPre: { type: 'warrior', owner: 1, hp: 5 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;

    const s = useGameStore.getState();
    expect(s.selection).toEqual({ kind: 'unit', q: 0, r: 0 });
  });

  it('plays a death burst for a ranged kill while the attacker stays put', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    // Pirate-like attacker that does not move onto the killed tile.
    const attacker = makeUnit('att', 0, 0, 0, 15);
    attacker.type = 'pirate';
    unitAt(map, 0, 0).unit = attacker;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: -1, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 5, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: true,
      attackerPre: { type: 'pirate', owner: -1, hp: 15 },
      targetPre: { type: 'warrior', owner: 1, hp: 5 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));

    await waitFor(() => {
      const a = h.tileViews().get(axialKey({ q: 0, r: 0 }))!;
      const t = h.tileViews().get(axialKey({ q: 1, r: 0 }))!;
      return a?.unitSprite?.visible === true && t?.unitSprite?.visible === true;
    });
    h.advanceTicks(500);

    // A death burst must be spawned on the defender tile.
    await waitFor(() => {
      const bursts = h.mapRoot.children.filter((c) =>
        (c as Container).children.some((g) => g instanceof Graphics),
      );
      return bursts.length > 0;
    });

    await p;

    expect(unitAt(map, 0, 0).unit?.id).toBe('att');
    expect(unitAt(map, 1, 0).unit).toBeNull();
  });
});
