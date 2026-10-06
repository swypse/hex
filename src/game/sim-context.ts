import type { GameEvent } from './events';
import type { GameMap, MapTile } from './map/map-gen';
import type { Player } from './players';
import type { PlayerStats } from './score';

/** What the simulator's subsystems (pirates, bonuses, environment) read and call on it. */
export interface SimContext {
  readonly map: GameMap;
  readonly players: Player[];
  readonly turn: number;
  readonly currentPlayer: Player;
  readonly rng: () => number;
  emit(e: GameEvent): void;
  statsOf(player: Player): PlayerStats;
  emitScoreFly(playerIndex: number, amount: number, tile: MapTile): void;
}
