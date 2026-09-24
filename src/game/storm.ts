import { GameMap, MapTile } from './map-gen';
import { isWaterType } from './tile-types';
import { Unit } from './units';

export const STORM_ATTACK = 60;

/** The village that claims `tile` (matching tile.claimedByVillage), or null. */
export function claimingVillage(map: GameMap, tile: MapTile): MapTile | null {
  const c = tile.claimedByVillage;
  if (!c) return null;
  return map.tiles.find((t) => t.q === c.q && t.r === c.r && t.settlement) ?? null;
}

/** Water tiles claimed by `village`. */
export function villageWaterTiles(map: GameMap, village: MapTile): MapTile[] {
  const vk = `${village.q},${village.r}`;
  return map.tiles.filter((t) => {
    if (!t.claimedByVillage) return false;
    if (`${t.claimedByVillage.q},${t.claimedByVillage.r}` !== vk) return false;
    return isWaterType(t.terrain);
  });
}

/** Whether the stormcaller can storm: it stands on an owned cell of its own
 *  village (a land tile OR a ship on an owned village water tile) and that
 *  village claims at least one water tile. */
export function stormEligible(map: GameMap, unit: Unit): boolean {
  if (unit.type !== 'stormcaller') return false;
  const tile = map.tiles.find((t) => t.unit === unit);
  if (!tile || tile.ownedBy !== unit.owner) return false;
  const village = claimingVillage(map, tile);
  if (!village || village.settlement?.owner !== unit.owner) return false;
  return villageWaterTiles(map, village).length >= 1;
}

/** Ships (enemy or pirate) standing on this stormcaller's village water tiles. */
export function stormTargetShips(map: GameMap, unit: Unit): MapTile[] {
  const tile = map.tiles.find((t) => t.unit === unit);
  if (!tile) return [];
  const village = claimingVillage(map, tile);
  if (!village) return [];
  return villageWaterTiles(map, village).filter(
    (t) => t.unit !== null && t.unit.shipLevel !== undefined && t.unit.owner !== unit.owner,
  );
}

/** Damage the storm deals to each affected ship: a full-hp hit at 60 attack
 *  against defense 0 → round((60/60) * 60 * 1.5) = 90. No miss, no counter. */
export function stormDamage(): number {
  return Math.round(STORM_ATTACK * 1.5);
}