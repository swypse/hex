import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Container, Graphics, ImageSource, Sprite, Text, Texture } from 'pixi.js';
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
import { sfx } from '../src/sound/sfx';
import { type TextureSet, type TileTexture } from '../src/render/textureFactory';
import { villageTexturesForTest } from './helpers/villageTextures';
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
    villageTextures: villageTexturesForTest(tileTex(40, 40, 0.7), tileTex(40, 40, 0.7)),
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
    bottleTexture: tileTex(50, 50),
    villageConnectedTexture: null,
    captureTexture: null,

    wallTexture: null,
    arrowTexture: tex(67, 13),
    cannonballTexture: tex(35, 15),
  };
}

function makeOpenMap(): GameMap {
  return makeMap(3);
}

function makeMap(radius: number): GameMap {
  const tiles: MapTile[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.abs(q + r) > radius) continue;
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
  return { radius, spawns: [], tiles };
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

  it('animates the target lunging back in a counterattack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const attacker = makeUnit('att', 0, 0, 0, 4);
    const defender = makeUnit('def', 1, 1, 0, 5);
    unitAt(map, 0, 0).unit = attacker;
    unitAt(map, 1, 0).unit = defender;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const tiles = h.tileViews();
    const aKey = axialKey({ q: 0, r: 0 });
    const dKey = axialKey({ q: 1, r: 0 });
    const ax0 = tiles.get(aKey)!.unitSprite!.x;
    const dx0 = tiles.get(dKey)!.unitSprite!.x;

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 2, targetDamage: 1, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 4 },
      targetPre: { type: 'warrior', owner: 1, hp: 5 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));

    let aMax = 0;
    let dMax = 0;
    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 160 && !settled; i++) {
      h.advanceTicks(10);
      await new Promise((r) => setTimeout(r, 2));
      const as = tiles.get(aKey)!.unitSprite;
      const ds = tiles.get(dKey)!.unitSprite;
      if (as) aMax = Math.max(aMax, Math.abs(as.x - ax0));
      if (ds) dMax = Math.max(dMax, Math.abs(ds.x - dx0));
    }
    await pEnd;

    // Both the attacker's lunge and the defender's counter-lunge must move.
    expect(aMax).toBeGreaterThan(1);
    expect(dMax).toBeGreaterThan(1);
  });

  it('keeps a unit visible while earlier pirate animations run before the attack that kills it', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    unitAt(map, 1, 0).terrain = TileType.Water;
    unitAt(map, 2, 0).terrain = TileType.Water;
    const mine = makeUnit('mine', 0, 0, 0, 50);
    unitAt(map, 0, 0).unit = mine;
    const decoy = makeUnit('decoy', 0, -1, 0, 50);
    unitAt(map, -1, 0).unit = decoy;
    const pirate = (id: string, q: number, r: number): Unit => {
      const u = makeUnit(id, -1, q, r, 15);
      u.type = 'pirate';
      return u;
    };
    unitAt(map, 1, 0).unit = pirate('p1', 1, 0);
    unitAt(map, 2, 0).unit = pirate('p2', 2, 0);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });
    // The sim already ran the whole batch: the pirate kills removed the unit.
    unitAt(map, 0, 0).unit = null;

    const events: GameEvent[] = [
      {
        type: 'attack', attackerId: 'p1', targetId: 'decoy',
        attackerIndex: -1, targetIndex: 0,
        attackerTile: { q: 1, r: 0 }, targetTile: { q: -1, r: 0 },
        attackerDamage: 3, targetDamage: 0, missed: false,
        attackerDied: false, targetDied: false,
        attackerPre: { type: 'pirate', owner: -1, hp: 15 },
        targetPre: { type: 'warrior', owner: 0, hp: 50 },
      },
      {
        type: 'attack', attackerId: 'p2', targetId: 'mine',
        attackerIndex: -1, targetIndex: 0,
        attackerTile: { q: 2, r: 0 }, targetTile: { q: 0, r: 0 },
        attackerDamage: 3, targetDamage: 0, missed: false,
        attackerDied: false, targetDied: true,
        attackerPre: { type: 'pirate', owner: -1, hp: 15 },
        targetPre: { type: 'warrior', owner: 0, hp: 50 },
      },
    ];
    const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));

    // While the first pirate's attack animates (before the killing attack event
    // is presented), the doomed target must still be visible on its tile.
    await new Promise((r) => setTimeout(r, 20));
    const mineView = h.tileViews().get(axialKey({ q: 0, r: 0 }))!;
    expect(mineView?.unitSprite?.visible).toBe(true);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    const endView = h.tileViews().get(axialKey({ q: 0, r: 0 }))!;
    expect(endView?.unitSprite).toBeFalsy();
  });

  it('keeps a unit visible while earlier enemy animations run before the melee attack that kills it', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const mine = makeUnit('mine', 0, 0, 0, 50);
    unitAt(map, 0, 0).unit = mine;
    const decoy = makeUnit('decoy', 0, -1, 0, 50);
    unitAt(map, -1, 0).unit = decoy;
    const attacker = makeUnit('att', 1, 1, 0, 50);
    unitAt(map, 1, 0).unit = attacker;
    const other = makeUnit('ea', 1, 2, 0, 50);
    unitAt(map, 2, 0).unit = other;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });
    // The sim already ran the batch: the melee kill removed the unit and the
    // attacker advanced onto its tile.
    unitAt(map, 0, 0).unit = attacker;
    attacker.q = 0;
    attacker.r = 0;
    unitAt(map, 1, 0).unit = null;

    const events: GameEvent[] = [
      {
        type: 'attack', attackerId: 'ea', targetId: 'decoy',
        attackerIndex: 1, targetIndex: 0,
        attackerTile: { q: 2, r: 0 }, targetTile: { q: -1, r: 0 },
        attackerDamage: 10, targetDamage: 0, missed: false,
        attackerDied: false, targetDied: false,
        attackerPre: { type: 'warrior', owner: 1, hp: 50 },
        targetPre: { type: 'warrior', owner: 0, hp: 50 },
      },
      {
        type: 'attack', attackerId: 'att', targetId: 'mine',
        attackerIndex: 1, targetIndex: 0,
        attackerTile: { q: 1, r: 0 }, targetTile: { q: 0, r: 0 },
        attackerDamage: 40, targetDamage: 0, missed: false,
        attackerDied: false, targetDied: true,
        attackerPre: { type: 'warrior', owner: 1, hp: 50 },
        targetPre: { type: 'warrior', owner: 0, hp: 50 },
      },
    ];
    const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));

    await new Promise((r) => setTimeout(r, 20));
    const mineView = h.tileViews().get(axialKey({ q: 0, r: 0 }))!;
    const attackerView = h.tileViews().get(axialKey({ q: 1, r: 0 }))!;
    expect(mineView?.unitSprite?.visible).toBe(true);
    expect(attackerView?.unitSprite?.visible).toBe(true);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    const endView = h.tileViews().get(axialKey({ q: 0, r: 0 }))!;
    expect(endView?.unitSprite?.visible).toBe(true);
    expect(endView?.unitSprite).toBeTruthy();
  });

  it('plays the arc-shot launch immediately and the hit impact when an archer shot lands', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const archer = makeUnit('att', 0, 0, 0, 30);
    archer.type = 'archer';
    unitAt(map, 0, 0).unit = archer;
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const played: string[] = [];
    const spy = vi.spyOn(sfx, 'play').mockImplementation((name) => { played.push(name); });
    try {
      const attack: GameEvent = {
        type: 'attack', attackerId: 'att', targetId: 'def',
        attackerIndex: 0, targetIndex: 1,
        attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
        attackerDamage: 10, targetDamage: 0, missed: false,
        attackerDied: false, targetDied: false,
        attackerPre: { type: 'archer', owner: 0, hp: 30 },
        targetPre: { type: 'warrior', owner: 1, hp: 40 },
      };
      const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));

      // The launch fires as the shot starts, before the lunge completes.
      await waitFor(() => played.includes('arcShot'));
      expect(played).not.toContain('hit');

      // The impact plays once the blow lands (after the 160ms lunge).
      h.advanceTicks(200);
      await waitFor(() => played.includes('hit'));
      expect(played.indexOf('arcShot')).toBeLessThan(played.indexOf('hit'));

      let settled = false;
      const pEnd = p.finally(() => { settled = true; });
      for (let i = 0; i < 400 && !settled; i++) {
        h.advanceTicks(100);
        await new Promise((r) => setTimeout(r, 5));
      }
      await pEnd;
    } finally {
      spy.mockRestore();
    }
  });

  it('plays the sword-hit instead of the generic hit for a landed swordsman attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const swordsman = makeUnit('att', 0, 0, 0, 80);
    swordsman.type = 'swordsman';
    unitAt(map, 0, 0).unit = swordsman;
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const played: string[] = [];
    const spy = vi.spyOn(sfx, 'play').mockImplementation((name) => { played.push(name); });
    try {
      const attack: GameEvent = {
        type: 'attack', attackerId: 'att', targetId: 'def',
        attackerIndex: 0, targetIndex: 1,
        attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
        attackerDamage: 20, targetDamage: 0, missed: false,
        attackerDied: false, targetDied: false,
        attackerPre: { type: 'swordsman', owner: 0, hp: 80 },
        targetPre: { type: 'warrior', owner: 1, hp: 40 },
      };
      const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));

      h.advanceTicks(200);
      await waitFor(() => played.includes('swordHit'));
      expect(played).not.toContain('hit');
      expect(played).not.toContain('arcShot');

      let settled = false;
      const pEnd = p.finally(() => { settled = true; });
      for (let i = 0; i < 400 && !settled; i++) {
        h.advanceTicks(100);
        await new Promise((r) => setTimeout(r, 5));
      }
      await pEnd;
    } finally {
      spy.mockRestore();
    }
  });

  it('plays the generic hit, not the crew shot sound, for an archer-crewed ship attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const ship = makeUnit('att', 0, 0, 0, 30);
    ship.type = 'archer';
    ship.shipLevel = 1;
    unitAt(map, 0, 0).unit = ship;
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const played: string[] = [];
    const spy = vi.spyOn(sfx, 'play').mockImplementation((name) => { played.push(name); });
    try {
      const attack: GameEvent = {
        type: 'attack', attackerId: 'att', targetId: 'def',
        attackerIndex: 0, targetIndex: 1,
        attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
        attackerDamage: 10, targetDamage: 0, missed: false,
        attackerDied: false, targetDied: false,
        attackerPre: { type: 'archer', owner: 0, hp: 30, shipLevel: 1 },
        targetPre: { type: 'warrior', owner: 1, hp: 40 },
      };
      const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));

      h.advanceTicks(200);
      await waitFor(() => played.includes('hit'));
      expect(played).not.toContain('arcShot');
      expect(played).not.toContain('swordHit');

      let settled = false;
      const pEnd = p.finally(() => { settled = true; });
      for (let i = 0; i < 400 && !settled; i++) {
        h.advanceTicks(100);
        await new Promise((r) => setTimeout(r, 5));
      }
      await pEnd;
    } finally {
      spy.mockRestore();
    }
  });

  it('shoots an arrow sprite from the archer toward the target and removes it on arrival', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const archer = makeUnit('att', 0, 0, 0, 30);
    archer.type = 'archer';
    unitAt(map, 0, 0).unit = archer;
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 10, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'archer', owner: 0, hp: 30 },
      targetPre: { type: 'warrior', owner: 1, hp: 40 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findArrow = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && c !== null) as Sprite;

    // The arrow appears near the attacker's tile once the shot launches.
    await waitFor(() => findArrow() !== undefined);
    const start = { x: findArrow().position.x, y: findArrow().position.y };
    // The arrow is 5px tall (drawing its 13px-tall texture at 5/13 scale).
    expect(findArrow().scale.y * 13).toBeCloseTo(5, 0);
    expect(start.x).toBeGreaterThan(0);
    expect(start.y).toBeGreaterThan(0);

    // Mid-flight (~half of the 1-tile 150ms flight), the arrow has moved.
    h.advanceTicks(80);
    await waitFor(() => {
      const a = findArrow();
      return a !== undefined && Math.abs(a.position.x - start.x) > 10;
    });

    // The lunge/impact finish and the popup settles; the arrow is gone by then.
    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
  });

  it('flies the arrow ~150ms per tile of distance (1 tile)', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const archer = makeUnit('att', 0, 0, 0, 30);
    archer.type = 'archer';
    unitAt(map, 0, 0).unit = archer;
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 10, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'archer', owner: 0, hp: 30 },
      targetPre: { type: 'warrior', owner: 1, hp: 40 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findArrow = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 67) as Sprite;

    await waitFor(() => findArrow() !== undefined);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    let elapsed = 0;
    // Measure how long the arrow stays on screen.
    for (let i = 0; i < 60 && !settled; i++) {
      h.advanceTicks(20);
      await new Promise((r) => setTimeout(r, 5));
      if (findArrow() === undefined) break;
      elapsed += 20;
    }
    await pEnd;
    // 1 tile -> ~150ms flight.
    expect(elapsed).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(300);
  });

  it('scales the cannonball flight with distance (2 tiles ~300ms)', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const ship = makeUnit('att', 0, 0, 0, 30);
    ship.type = 'archer';
    ship.shipLevel = 1;
    unitAt(map, 0, 0).unit = ship;
    unitAt(map, 2, 0).unit = makeUnit('def', 1, 2, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 2, r: 0 },
      attackerDamage: 10, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 30, shipLevel: 1 },
      targetPre: { type: 'warrior', owner: 1, hp: 40 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    await waitFor(() => findCannonball() !== undefined);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    let elapsed = 0;
    for (let i = 0; i < 80 && !settled; i++) {
      h.advanceTicks(20);
      await new Promise((r) => setTimeout(r, 5));
      if (findCannonball() === undefined) break;
      elapsed += 20;
    }
    await pEnd;
    // 2 tiles -> ~300ms flight (double the 1-tile duration).
    expect(elapsed).toBeGreaterThan(220);
    expect(elapsed).toBeLessThan(420);
  });

  it('shoots a cannonball from a pirate ship attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    // A captured ship becomes a pirate unit but keeps its ship level.
    const pirateShip = makeUnit('att', -1, 0, 0, 30);
    pirateShip.type = 'pirate';
    pirateShip.shipLevel = 2;
    unitAt(map, 0, 0).unit = pirateShip;
    unitAt(map, 1, 0).unit = makeUnit('def', 0, 1, 0, 20);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: -1, targetIndex: 0,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 6, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'pirate', owner: -1, hp: 30, shipLevel: 2 },
      targetPre: { type: 'warrior', owner: 0, hp: 20 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    let launched = false;
    for (let i = 0; i < 40 && !launched; i++) {
      h.advanceTicks(50);
      await new Promise((r) => setTimeout(r, 5));
      launched = findCannonball() !== undefined;
    }
    expect(launched).toBe(true);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 100 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    expect(findCannonball()).toBeUndefined();
  });

  it('shoots a cannonball from a pure pirate attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const pirate = makeUnit('att', -1, 0, 0, 30);
    pirate.type = 'pirate';
    unitAt(map, 0, 0).unit = pirate;
    unitAt(map, 1, 0).unit = makeUnit('def', 0, 1, 0, 20);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: -1, targetIndex: 0,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 6, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'pirate', owner: -1, hp: 30 },
      targetPre: { type: 'warrior', owner: 0, hp: 20 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    let launched = false;
    for (let i = 0; i < 40 && !launched; i++) {
      h.advanceTicks(50);
      await new Promise((r) => setTimeout(r, 5));
      launched = findCannonball() !== undefined;
    }
    expect(launched).toBe(true);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 100 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    expect(findCannonball()).toBeUndefined();
  });

  it('fires a cannonball back from a pirate ship counter-attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const attacker = makeUnit('att', 0, 0, 0, 50);
    unitAt(map, 0, 0).unit = attacker;
    const pirateShip = makeUnit('def', -1, 1, 0, 30);
    pirateShip.type = 'pirate';
    pirateShip.shipLevel = 2;
    unitAt(map, 1, 0).unit = pirateShip;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: -1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 5, targetDamage: 5, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 50 },
      targetPre: { type: 'pirate', owner: -1, hp: 30, shipLevel: 2 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    let launched = false;
    for (let i = 0; i < 60 && !launched; i++) {
      h.advanceTicks(50);
      await new Promise((r) => setTimeout(r, 5));
      launched = findCannonball() !== undefined;
    }
    expect(launched).toBe(true);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 100 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    expect(findCannonball()).toBeUndefined();
  });

  it('fires a cannonball back from a pure pirate during its counter-attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const attacker = makeUnit('att', 0, 0, 0, 50);
    unitAt(map, 0, 0).unit = attacker;
    const pirate = makeUnit('def', -1, 1, 0, 30);
    pirate.type = 'pirate';
    unitAt(map, 1, 0).unit = pirate;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: -1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 5, targetDamage: 5, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 50 },
      targetPre: { type: 'pirate', owner: -1, hp: 30 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    let launched = false;
    for (let i = 0; i < 60 && !launched; i++) {
      h.advanceTicks(50);
      await new Promise((r) => setTimeout(r, 5));
      launched = findCannonball() !== undefined;
    }
    expect(launched).toBe(true);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 100 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    expect(findCannonball()).toBeUndefined();
  });

  it('fires an arrow back from the target archer during its counter-attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    // Attacker is melee (no attack projectile), so any arrow sprite that shows
    // up is the counter-attack shot from the archer target.
    const attacker = makeUnit('att', 0, 0, 0, 50);
    unitAt(map, 0, 0).unit = attacker;
    const archer = makeUnit('def', 1, 1, 0, 30);
    archer.type = 'archer';
    unitAt(map, 1, 0).unit = archer;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 5, targetDamage: 5, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 50 },
      targetPre: { type: 'archer', owner: 1, hp: 30 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCounterArrow = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 67) as Sprite;

    // The counter shot appears after the attack lands (drive the lunge ticker)
    // and flies toward the attacker (leftward, from target hex 1,0).
    let launched = false;
    for (let i = 0; i < 40 && !launched; i++) {
      h.advanceTicks(50);
      await new Promise((r) => setTimeout(r, 5));
      launched = findCounterArrow() !== undefined;
    }
    expect(launched).toBe(true);
    const start = findCounterArrow().position.x;
    h.advanceTicks(80);
    expect(findCounterArrow().position.x).toBeLessThan(start - 10);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    expect(findCounterArrow()).toBeUndefined();
  });

  it('fires a cannonball back from a ship during its counter-attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const attacker = makeUnit('att', 0, 0, 0, 50);
    unitAt(map, 0, 0).unit = attacker;
    const ship = makeUnit('def', 1, 1, 0, 30);
    ship.type = 'archer';
    ship.shipLevel = 1;
    unitAt(map, 1, 0).unit = ship;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 5, targetDamage: 5, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 50 },
      targetPre: { type: 'archer', owner: 1, hp: 30, shipLevel: 1 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCounterCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    let launched = false;
    for (let i = 0; i < 40 && !launched; i++) {
      h.advanceTicks(50);
      await new Promise((r) => setTimeout(r, 5));
      launched = findCounterCannonball() !== undefined;
    }
    expect(launched).toBe(true);
    expect(findCounterCannonball().position.x).toBeGreaterThan(0);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    expect(findCounterCannonball()).toBeUndefined();
  });

  it('flips the arrow horizontally when the archer shoots left (RTL)', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const archer = makeUnit('att', 0, 0, 0, 30);
    archer.type = 'archer';
    unitAt(map, 0, 0).unit = archer;
    unitAt(map, -1, 0).unit = makeUnit('def', 1, -1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: -1, r: 0 },
      attackerDamage: 10, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'archer', owner: 0, hp: 30 },
      targetPre: { type: 'warrior', owner: 1, hp: 40 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findArrow = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && c !== null) as Sprite;

    await waitFor(() => findArrow() !== undefined);
    h.advanceTicks(80);
    expect(findArrow().scale.x).toBeLessThan(0);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
  });

  it('shoots an arrow even on a missed archer attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const archer = makeUnit('att', 0, 0, 0, 30);
    archer.type = 'archer';
    unitAt(map, 0, 0).unit = archer;
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 0, targetDamage: 0, missed: true,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'archer', owner: 0, hp: 30 },
      targetPre: { type: 'warrior', owner: 1, hp: 40 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findArrow = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && c !== null) as Sprite;

    await waitFor(() => findArrow() !== undefined);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
  });

  it('shoots a cannonball sprite from the ship toward the target and removes it on arrival', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const ship = makeUnit('att', 0, 0, 0, 30);
    ship.type = 'archer';
    ship.shipLevel = 1;
    unitAt(map, 0, 0).unit = ship;
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 10, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 30, shipLevel: 1 },
      targetPre: { type: 'warrior', owner: 1, hp: 40 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    await waitFor(() => findCannonball() !== undefined);
    const start = { x: findCannonball().position.x, y: findCannonball().position.y };
    expect(start.x).toBeGreaterThan(0);

    h.advanceTicks(80);
    await waitFor(() => {
      const c = findCannonball();
      return c !== undefined && Math.abs(c.position.x - start.x) > 10;
    });

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    expect(findCannonball()).toBeUndefined();
  });

  it('flips the cannonball horizontally when the ship shoots left (RTL)', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const ship = makeUnit('att', 0, 0, 0, 30);
    ship.type = 'archer';
    ship.shipLevel = 1;
    unitAt(map, 0, 0).unit = ship;
    unitAt(map, -1, 0).unit = makeUnit('def', 1, -1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: -1, r: 0 },
      attackerDamage: 10, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 30, shipLevel: 1 },
      targetPre: { type: 'warrior', owner: 1, hp: 40 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    await waitFor(() => findCannonball() !== undefined);
    h.advanceTicks(80);
    expect(findCannonball().scale.x).toBeLessThan(0);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
  });

  it('shoots a cannonball sprite from the catapult toward its target', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const catapult = makeUnit('att', 0, 0, 0, 30);
    catapult.type = 'catapult';
    unitAt(map, 0, 0).unit = catapult;
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 20, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'catapult', owner: 0, hp: 30 },
      targetPre: { type: 'warrior', owner: 1, hp: 40 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    await waitFor(() => findCannonball() !== undefined);
    const startY = findCannonball().position.y;
    // At mid-flight the catapult ball must sit far above the launch height
    // (higher arc than the ship's flat cannonball lob).
    h.advanceTicks(80);
    const midY = findCannonball().position.y;
    expect(startY - midY).toBeGreaterThan(30);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    expect(findCannonball()).toBeUndefined();
  });

  it('lobs the ship cannonball on a lower arc than the catapult', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const ship = makeUnit('att', 0, 0, 0, 30);
    ship.type = 'archer';
    ship.shipLevel = 1;
    unitAt(map, 0, 0).unit = ship;
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 40);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 10, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 30, shipLevel: 1 },
      targetPre: { type: 'warrior', owner: 1, hp: 40 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    await waitFor(() => findCannonball() !== undefined);
    const startY = findCannonball().position.y;
    h.advanceTicks(80);
    const midY = findCannonball().position.y;
    // Ship (and archer) keep the flatter trajectory; well under the catapult arc.
    expect(startY - midY).toBeLessThan(30);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
  });

  it('pans the camera toward an off-screen enemy attack', async () => {
    const map = makeMap(12);
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);
    const camera = h.gc.camera as {
      pan: { x: number; y: number };
      isWorldPointVisible: (w: { x: number; y: number }) => boolean;
      animateTo: (t: { x: number; y: number }) => Promise<void>;
    };
    const panBefore = { ...camera.pan };

    // Enemy unit far to the right (screen x ~1093 with pan 400 + 2-tile margin).
    const attacker = makeUnit('att', 1, 10, 0, 5);
    attacker.type = 'warrior';
    unitAt(map, 10, 0).unit = attacker;
    unitAt(map, 9, 0).unit = makeUnit('def', 0, 9, 0, 5);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 1, targetIndex: 0,
      attackerTile: { q: 10, r: 0 }, targetTile: { q: 9, r: 0 },
      attackerDamage: 2, targetDamage: 1, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 1, hp: 5 },
      targetPre: { type: 'warrior', owner: 0, hp: 5 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;

    // The camera must have moved noticeably toward the off-screen attack.
    expect(camera.pan.x).toBeLessThan(panBefore.x - 50);
  });

  it('pans the camera toward an off-screen pirate attack', async () => {
    const map = makeMap(12);
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);
    const camera = h.gc.camera as {
      pan: { x: number; y: number };
      isWorldPointVisible: (w: { x: number; y: number }) => boolean;
      animateTo: (t: { x: number; y: number }) => Promise<void>;
    };
    const panBefore = { ...camera.pan };

    const pirate = makeUnit('pirate', -1, 10, 0, 15);
    pirate.type = 'pirate';
    unitAt(map, 10, 0).unit = pirate;
    unitAt(map, 9, 0).unit = makeUnit('def', 0, 9, 0, 5);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'pirate', targetId: 'def',
      attackerIndex: -1, targetIndex: 0,
      attackerTile: { q: 10, r: 0 }, targetTile: { q: 9, r: 0 },
      attackerDamage: 3, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'pirate', owner: -1, hp: 15 },
      targetPre: { type: 'warrior', owner: 0, hp: 5 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;

    expect(camera.pan.x).toBeLessThan(panBefore.x - 50);
  });

  it('does not repan the camera for a visible enemy attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);
    const camera = h.gc.camera as {
      pan: { x: number; y: number };
      isWorldPointVisible: (w: { x: number; y: number }) => boolean;
      animateTo: (t: { x: number; y: number }) => Promise<void>;
    };
    const panBefore = { ...camera.pan };

    const attacker = makeUnit('att', 1, 1, 0, 5);
    attacker.type = 'warrior';
    unitAt(map, 1, 0).unit = attacker;
    unitAt(map, 0, 0).unit = makeUnit('def', 0, 0, 0, 5);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 1, targetIndex: 0,
      attackerTile: { q: 1, r: 0 }, targetTile: { q: 0, r: 0 },
      attackerDamage: 2, targetDamage: 1, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 1, hp: 5 },
      targetPre: { type: 'warrior', owner: 0, hp: 5 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;

    expect(camera.pan.x).toBeCloseTo(panBefore.x, 0);
  });
});
