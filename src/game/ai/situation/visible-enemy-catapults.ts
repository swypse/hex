import { UnitType } from '@enums';
import { isExploredFor } from '../../map/explore';
import type { GameMap } from '../../map/map-gen';

/** Enemy land catapults in sight: a knight kills one per hit and chains to the next. */
export function visibleEnemyCatapults(map: GameMap, playerIndex: number): number {
  let n = 0;
  for (const t of map.tiles) {
    const u = t.unit;
    if (!u || u.owner === playerIndex || u.owner < 0 || u.type !== UnitType.CATAPULT || u.shipLevel !== undefined) continue;
    if (u.isStealthed !== true && isExploredFor(t, playerIndex)) n += 1;
  }
  return n;
}
