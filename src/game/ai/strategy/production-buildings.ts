import { BuildingKind } from '@enums';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';

export function productionBuildings(map: GameMap, player: Player): number {
  let n = 0;
  for (const t of map.tiles) {
    if (t.ownedBy !== player.index || !t.building) continue;
    if (t.building.kind === BuildingKind.MINE || t.building.kind === BuildingKind.SAWMILL) n += 1;
  }
  return n;
}
