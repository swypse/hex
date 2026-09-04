import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { Unit } from '../src/game/units';
import { buildRoad, canBuildRoad, ROAD_COST, isVillageRoadConnected } from '../src/game/roads';
import { SkillId } from '../src/game/skills';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { SeededRandom } from '../src/util/random';

function tile(
  q: number,
  r: number,
  terrain: TileType,
  opts: { settlement?: Settlement | null; unit?: Unit | null; roadOwner?: number | null; building?: MapTile['building'] | null } = {},
): MapTile {
  return {
    q, r, terrain,
    settlement: opts.settlement ?? null,
    unit: opts.unit ?? null,
    ownedBy: opts.settlement ? opts.settlement.owner : null,
    claimedByVillage: null,
    building: opts.building ?? null,
    roadOwner: opts.roadOwner ?? null,
  };
}

function villageTile(q: number, r: number, owner: number): MapTile {
  return tile(q, r, TileType.GrasslandLand, { settlement: { owner, level: 1, captureReady: false } });
}

function player(money = 100, wood = 10, stone = 10, index = 0, skills: SkillId[] = []): Player {
  return {
    index, tribe: Tribe.Villagers, isHuman: true, name: 'p',
    resources: { wood, stone, money, ore: 0 },
    score: 0, kills: 0, skills, isActive: true,
  };
}

function mapWith(tiles: MapTile[]): GameMap {
  return { radius: 4, tiles, spawns: [] };
}

