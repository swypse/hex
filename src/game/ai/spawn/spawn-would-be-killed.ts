import { UnitType } from '@enums';
import { isExploredFor } from '../../map/explore';
import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import { resolveCombat } from '../../units/combat';
import { isShip } from '../../units/ship';
import { makeUnit, unitMaxHp, type Unit } from '../../units/units';
import { enemyReach } from '../situation/enemy-reach';

/** Whether a fresh unit of `type` raised on `village` would be killed during
 *  the enemy's next turn: the damage of every visible enemy land unit that can
 *  reach the tile (adjacent units, archers, riders, knights, catapults...
 *  anything whose move + attack range covers it) is summed against the unit at
 *  full hp, with the village's defense bonus. Order, misses and counters are
 *  ignored. Ships and pirates are left out: the naval-threat spawns (catapult,
 *  shield) are made on purpose against them. */
export function spawnWouldBeKilled(map: GameMap, village: MapTile, playerIndex: number, type: UnitType): boolean {
  const ghost = makeUnit(playerIndex, type, village.q, village.r);
  return incomingDamage(map, village, playerIndex, ghost, true) >= unitMaxHp(ghost);
}

/** Summed damage the visible enemy land units that can reach `village` would
 *  deal to `unit` standing there (village defense bonus included; order,
 *  misses and counters ignored). With `stopAtDeath` the sum ends as soon as it
 *  reaches the unit's hp. */
export function incomingDamage(map: GameMap, village: MapTile, playerIndex: number, unit: Unit, stopAtDeath = false): number {
  const tile: MapTile = { ...village, unit };
  let damage = 0;
  for (const t of map.tiles) {
    const enemy = t.unit;
    if (!enemy || enemy.owner === playerIndex || enemy.owner < 0 || isShip(enemy)) continue;
    if (enemy.isStealthed === true || !isExploredFor(t, playerIndex)) continue;
    const reach = enemyReach(enemy);
    if (hexDistance(village, t) > reach.move + reach.attack) continue;
    damage += resolveCombat(map, enemy, tile).attackerDamage;
    if (stopAtDeath && damage >= unit.hp) break;
  }
  return damage;
}
