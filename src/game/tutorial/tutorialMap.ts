import { allTiles, axialKey, hexDistance } from '../hex';
import { Biome } from '../biomes';
import { GameMap, MapTile } from '../mapGen';
import { TileType } from '../tileTypes';
import { claimTileForVillage } from '../claim';
import { Player } from '../players';
import { EMPTY_STATS } from '../score';
import { makeUnit } from '../units';
import { Tribe } from '../tribes';

export const TUTORIAL_RADIUS = 5;
export const TUTORIAL_CAPITAL = { q: 0, r: 0 };
export const TUTORIAL_PORT_TILE = { q: 1, r: 0 };
export const TUTORIAL_START_WARRIOR_ID = 'tutor-warrior';
export const TUTORIAL_ENEMY_WARRIOR_ID = 'tutor-enemy-warrior';
export const TUTORIAL_ENEMY_SHIP_ID = 'tutor-enemy-ship';
export const TUTORIAL_ARCHER_ENEMY_PREFERRED = { q: -3, r: 1 };
export const TUTORIAL_SHIP_ENEMY_PREFERRED = { q: 4, r: 0 };
// Temporary alias for the director during the migration; Task 3 switches the
// director to TUTORIAL_ARCHER_ENEMY_PREFERRED and removes this line.
export const TUTORIAL_ENEMY_PREFERRED = TUTORIAL_ARCHER_ENEMY_PREFERRED;
export const TUTORIAL_HUMAN = 0;
export const TUTORIAL_ENEMY_PLAYER = 1;
export const TUTORIAL_WATER_TILES: { q: number; r: number }[] = [
  { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }, { q: 4, r: -1 },
];

function grassTile(q: number, r: number): MapTile {
  return {
    q,
    r,
    terrain: TileType.GrasslandLand,
    biome: Biome.Grassland,
    height: 0.2,
    settlement: null,
    building: null,
    roadOwner: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
    exploredBy: [TUTORIAL_HUMAN],
    bonus: null,
  };
}

export function buildTutorialMap(): GameMap {
  const tiles: MapTile[] = allTiles(TUTORIAL_RADIUS).map((c) => grassTile(c.q, c.r));
  const tileMap = new Map<string, MapTile>(tiles.map((t) => [axialKey(t), t]));

  const capital = tileMap.get(axialKey(TUTORIAL_CAPITAL))!;
  capital.settlement = {
    owner: TUTORIAL_HUMAN,
    level: 1,
    captureReady: false,
    name: 'Tutorial Village',
    capital: true,
  };
  capital.unit = makeUnit(TUTORIAL_HUMAN, 'warrior', TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r, {
    id: TUTORIAL_START_WARRIOR_ID,
    spawnVillage: { q: TUTORIAL_CAPITAL.q, r: TUTORIAL_CAPITAL.r },
  });

  // Sawmill tile: land at (0,1) next to a forest at (-1,1).
  tileMap.get(axialKey({ q: -1, r: 1 }))!.terrain = TileType.GrasslandForest;
  // Mine tile: mountain at (2,-2) (claim radius 2 once upgraded).
  tileMap.get(axialKey({ q: 2, r: -2 }))!.terrain = TileType.GrasslandMountain;

  // East sea: water right next to the capital, open water stretching east.
  for (const w of TUTORIAL_WATER_TILES) {
    const tile = tileMap.get(axialKey(w));
    if (tile) {
      tile.terrain = TileType.Water;
      tile.height = 0;
    }
  }

  // Cosmetic terrain variety on outer tiles, away from every tile the
  // tutorial uses: movement, buildings, the sea, and the scripted enemies.
  const variety: { q: number; r: number; terrain: TileType }[] = [
    { q: 0, r: 3, terrain: TileType.DesertLand },
    { q: 1, r: 2, terrain: TileType.TaigaLand },
    { q: -3, r: 1, terrain: TileType.RainforestLand },
    { q: -1, r: 3, terrain: TileType.RainforestForest },
    { q: -3, r: 0, terrain: TileType.DesertMountain },
    { q: 3, r: -1, terrain: TileType.TundraForest },
  ];
  for (const v of variety) {
    const tile = tileMap.get(axialKey(v));
    if (tile) tile.terrain = v.terrain;
  }

  // Level-1 claim (radius 1) exactly like generateMap does.
  for (const t of tileMap.values()) {
    if (hexDistance(t, TUTORIAL_CAPITAL) <= 1) claimTileForVillage(t, capital);
  }

  const spawns = [
    { start: { ...TUTORIAL_CAPITAL }, free: { q: 3, r: 0 } },
    { start: { q: -3, r: 2 }, free: { q: -3, r: 3 } },
  ];
  return { radius: TUTORIAL_RADIUS, tiles: [...tileMap.values()], spawns };
}

export function buildTutorialPlayers(): Player[] {
  const human: Player = {
    index: TUTORIAL_HUMAN,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'You',
    resources: { money: 250, wood: 60, stone: 60, ore: 30 },
    score: 0,
    kills: 0,
    skills: [],
    isActive: true,
    knownTribes: [Tribe.Villagers],
    stats: { ...EMPTY_STATS },
  };
  const dummy: Player = {
    index: TUTORIAL_ENEMY_PLAYER,
    tribe: Tribe.Warriors,
    isHuman: false,
    name: 'Warriors',
    resources: { money: 0, wood: 0, stone: 0, ore: 0 },
    score: 0,
    kills: 0,
    skills: [],
    isActive: false,
    knownTribes: [Tribe.Warriors],
    stats: { ...EMPTY_STATS },
  };
  return [human, dummy];
}
