import { isExploredFor } from './explore';
import { GameMap } from './map-gen';
import { Player } from './players';
import { Tribe, TribeInfo } from './tribes';

export const UNKNOWN_TRIBE_COLOR = 0x888888;

export function knownTribesFor(map: GameMap, players: Player[], playerIndex: number): Set<Tribe> {
  const known = new Set<Tribe>();
  const local = players[playerIndex];
  if (local) known.add(local.tribe);
  for (const tile of map.tiles) {
    if (!isExploredFor(tile, playerIndex)) continue;
    const unit = tile.unit;
    if (unit && unit.owner >= 0) {
      const owner = players[unit.owner];
      if (owner) known.add(owner.tribe);
    }
    const village = tile.settlement;
    if (village && village.owner !== null) {
      const owner = players[village.owner];
      if (owner) known.add(owner.tribe);
    }
  }
  return known;
}

export function territoryColor(tribe: TribeInfo, known: boolean): number {
  return known ? tribe.color : UNKNOWN_TRIBE_COLOR;
}
