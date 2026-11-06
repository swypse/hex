import { isExploredFor } from '../../map/explore';
import type { GameMap } from '../../map/map-gen';
import type { EnemyUnit } from './situation';

export function visibleEnemies(map: GameMap, playerIndex: number): EnemyUnit[] {
  const out: EnemyUnit[] = [];
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === playerIndex) continue;
    if (t.unit.isStealthed === true) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    out.push({ tile: t, unit: t.unit });
  }
  return out;
}
