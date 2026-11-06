import { AiStance } from '@enums';
import type { MapTile } from '../../map/map-gen';
import type { Unit } from '../../units/units';
import type { NavalEnemy } from './naval-threats';

export interface EnemyUnit {
  tile: MapTile;
  unit: Unit;
}

export interface VillageDanger {
  village: MapTile;
  /** Smallest number of enemy turns before an enemy can occupy the village. */
  enemyTurns: number;
}

export interface FreeVillageTarget {
  village: MapTile;
  distance: number;
}

export interface AiSituation {
  stance: AiStance;
  enemies: EnemyUnit[];
  /** Empty own villages reachable within the guard window. */
  dangers: VillageDanger[];
  endangered: boolean;
  frontTarget: MapTile | null;
  freeVillages: FreeVillageTarget[];
  ownPower: number;
  enemyPower: number;
  navalThreat: boolean;
  navalEnemies: NavalEnemy[];
  nearestNaval: NavalEnemy | null;
}
