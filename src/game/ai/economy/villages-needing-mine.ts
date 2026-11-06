import { BuildingKind, SkillId } from '@enums';
import type { GameMap, MapTile } from '../../map/map-gen';
import { isMountainType } from '../../map/tile-types';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { isClaimedBy } from '../situation/is-claimed-by';

/** Own villages that could have a mine (Smithery learned, an unbuilt mountain
 *  in their territory) but have none yet. */
export function villagesNeedingMine(map: GameMap, player: Player): MapTile[] {
  if (!hasSkill(player, SkillId.SMITHERY)) return [];
  const out: MapTile[] = [];
  for (const v of map.tiles) {
    if (!v.settlement || v.settlement.owner !== player.index) continue;
    let hasMine = false;
    let site = false;
    for (const t of map.tiles) {
      if (t.ownedBy !== player.index || !isClaimedBy(t, v)) continue;
      if (t.building?.kind === BuildingKind.MINE) hasMine = true;
      else if (!t.building && !t.settlement && isMountainType(t.terrain)) site = true;
    }
    if (site && !hasMine) out.push(v);
  }
  return out;
}
