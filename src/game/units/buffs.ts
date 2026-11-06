import { type GameMap, type MapTile } from '../map/map-gen';
import { hexNeighbors } from '../map/hex';
import { tileAt } from '../map/tile-index';
import { isTower, TOWER_AURA_DEFENSE } from '../economy/buildings';
import { isShip } from './ship';
import { isForestType } from '../map/tile-types';
import { type Unit } from './units';
import { t } from '../../i18n';
import { BuffId, BuildingKind } from '@enums';



const TEMPLE_BUFF_THRESHOLD = 3;

/** Defense a unit gets while standing in its own village. */
export const VILLAGE_DEFENSE = 8;

export const BUFF_INFO: Record<BuffId, { name: string; icon: string; tooltip: string; description: string }> = {
  waterProtection: {
    name: t('buff.waterProtection.name'),
    icon: 'water-protection.png',
    tooltip: t('buff.waterProtection.tooltip'),
    description: t('buff.waterProtection.desc'),
  },
  forestProtection: {
    name: t('buff.forestProtection.name'),
    icon: 'forest-protection.png',
    tooltip: t('buff.forestProtection.tooltip'),
    description: t('buff.forestProtection.desc'),
  },
};

export function activeBuffs(map: GameMap, playerIndex: number): BuffId[] {
  let water = 0;
  let forest = 0;
  for (const t of map.tiles) {
    if (t.ownedBy !== playerIndex || !t.building) continue;
    if (t.building.kind === BuildingKind.TEMPLE) water++;
    else if (t.building.kind === BuildingKind.FOREST_TEMPLE) forest++;
  }
  const buffs: BuffId[] = [];
  if (water >= TEMPLE_BUFF_THRESHOLD) buffs.push(BuffId.WATER_PROTECTION);
  if (forest >= TEMPLE_BUFF_THRESHOLD) buffs.push(BuffId.FOREST_PROTECTION);
  return buffs;
}

/** Whether the tile or a neighbour holds a tower of `owner` (its radius-1 defense aura). */
export function nearOwnTower(map: GameMap, tile: MapTile, owner: number): boolean {
  const isOwnTower = (t: MapTile | undefined): boolean => t !== undefined && isTower(t.building) && t.ownedBy === owner;
  return isOwnTower(tile) || hexNeighbors(tile).some((n) => isOwnTower(tileAt(map, n.q, n.r)));
}

export function damageReduction(map: GameMap, unit: Unit, tile: MapTile): number {
  if (unit.owner < 0) return 0;
  const buffs = activeBuffs(map, unit.owner);
  let reduction = 0;
  if (buffs.includes(BuffId.WATER_PROTECTION) && isShip(unit)) reduction += 10;
  if (buffs.includes(BuffId.FOREST_PROTECTION) && isForestType(tile.terrain)) reduction += 10;
  if (tile.settlement?.wall && tile.settlement.owner === unit.owner) reduction += 3;
  if (tile.settlement && tile.settlement.owner === unit.owner) reduction += VILLAGE_DEFENSE;
  if (nearOwnTower(map, tile, unit.owner)) reduction += TOWER_AURA_DEFENSE;
  return reduction;
}
