import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { flagsFor } from '../config/flags';
import { bareThreatenedVillages } from './bare-threatened-villages';

export function garrisonReserveVillages(map: GameMap, player: Player): MapTile[] {
  return flagsFor(player).garrisonReserve ? bareThreatenedVillages(map, player) : [];
}
