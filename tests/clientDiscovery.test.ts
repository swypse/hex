import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Application, Container, Graphics, ImageSource, Text, Texture } from 'pixi.js';
import { gameController } from '../src/controller/gameController';
import { Simulator } from '../src/game/simulator';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe, TRIBES } from '../src/game/tribes';
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
  const allTribes: Tribe[] = [Tribe.Cats, Tribe.Warriors, Tribe.Barbarians, Tribe.Villagers, Tribe.Forest, Tribe.Aqua];
  const unitTextures = Object.fromEntries(
    allTribes.map((t) => [t, { warrior: unitTex, rider: unitTex, archer: unitTex, swordsman: unitTex, shield: unitTex }]),
  ) as TextureSet['unitTextures'];
  const shipTextures = Object.fromEntries(
    allTribes.map((t) => [t, { 1: unitTex, 2: unitTex, 3: unitTex }]),
  ) as TextureSet['shipTextures'];
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
    portTextures: { e: unitTex, ne: unitTex, nw: unitTex, w: unitTex, sw: unitTex, se: unitTex },
    bridgeTextures: { nw: unitTex, ne: unitTex, we: unitTex },
    freePortTexture: tex(40, 40),
    templeTextures: { 1: unitTex, 2: unitTex, 3: unitTex, 4: unitTex },
    forestTempleTextures: { 1: unitTex, 2: unitTex, 3: unitTex, 4: unitTex },
    shipTextures,
    bonusTexture: tileTex(50, 50),
    villageConnectedTexture: null,
    captureTexture: null,
  };
}

function tile(q: number, r: number, explored: number[]): MapTile {
  return {
    q, r, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
    roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: explored,
  };
}
function makeUnit(id: string, owner: number, q: number, r: number): Unit {
  return {
    id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: UNIT_TYPES.warrior.maxHp, attack: UNIT_TYPES.warrior.attack, attackDistance: UNIT_TYPES.warrior.attackDistance, spawnVillage: { q, r },
  };
}

