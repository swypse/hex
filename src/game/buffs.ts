import { GameMap, MapTile } from './mapGen';
import { isShip } from './ship';
import { isForestType } from './tileTypes';
import { Unit } from './units';

export type BuffId = 'waterProtection' | 'forestProtection';

export const TEMPLE_BUFF_THRESHOLD = 3;

/** Defense a unit gets while standing in its own village. */
export const VILLAGE_DEFENSE = 5;

export const BUFF_INFO: Record<BuffId, { name: string; icon: string; tooltip: string; description: string }> = {
  waterProtection: {
    name: 'Water Protection',
    icon: 'water-protection.png',
    tooltip: 'Water Protection: -10 dmg for ships',
    description: 'Ships you control take 10 less damage from enemy attacks. Unlocks with 3 water temples.',
  },
  forestProtection: {
    name: 'Forest Protection',
    icon: 'forest-protection.png',
    tooltip: 'Forest Protection: -10 dmg for units in forest',
    description: 'Your units in forest tiles take 10 less damage from enemy attacks. Unlocks with 3 forest temples.',
  },
};

/** Number of owned temples of the kind that feeds `buff`. */
export function templeCount(map: GameMap, playerIndex: number, buff: BuffId): number {
  const kind = buff === 'waterProtection' ? 'temple' : 'forestTemple';
  let n = 0;
  for (const t of map.tiles) {
    if (t.ownedBy === playerIndex && t.building?.kind === kind) n++;
  }
  return n;
}

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
  if (tile.settlement?.wall && tile.settlement.owner === unit.owner) reduction += 3;
  if (tile.settlement && tile.settlement.owner === unit.owner) reduction += VILLAGE_DEFENSE;
  return reduction;
}
