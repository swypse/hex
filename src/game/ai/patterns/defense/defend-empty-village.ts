import { AiActionType, SpawnPreference } from '@enums';
import { landEnemyCanReach } from '../../situation/enemy-reach';
import { bestSpawnableUnitType } from '../../spawn/best-spawnable-unit-type';
import { spawnWouldBeKilled } from '../../spawn/spawn-would-be-killed';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const DEFEND_EMPTY_VILLAGE_PATTERN: AiPattern = {
    id: 'defend-empty-village',
    priority: 100,
    evaluate({ map, player, state }): AiAction[] | null {
      const villages = map.tiles.filter((t) => t.settlement && t.settlement.owner === player.index);
      for (const v of villages) {
        const k = key(v.q, v.r);
        if (state.spawned.has(k)) continue;
        if (v.unit) continue;
        if (!landEnemyCanReach(map, v, player.index)) continue;
        // Never raise a unit the enemies in reach would kill before it acts.
        let type = bestSpawnableUnitType(player, SpawnPreference.DEFENSE, map, v, (ty) => !spawnWouldBeKilled(map, v, player.index, ty));
        // A visible enemy that can walk onto the village next turn (its own move distance: a rider three
        // hexes away counts) takes it the moment it is empty: even a unit that may fall is better than
        // nothing, so the sturdiest defender is raised anyway.
        if (!type && landEnemyCanReach(map, v, player.index, 1)) type = bestSpawnableUnitType(player, SpawnPreference.DEFENSE, map, v);
        if (!type) continue;
        return [{ type: AiActionType.SPAWN, q: v.q, r: v.r, unitType: type }];
      }
      return null;
    },
  };
