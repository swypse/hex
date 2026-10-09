import { BuildingKind } from '@enums';
import { BUILDING_MAX_HP } from '../economy/buildings';
import { axialKey, hexDistance, hexNeighbors, type Axial } from '../map/hex';
import { type GameMap, type MapTile } from '../map/map-gen';
import { tileMapByKey } from '../map/tile-index';
import { forestToLand, isForestType } from '../map/tile-types';
import { randomInt } from '../../util/random';
import { type Unit } from '../units/units';
import { hurtBuilding, hurtUnit, type WeatherEffectReport } from './weather-effects';
import { WEATHER_RULES, type WeatherEvent } from './weather';

/** Tunable fire rules. */
export const FIRE_RULES = {
  /** Rounds a forest burns before it turns into plain land. */
  forestBurnTurns: 3,
  /** Chance per round that a forest next to a burning forest / building catches fire. */
  spreadChance: 0.5,
  /** Damage per round to a unit standing on a burning forest. */
  unitDamage: 10,
  /** Damage per round to a burning building (a burning bridge is lost after as many rounds as a building has hp). */
  buildingDamage: 1,
  /** Hexes around a unit (its own tile included) whose fire it can put out. */
  extinguishRange: 1,
} as const;

export interface FireTurnReport extends WeatherEffectReport {
  /** Tiles that caught fire by spreading this round. */
  ignited: Axial[];
  /** Tiles whose fire ended on its own (forest turned to land, building or bridge lost). */
  burnedOut: Axial[];
}

/** Buildings lightning and fire can burn (temples are spared). */
const FLAMMABLE_BUILDINGS: readonly BuildingKind[] = [
  BuildingKind.SAWMILL,
  BuildingKind.MINE,
  BuildingKind.PORT,
  BuildingKind.FARM,
  BuildingKind.GRANARY,
];

/** Whether the tile holds something that can burn: a forest, a flammable building or a bridge. */
export function isFlammable(tile: MapTile): boolean {
  if (isForestType(tile.terrain)) return true;
  if (tile.building && FLAMMABLE_BUILDINGS.includes(tile.building.kind)) return true;
  return tile.bridge !== undefined && tile.bridge !== null;
}

export function ignite(tile: MapTile): boolean {
  if (tile.fire || !isFlammable(tile)) return false;
  tile.fire = { age: 0 };
  return true;
}

/** One lightning strike on its target tile: a forest catches fire with
 *  `forestIgniteChance`, a building or bridge always does, and a unit takes
 *  `minUnitDamage`-`maxUnitDamage`. */
export function applyLightning(map: GameMap, strike: WeatherEvent, rng: () => number): WeatherEffectReport {
  const rules = WEATHER_RULES.lightning;
  const report: WeatherEffectReport = { units: [], buildings: [] };
  const tile = tileMapByKey(map).get(axialKey(strike));
  if (!tile) return report;
  if (isForestType(tile.terrain)) {
    if (rng() < rules.forestIgniteChance) ignite(tile);
  } else {
    ignite(tile);
  }
  if (tile.unit) report.units.push(hurtUnit(tile, randomInt(rules.minUnitDamage, rules.maxUnitDamage, rng)));
  return report;
}

/** Round end for every burning tile: a unit on a burning forest takes
 *  `unitDamage`, a burning building takes `buildingDamage`, a burning bridge or
 *  forest ages and is lost after its burn time; then each forest next to a tile
 *  that was burning catches fire with `spreadChance`. */
export function applyFireTurn(map: GameMap, rng: () => number): FireTurnReport {
  const report: FireTurnReport = { units: [], buildings: [], ignited: [], burnedOut: [] };
  const burning = map.tiles.filter((t) => t.fire);
  if (burning.length === 0) return report;
  const byKey = tileMapByKey(map);
  for (const tile of burning) {
    const forest = isForestType(tile.terrain);
    if (tile.unit && forest) report.units.push(hurtUnit(tile, FIRE_RULES.unitDamage));
    tile.fire!.age += 1;
    let out = false;
    if (tile.building) {
      const hit = hurtBuilding(tile, FIRE_RULES.buildingDamage);
      report.buildings.push(hit);
      out = hit.destroyed;
    } else if (tile.bridge) {
      if (tile.fire!.age >= BUILDING_MAX_HP) {
        tile.bridge = null;
        tile.roadOwner = null;
        out = true;
      }
    } else if (forest) {
      if (tile.fire!.age >= FIRE_RULES.forestBurnTurns) {
        tile.terrain = forestToLand(tile.terrain);
        out = true;
      }
    } else {
      out = true;
    }
    if (out) {
      tile.fire = null;
      report.burnedOut.push({ q: tile.q, r: tile.r });
    }
  }
  const caught = new Set<string>();
  for (const tile of burning) {
    for (const n of hexNeighbors(tile)) {
      const target = byKey.get(axialKey(n));
      if (!target || target.fire || !isForestType(target.terrain) || caught.has(axialKey(n))) continue;
      if (rng() >= FIRE_RULES.spreadChance) continue;
      caught.add(axialKey(n));
      ignite(target);
      report.ignited.push({ q: target.q, r: target.r });
    }
  }
  return report;
}

/** Burning tiles a unit can put out: its own tile and the adjacent ones. */
export function extinguishCells(map: GameMap, unit: Pick<Unit, 'q' | 'r'>): MapTile[] {
  return map.tiles.filter((t) => t.fire && hexDistance(t, unit) <= FIRE_RULES.extinguishRange);
}
