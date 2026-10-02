import type { Application } from 'pixi.js';
import { allTiles } from '../../src/game/hex';
import { Biome } from '../../src/game/biomes';
import { GameMap, MapTile } from '../../src/game/map-gen';
import { TileType } from '../../src/game/tile-types';
import { Unit, UNIT_TYPES, UNIT_ATTACK, UNIT_ATTACK_DISTANCE, UnitType } from '../../src/game/units';
import { CameraController } from '../../src/controller/camera-controller';
import type { Player } from '../../src/game/players';
import { capitalOf, stockOf } from '../../src/game/stock';

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
    defense: UNIT_TYPES[type].defense,
    spawnVillage: null,
  };
}

/** Sets a player's money and the materials of its capital the way a test used
 *  to set the whole player: `money` goes to the player, wood/stone/ore/food go
 *  into the player's capital (or first village). A map with no village of the
 *  player gets one on its last free tile so the materials have somewhere to
 *  live. Values given replace what was there; omitted ones are kept. */
export function giveResources(
  map: GameMap,
  player: Player,
  amounts: { money?: number; wood?: number; stone?: number; ore?: number; food?: number },
): MapTile | null {
  if (amounts.money !== undefined) player.resources.money = amounts.money;
  const hasMaterials = amounts.wood !== undefined || amounts.stone !== undefined || amounts.ore !== undefined || amounts.food !== undefined;
  if (!hasMaterials) return null;
  let village = capitalOf(map, player.index);
  if (!village) {
    village = [...map.tiles].reverse().find((t) => !t.settlement && !t.unit) ?? null;
    if (!village) return null;
    village.settlement = { owner: player.index, level: 1, captureReady: false, capital: true };
    village.ownedBy = player.index;
  }
  const stock = stockOf(village);
  if (amounts.wood !== undefined) stock.wood = amounts.wood;
  if (amounts.stone !== undefined) stock.stone = amounts.stone;
  if (amounts.ore !== undefined) stock.ore = amounts.ore;
  if (amounts.food !== undefined) stock.food = amounts.food;
  return village;
}
