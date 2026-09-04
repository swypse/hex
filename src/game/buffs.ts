import { GameMap, MapTile } from './mapGen';
import { isShip } from './ship';
import { isForestType } from './tileTypes';
import { Unit } from './units';

export type BuffId = 'waterProtection' | 'forestProtection';

export const TEMPLE_BUFF_THRESHOLD = 3;

export const BUFF_INFO: Record<BuffId, { name: string; icon: string; tooltip: string }> = {
  waterProtection: { name: 'Water Protection', icon: 'water-protection.png', tooltip: 'Water Protection: -10 dmg for ships' },
  forestProtection: { name: 'Forest Protection', icon: 'forest-protection.png', tooltip: 'Forest Protection: -10 dmg for units in forest' },
};

export function activeBuffs(map: GameMap, playerIndex: number): BuffId[] {
  let water = 0;
  let forest = 0;
  for (const t of map.tiles) {
    if (t.ownedBy !== playerIndex || !t.building) continue;
    if (t.building.kind === 'temple') water++;
    else if (t.building.kind === 'forestTemple') forest++;
  }
  const buffs: BuffId[] = [];
  if (water >= TEMPLE_BUFF_THRESHOLD) buffs.push('waterProtection');
  if (forest >= TEMPLE_BUFF_THRESHOLD) buffs.push('forestProtection');
  return buffs;
}

export function damageReduction(map: GameMap, unit: Unit, tile: MapTile): number {
  if (unit.owner < 0) return 0;
  const buffs = activeBuffs(map, unit.owner);
  let reduction = 0;
  if (buffs.includes('waterProtection') && isShip(unit)) reduction += 10;
  if (buffs.includes('forestProtection') && isForestType(tile.terrain)) reduction += 10;
  return reduction;
}
