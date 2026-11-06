import { SkillId } from '@enums';
import { buildingsInVillage, villageBuildingLimit } from '../../economy/village';
import type { GameMap, MapTile } from '../../map/map-gen';
import { isMountainType } from '../../map/tile-types';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { isClaimedBy } from '../situation/is-claimed-by';

/** Whether a village's building slots are full but it still claims an unbuilt
 *  mountain (a would-be mine) — upgrading it unlocks that slot. */
export function hasPendingMineSlot(map: GameMap, player: Player, v: MapTile): boolean {
  if (!v.settlement || !hasSkill(player, SkillId.SMITHERY)) return false;
  if (buildingsInVillage(map, v) < villageBuildingLimit(v.settlement.level)) return false;
  return claimsUnbuiltMountain(map, player, v);
}

function claimsUnbuiltMountain(map: GameMap, player: Player, v: MapTile): boolean {
  for (const t of map.tiles) {
    if (t.ownedBy !== player.index) continue;
    if (t.building || t.settlement) continue;
    if (!isMountainType(t.terrain)) continue;
    if (isClaimedBy(t, v)) return true;
  }
  return false;
}

/** Whether the tile's claiming village should keep its last free building slot
 *  for a mine (rather than a sawmill/temple) so it never stone-locks itself. */
export function reserveLastSlotForMine(map: GameMap, player: Player, tile: MapTile): boolean {
  const c = tile.claimedByVillage;
  if (!c) return false;
  const v = map.tiles.find((t) => t.q === c.q && t.r === c.r && t.settlement);
  if (!v?.settlement || v.settlement.owner !== player.index) return false;
  if (buildingsInVillage(map, v) + 1 < villageBuildingLimit(v.settlement.level)) return false;
  return claimsUnbuiltMountain(map, player, v);
}
