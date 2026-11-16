import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import type { AiOperation } from '../types/operation';
import { REINFORCE_MAX_DIST, REINFORCE_VILLAGES } from './assault-outlook';

/** Own villages nearest the operation's target, which raise units to join the squad. */
export function reinforcementVillages(map: GameMap, player: Player, op: AiOperation): MapTile[] {
  return map.tiles
    .filter((t) => t.settlement?.owner === player.index && hexDistance(t, op.target) <= REINFORCE_MAX_DIST)
    .sort((a, b) => hexDistance(a, op.target) - hexDistance(b, op.target))
    .slice(0, REINFORCE_VILLAGES);
}
