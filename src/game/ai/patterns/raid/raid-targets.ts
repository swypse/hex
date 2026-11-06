import { isFoodBuilding, raidPriority } from '../../../economy/buildings';
import { roadCutSplits } from '../../../economy/roads';
import { isExploredFor } from '../../../map/explore';
import type { GameMap, MapTile } from '../../../map/map-gen';

/** Score weight of one raid-priority step; a move of one hex costs 1. */
export const PRIORITY_WEIGHT = 100;

/** Raid priority of an enemy road that is its owner's only link between villages. */
const ROAD_CUT_PRIORITY = 4;

/** Most targets a marching unit plans toward per evaluation (keeps the walk-field search cheap). */
export const MARCH_TARGETS = 3;

/** A raider-style player marches on more targets at once. */
export const RAIDER_MARCH_TARGETS = 6;

/** Enemy roads whose destruction splits the owner's village network, with no unit on them. */
export function roadCutTargets(map: GameMap, playerIndex: number): { tile: MapTile; priority: number }[] {
  const out: { tile: MapTile; priority: number }[] = [];
  for (const t of map.tiles) {
    const owner = t.roadOwner;
    if (owner === null || owner === undefined || owner < 0 || owner === playerIndex) continue;
    if (t.unit || isFoodBuilding(t.building) || !isExploredFor(t, playerIndex)) continue;
    if (roadCutSplits(map, t) > 0) out.push({ tile: t, priority: ROAD_CUT_PRIORITY });
  }
  return out;
}

/** Enemy buildings worth destroying that no unit stands on (a unit on the tile
 *  is a normal combat target), with their raid priority. */
export function raidTargets(map: { tiles: MapTile[] }, playerIndex: number): { tile: MapTile; priority: number }[] {
  const out: { tile: MapTile; priority: number }[] = [];
  for (const t of map.tiles) {
    const b = t.building;
    if (!b || t.unit) continue;
    if (t.ownedBy === null || t.ownedBy === undefined || t.ownedBy < 0 || t.ownedBy === playerIndex) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    const priority = raidPriority(b.kind);
    if (priority > 0) out.push({ tile: t, priority });
  }
  return out;
}
