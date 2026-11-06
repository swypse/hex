import { BuildingKind, UnitType } from '@enums';
import { hexDistance, hexNeighbors } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import { tileAt } from '../../map/tile-index';
import { isWaterType } from '../../map/tile-types';
import { isShip, shipAttackDistance } from '../../units/ship';
import { type Unit, UNIT_ATTACK_DISTANCE } from '../../units/units';
import type { EnemyUnit } from './situation';

export interface NavalEnemy {
  tile: MapTile;
  unit: Unit;
  distance: number;
}

/** A unit that fights from water: a pirate or any unit currently on a ship. */
export function isNavalEnemy(unit: Unit): boolean {
  return unit.type === UnitType.PIRATE || unit.shipLevel !== undefined;
}

/** Farthest range from which a naval enemy can hit a tile this turn. */
function navalStrikeRange(unit: Unit): number {
  return isShip(unit) ? shipAttackDistance(unit) : UNIT_ATTACK_DISTANCE[unit.type];
}

/** True when a tile lies within the attack range of any listed naval enemy
 *  (terrain-ignoring). Used to keep fresh spawns and land units out of a
 *  pirate's reach. */
function navalCanStrikeTile(tile: MapTile, navalEnemies: NavalEnemy[]): boolean {
  return navalEnemies.some((e) => hexDistance(tile, e.tile) <= navalStrikeRange(e.unit));
}

/** True when `tile` is a land tile bordering water that a naval enemy in
 *  `navalEnemies` can currently hit with an attack. */
export function coastExposedTile(map: GameMap, tile: MapTile, navalEnemies: NavalEnemy[]): boolean {
  if (isWaterType(tile.terrain)) return false;
  const isCoast = hexNeighbors(tile).some((n) => {
    const nt = tileAt(map, n.q, n.r);
    return nt !== undefined && isWaterType(nt.terrain);
  });
  if (!isCoast) return false;
  return navalCanStrikeTile(tile, navalEnemies);
}

function nearestOwnNavalTarget(map: GameMap, playerIndex: number, from: MapTile): number {
  let best = Infinity;
  for (const t of map.tiles) {
    const ownUnit = t.unit !== null && t.unit.owner === playerIndex;
    const ownSettlement = t.settlement !== null && t.settlement.owner === playerIndex;
    const ownPort = t.building !== null && t.building.kind === BuildingKind.PORT && t.ownedBy === playerIndex;
    if (ownUnit || ownSettlement || ownPort) {
      const d = hexDistance(from, t);
      if (d < best) best = d;
    }
  }
  return best;
}

export function collectNavalThreats(map: GameMap, playerIndex: number, enemies: EnemyUnit[], radius: number): NavalEnemy[] {
  const out: NavalEnemy[] = [];
  for (const e of enemies) {
    if (!isNavalEnemy(e.unit)) continue;
    const distance = nearestOwnNavalTarget(map, playerIndex, e.tile);
    if (distance <= radius) out.push({ tile: e.tile, unit: e.unit, distance });
  }
  return out.sort((a, b) => a.distance - b.distance);
}
