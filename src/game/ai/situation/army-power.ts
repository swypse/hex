import { isExploredFor } from '../../map/explore';
import type { GameMap } from '../../map/map-gen';
import { attackDamage } from '../../units/combat';

export function enemyPower(map: GameMap, playerIndex: number): number {
  let total = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === playerIndex || !isExploredFor(t, playerIndex)) continue;
    if (t.unit.isStealthed === true) continue;
    total += attackDamage(t.unit);
  }
  return total;
}

export function ownPower(map: GameMap, playerIndex: number): number {
  let total = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner !== playerIndex) continue;
    total += attackDamage(t.unit);
  }
  return total;
}

export function ownUnitCount(map: GameMap, playerIndex: number): number {
  let n = 0;
  for (const t of map.tiles) if (t.unit && t.unit.owner === playerIndex) n += 1;
  return n;
}
