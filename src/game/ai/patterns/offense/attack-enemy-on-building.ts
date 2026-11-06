import { BuildingKind } from '@enums';
import { isExploredFor } from '../../../map/explore';
import type { MapTile } from '../../../map/map-gen';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';
import { attackIntruder } from './attack-intruder';

export const ATTACK_ENEMY_ON_BUILDING_PATTERN: AiPattern = {
    // An enemy squatting on one of our buildings (a granary above all) is a
    // danger: it blocks production and the building is lost if it stays.
    id: 'attack-enemy-on-building',
    priority: 199,
    evaluate({ map, player, state }): AiAction[] | null {
      let target: MapTile | null = null;
      for (const t of map.tiles) {
        if (!t.building || t.ownedBy !== player.index || !t.unit || t.unit.owner === player.index) continue;
        if (!isExploredFor(t, player.index)) continue;
        if (!target || (t.building.kind === BuildingKind.GRANARY && target.building?.kind !== BuildingKind.GRANARY)) target = t;
      }
      return target ? attackIntruder(map, player, state, target) : null;
    },
  };
