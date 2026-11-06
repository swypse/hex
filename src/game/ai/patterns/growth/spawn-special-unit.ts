import { AiActionType,UnitType } from '@enums';
import { canAffordAt } from '../../../economy/stock';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { isMountainType } from '../../../map/tile-types';
import { TRIBE_SPECIAL_UNIT } from '../../../tribes';
import { unitSpawnCost } from '../../../units/units';
import { flagsFor } from '../../config/flags';
import { friendlyUnitsWithin } from '../../situation/friendly-units-within';
import { nearestEnemyDistanceFrom } from '../../situation/nearest-distances';
import { spawnWouldBeKilled } from '../../spawn/spawn-would-be-killed';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { specialUnitWanted } from '../../unit-roles/special-unit-wanted';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const SPAWN_SPECIAL_UNIT_PATTERN: AiPattern = {
    id: 'spawn-special-unit',
    priority: 65,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      // Each tribe fields its special unit when it is actually useful (naval
      // stormcaller, mine-locked builder, scout stalker, etc.); a second copy
      // is only spawned after the first one dies.
      const special = TRIBE_SPECIAL_UNIT[player.tribe];
      if (!special) return null;
      const fielded = map.tiles.filter((t) => t.unit && t.unit.owner === player.index && t.unit.type === special).length;
      const cap = flagsFor(player).multiSpecial && (special === UnitType.BERSERKER || special === UnitType.STUNNER)
        ? Math.max(1, Math.floor(map.tiles.filter((t) => t.unit && t.unit.owner === player.index && !isSupportUnit(t.unit)).length / 3))
        : 1;
      if (fielded >= cap) return null;
      if (!specialUnitWanted(map, player, situation)) return null;
      const cost = unitSpawnCost(special);
      // Pick the village that puts the special unit where it works: the banner
      // next to the army cluster, the builder beside an unbuilt mine, everyone
      // else on the front line.
      let best: MapTile | null = null;
      let bestScore = -Infinity;
      const mineDist = (v: MapTile): number => {
        let d = Infinity;
        for (const t of map.tiles) {
          if (t.ownedBy !== player.index || t.building || t.settlement) continue;
          if (!isMountainType(t.terrain)) continue;
          d = Math.min(d, hexDistance(v, t));
        }
        return d;
      };
        for (const v of map.tiles) {
          if (!v.settlement || v.settlement.owner !== player.index) continue;
          if (v.unit) continue;
          if (!canAffordAt(map, player, v, cost)) continue;
          const k = key(v.q, v.r);
          if (state.spawned.has(k) || state.occupied.has(k)) continue;
          if (spawnWouldBeKilled(map, v, player.index, special)) continue;
          const enemyDist = nearestEnemyDistanceFrom(map, player.index, v);
          const score =
            special === UnitType.BANNER
              ? friendlyUnitsWithin(map, player.index, v, 3) * 100
              : special === UnitType.BUILDER
                ? -mineDist(v)
                : Number.isFinite(enemyDist)
                  ? -enemyDist
                  : 0;
          if (score > bestScore) {
            bestScore = score;
            best = v;
          }
        }
      if (!best) return null;
      return [{ type: AiActionType.SPAWN, q: best.q, r: best.r, unitType: special }];
    },
  };