describe('roads', () => {
  it('costs 5 wood, 2 stone, and 10 money', () => {
    expect(ROAD_COST).toEqual({ wood: 5, stone: 2, money: 10, ore: 0 });
  });

  it('builds on a hex adjacent to an owned village', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.GrasslandLand),
    ]);
    expect(canBuildRoad(map, map.tiles[1]!, player(100,10,10,0,['forestry','roads']))).toBe(true);
    expect(buildRoad(map, map.tiles[1]!, player(100,10,10,0,['forestry','roads']))).toBe(true);
    expect(map.tiles[1]!.roadOwner).toBe(0);
  });

  it('builds on a hex adjacent to an owned road', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.GrasslandLand, { roadOwner: 0 }),
      tile(2, 0, TileType.GrasslandLand),
    ]);
    expect(canBuildRoad(map, map.tiles[2]!, player(100,10,10,0,['forestry','roads']))).toBe(true);
  });

  it('rejects hexes not adjacent to a village or road', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(3, 0, TileType.GrasslandLand),
    ]);
    expect(canBuildRoad(map, map.tiles[1]!, player(100,10,10,0,['forestry','roads']))).toBe(false);
  });

  it('rejects water, village, building, existing-road, and enemy-occupied hexes', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.Water),
      tile(1, -1, TileType.GrasslandLand, { settlement: { owner: 0, level: 1, captureReady: false } }),
      tile(2, -1, TileType.GrasslandLand, { roadOwner: 0 }),
      tile(0, -1, TileType.GrasslandLand, { unit: { id: 'e', owner: 1, type: 'warrior', q: 0, r: -1, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: null } }),
    ]);
    for (const t of [map.tiles[1]!, map.tiles[2]!, map.tiles[3]!, map.tiles[4]!]) {
      expect(canBuildRoad(map, t, player(100,10,10,0,['forestry','roads']))).toBe(false);
    }
  });

  it('builds roads on sawmill, mine, and temple tiles', () => {
    const buildings: MapTile['building'][] = [
      { kind: 'sawmill', level: 1 },
      { kind: 'mine', level: 1 },
      { kind: 'temple', level: 1 },
      { kind: 'forestTemple', level: 1 },
    ];
    for (const building of buildings) {
      const map = mapWith([
        villageTile(0, 0, 0),
        tile(1, 0, TileType.GrasslandLand, { building }),
      ]);
      expect(canBuildRoad(map, map.tiles[1]!, player(100, 10, 10, 0, ['forestry', 'roads']))).toBe(true);
    }
  });

  it('does not build roads on a port tile', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.GrasslandLand, { building: { kind: 'port', level: 1 } }),
    ]);
    expect(canBuildRoad(map, map.tiles[1]!, player(100, 10, 10, 0, ['forestry', 'roads']))).toBe(false);
  });

  it('builds a road adjacent to an owned port', () => {
    const map = mapWith([
      tile(0, 0, TileType.Water, { building: { kind: 'port', level: 1 } }),
      tile(1, 0, TileType.GrasslandLand),
    ]);
    map.tiles[0]!.ownedBy = 0;
    const p = player(100, 10, 10, 0, ['forestry', 'roads']);
    expect(canBuildRoad(map, map.tiles[1]!, p)).toBe(true);
    expect(buildRoad(map, map.tiles[1]!, p)).toBe(true);
  });

  it('does not build a road adjacent to another player port', () => {
    const map = mapWith([
      tile(0, 0, TileType.Water, { building: { kind: 'port', level: 1 } }),
      tile(1, 0, TileType.GrasslandLand),
    ]);
    map.tiles[0]!.ownedBy = 1;
    expect(canBuildRoad(map, map.tiles[1]!, player(100, 10, 10, 0, ['forestry', 'roads']))).toBe(false);
  });

  it('does not pay when the build is rejected', () => {
    const map = mapWith([villageTile(0, 0, 0), tile(3, 0, TileType.GrasslandLand)]);
    const p = player(100, 10, 10, 0, ['forestry', 'roads']);
    const before = p.resources.wood;
    expect(buildRoad(map, map.tiles[1]!, p)).toBe(false);
    expect(p.resources.wood).toBe(before);
  });

  it('requires the Roads skill', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.GrasslandLand),
    ]);
    expect(canBuildRoad(map, map.tiles[1]!, player())).toBe(false);
    expect(canBuildRoad(map, map.tiles[1]!, player(100, 10, 10, 0, ['forestry', 'roads']))).toBe(true);
  });

  it('simulator buildRoad emits roadBuilt and sets roadOwner', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.GrasslandLand),
    ]);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.skills = ['forestry', 'roads'];
    players[0]!.resources = { wood: 10, stone: 10, money: 20, ore: 0 };
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'buildRoad', q: 1, r: 0 })).toBe(true);
    expect(map.tiles[1]!.roadOwner).toBe(0);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'roadBuilt')).toBe(true);
  });

  it('does not connect a village with no roads', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      villageTile(1, 0, 1),
    ]);
    expect(isVillageRoadConnected(map, map.tiles[0]!)).toBe(false);
  });

  it('does not connect a village when its road path dead-ends', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.GrasslandLand, { roadOwner: 0 }),
      tile(2, 0, TileType.GrasslandLand),
    ]);
    expect(isVillageRoadConnected(map, map.tiles[0]!)).toBe(false);
  });

  it("connects a village whose road path reaches another tribe's village", () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.GrasslandLand, { roadOwner: 0 }),
      villageTile(2, 0, 1),
    ]);
    expect(isVillageRoadConnected(map, map.tiles[0]!)).toBe(true);
  });

  it('connects both villages at the ends of the completed road path', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.GrasslandLand, { roadOwner: 0 }),
      tile(2, 0, TileType.GrasslandLand, { roadOwner: 0 }),
      villageTile(3, 0, 1),
    ]);
    expect(isVillageRoadConnected(map, map.tiles[0]!)).toBe(true);
    expect(isVillageRoadConnected(map, map.tiles[3]!)).toBe(true);
  });

  it('does not connect villages of the same tribe', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.GrasslandLand, { roadOwner: 0 }),
      villageTile(2, 0, 0),
    ]);
    expect(isVillageRoadConnected(map, map.tiles[0]!)).toBe(false);
  });
});

describe('bridges as roads', () => {
  function bridgeMap(): MapTile[] {
    const bridge = tile(1, 0, TileType.Water, { roadOwner: 0 });
    bridge.bridge = { owner: 0, dir: 'we' };
    return [
      villageTile(0, 0, 0),
      bridge,
      villageTile(2, 0, 1),
    ];
  }

  it("canBuildRoad succeeds on a land tile adjacent to the builder's bridge", () => {
    const tiles = [
      villageTile(0, 0, 0),
      (() => {
        const bridge = tile(1, 0, TileType.Water, { roadOwner: 0 });
        bridge.bridge = { owner: 0, dir: 'we' };
        return bridge;
      })(),
      tile(2, 0, TileType.GrasslandLand),
    ];
    const map = mapWith(tiles);
    expect(canBuildRoad(map, map.tiles[2]!, player(100, 10, 10, 0, ['forestry', 'roads']))).toBe(true);
  });

  it('isVillageRoadConnected crosses a bridge to another village', () => {
    const map = mapWith(bridgeMap());
    expect(isVillageRoadConnected(map, map.tiles[0]!)).toBe(true);
    expect(isVillageRoadConnected(map, map.tiles[2]!)).toBe(true);
  });
});