describe('client discovery notification', () => {
  let gc: unknown;
  let mapView: MapView;
  let players: Player[];
  let realRaf: typeof requestAnimationFrame | undefined;
  let rafNow = 0;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    rafNow = 0;
    const tiles: MapTile[] = [];
    for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) tiles.push(tile(q, r, [0, 1]));
    const map: GameMap = { radius: 2, tiles, spawns: [] };
    const myUnit = makeUnit('my', 1, 0, 0);
    map.tiles.find((t) => t.q === 0 && t.r === 0)!.unit = myUnit;
    map.tiles.find((t) => t.q === 0 && t.r === 0)!.ownedBy = 1;
    // Enemy unit on a tile explored by player 1 -> discovery for player 1.
    const enemyTile = map.tiles.find((t) => t.q === 2 && t.r === 0)!;
    enemyTile.unit = makeUnit('enemy', 0, 2, 0);
    enemyTile.ownedBy = 0;
    players = [
      { index: 0, tribe: Tribe.Warriors, isHuman: true, name: 'H', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true, knownTribes: [Tribe.Warriors] },
      { index: 1, tribe: Tribe.Cats, isHuman: true, name: 'C', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true, knownTribes: [Tribe.Cats] },
    ];
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    // Player 1 discovers the enemy tribe via a command that triggers syncDiscoveries.
    sim.applyCommand({ type: 'endTurn' });
    sim.drainEvents();
    sim.applyCommand({ type: 'heal', unitId: 'nope' });
    sim.drainEvents();

    const app = { screen: { width: 800, height: 600 }, ticker: { add: (): void => {}, remove: (): void => {} } } as unknown as Application;
    const textures = buildTextures(map);
    mapView = new MapView(app, textures, 40, 0.5, 2);

    useGameStore.setState({ localPlayerIndex: 1, netMode: 'client', players, centerMessage: null });
    gc = gameController as unknown as Record<string, unknown>;
    (gc as { app: unknown }).app = app;
    (gc as { sim: unknown }).sim = sim;
    (gc as { mapView: unknown }).mapView = mapView;
    (gc as { mapRoot: unknown }).mapRoot = new Container();
    (gc as { textures: unknown }).textures = textures;
    (gc as { hiddenUnitIds: Set<string> }).hiddenUnitIds.clear();
    (gc as { knownTribeIds: Set<number> }).knownTribeIds.clear();
    installCamera(gc, app, map.radius);
    (gc as { taskQueue: Promise<void> }).taskQueue = Promise.resolve();

    realRaf = (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame!;
    (globalThis as { performance: Performance }).performance.now = () => rafNow;
    (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = ((cb: (t: number) => void) => {
      rafNow += 30;
      return setTimeout(() => cb(rafNow), 0);
    }) as typeof requestAnimationFrame;
  });

  afterEach(() => {
    if (realRaf) (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = realRaf;
    mapView.destroy();
  });

  it('announces a tribe the client discovers in a later state snapshot', async () => {
    const enemyTribeName = TRIBES.find((t) => t.id === Tribe.Warriors)!.name;
    const sim = (gc as { sim: Simulator }).sim!;
    const onMsg = (gameController as unknown as { onHostMessage: (m: { type: string; state?: unknown; playerIndex?: number }) => void }).onHostMessage;
    // First snapshot: game start, no discoveries yet -> seeds silently.
    players[1]!.knownTribes = [Tribe.Cats];
    onMsg.call(gameController, { type: 'state', state: sim.snapshot(), playerIndex: 1 });
    await new Promise((r) => setTimeout(r, 20));
    expect(useGameStore.getState().centerMessage).toBeNull();
    // Second snapshot: the discovery has been persisted -> notify.
    players[1]!.knownTribes = [Tribe.Cats, Tribe.Warriors];
    onMsg.call(gameController, { type: 'state', state: sim.snapshot(), playerIndex: 1 });
    await new Promise((r) => setTimeout(r, 1200));
    expect(useGameStore.getState().centerMessage).toBe(`You meet ${enemyTribeName}!`);
  });

  it('animates the client own unit move when presenting events', async () => {
    const sim = (gc as { sim: Simulator }).sim!;
    expect(sim.applyCommand({ type: 'move', unitId: 'my', q: 1, r: 0 })).toBe(true);
    const events = sim.drainEvents();
    const present = (gc as { presentEvents: (events: GameEvent[], pre: Set<string>) => Promise<void> }).presentEvents;
    const p = present.call(gc as never, events, new Set());
    // The moved unit is hidden while the ghost walks.
    expect((gc as { hiddenUnitIds: Set<string> }).hiddenUnitIds.has('my')).toBe(true);
    await p;
    // After the animation the unit is revealed.
    expect((gc as { hiddenUnitIds: Set<string> }).hiddenUnitIds.has('my')).toBe(false);
  });

  it('still animates the own move in the full state-then-events client flow', async () => {
    const sim = (gc as { sim: Simulator }).sim!;
    expect(sim.applyCommand({ type: 'move', unitId: 'my', q: 1, r: 0 })).toBe(true);
    const events = sim.drainEvents();
    const onMsg = (gameController as unknown as { onHostMessage: (m: { type: string; state?: unknown; playerIndex?: number; events?: GameEvent[] }) => void }).onHostMessage;
    onMsg.call(gameController, { type: 'state', state: sim.snapshot(), playerIndex: 1 });
    onMsg.call(gameController, { type: 'events', events });
    await new Promise((r) => setTimeout(r, 300));
    expect((gc as { hiddenUnitIds: Set<string> }).hiddenUnitIds.has('my')).toBe(false);
    const destView = (mapView as unknown as { tileViews: Map<string, { unitSprite: { visible: boolean } | null }> }).tileViews.get(axialKey({ q: 1, r: 0 }))!;
    expect(destView.unitSprite?.visible).toBe(true);
  });
});
