import type { Application } from 'pixi.js';
import { allTiles } from '../../src/game/hex';
import { Biome } from '../../src/game/biomes';
import { GameMap, MapTile } from '../../src/game/mapGen';
import { TileType } from '../../src/game/tileTypes';
import { Unit, UNIT_TYPES, UNIT_ATTACK, UNIT_ATTACK_DISTANCE, UnitType } from '../../src/game/units';
import { CameraController } from '../../src/controller/cameraController';

export function makeTestMap(radius = 2): GameMap {
  const tiles: MapTile[] = allTiles(radius).map((t) => ({
    q: t.q,
    r: t.r,
    terrain: TileType.GrasslandLand,
    biome: Biome.Grassland,
    settlement: null,
    building: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
    exploredBy: [0, 1, 2, 3],
  }));
  return { radius, tiles, spawns: [] };
}

export function tileAt(map: GameMap, q: number, r: number): MapTile | undefined {
  return map.tiles.find((t) => t.q === q && t.r === r);
}

export function installCamera(gc: unknown, app: Application, radius = 2): CameraController {
  const camera = new CameraController({
    app,
    hexSize: 40,
    screenWidth: () => 800,
    mapHeight: () => 600,
    mapRadius: () => radius,
    onCameraChange: () => {},
  });
  camera.baseScale = 1;
  camera.zoom = 1;
  camera.pan = { x: 400, y: 300 };
  (gc as { camera: CameraController | null }).camera = camera;
  return camera;
}

export function makeUnit(id: string, owner: number, type: UnitType, q: number, r: number): Unit {
  return {
    id,
    owner,
    type,
    q,
    r,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: UNIT_TYPES[type].maxHp,
    attack: UNIT_ATTACK[type],
    attackDistance: UNIT_ATTACK_DISTANCE[type],
    defence: UNIT_TYPES[type].defence,
    spawnVillage: null,
  };
}
