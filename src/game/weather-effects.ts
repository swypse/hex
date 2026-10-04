import { BuildingKind, UnitType } from '@enums';
import { BUILDING_MAX_HP } from './buildings';
import { axialKey, tilesInRange } from './hex';
import { type GameMap, type MapTile, tileMapByKey } from './map-gen';
import { isShip } from './ship';
import { WEATHER_RULES, type WeatherBuildingHit, type WeatherEvent, type WeatherUnitHit } from './weather';

export interface WeatherEffectReport {
  units: WeatherUnitHit[];
  buildings: WeatherBuildingHit[];
}

/** The map tiles inside an event's scope, in a fixed order. */
function tilesInScope(map: GameMap, event: WeatherEvent): MapTile[] {
  const byKey = tileMapByKey(map);
  const out: MapTile[] = [];
  for (const c of tilesInRange(event, event.radius)) {
    const tile = byKey.get(axialKey(c));
    if (tile) out.push(tile);
  }
  return out;
}

/** Deals `damage` to the unit standing on `tile`; removes it at 0 hp. */
function hurtUnit(tile: MapTile, damage: number): WeatherUnitHit {
  const unit = tile.unit!;
  unit.hp = Math.max(0, unit.hp - damage);
  const died = unit.hp <= 0;
  const hit: WeatherUnitHit = { unitId: unit.id, owner: unit.owner, q: tile.q, r: tile.r, damage, died };
  if (died) tile.unit = null;
  return hit;
}

/** Takes `damage` hp off the building on `tile`; removes it at 0 hp. */
function hurtBuilding(tile: MapTile, damage: number): WeatherBuildingHit {
  const building = tile.building!;
  const hp = (building.hp ?? BUILDING_MAX_HP) - damage;
  const destroyed = hp <= 0;
  if (destroyed) tile.building = null;
  else building.hp = hp;
  return { q: tile.q, r: tile.r, destroyed };
}

/** A storm's end-of-turn damage: every ship (pirate ships included) in scope
 *  takes `shipDamage`, and every port in scope takes `portDamage` on every
 *  `portEvery`-th turn of the storm. */
export function applyStormTurn(map: GameMap, storm: WeatherEvent): WeatherEffectReport {
  const rules = WEATHER_RULES.storm;
  const report: WeatherEffectReport = { units: [], buildings: [] };
  const portsHit = storm.age % rules.portEvery === 0;
  for (const tile of tilesInScope(map, storm)) {
    if (tile.unit && (isShip(tile.unit) || tile.unit.type === UnitType.PIRATE)) {
      report.units.push(hurtUnit(tile, rules.shipDamage));
    }
    if (portsHit && tile.building?.kind === BuildingKind.PORT) {
      report.buildings.push(hurtBuilding(tile, rules.portDamage));
    }
  }
  return report;
}

/** An earthquake's one strike: each building and each unit in scope is hit with
 *  probability `hitChance`. Villages and their walls are not buildings and are
 *  unaffected. */
export function applyEarthquake(map: GameMap, quake: WeatherEvent, rng: () => number): WeatherEffectReport {
  const rules = WEATHER_RULES.earthquake;
  const report: WeatherEffectReport = { units: [], buildings: [] };
  for (const tile of tilesInScope(map, quake)) {
    if (tile.building && rng() < rules.hitChance) report.buildings.push(hurtBuilding(tile, rules.buildingDamage));
    if (tile.unit && rng() < rules.hitChance) report.units.push(hurtUnit(tile, rules.unitDamage));
  }
  return report;
}
