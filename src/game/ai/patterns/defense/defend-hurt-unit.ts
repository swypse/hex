import { AiActionType, SpawnPreference } from '@enums';
import { unitsInVillage, villageCapacity } from '../../../economy/village';
import type { MapTile } from '../../../map/map-gen';
import { canHeal, HEAL_AMOUNT, unitMaxHp } from '../../../units/units';
import { enemyCanAttackNext, enemyCanReach } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import { nearestEnemyDistanceFrom } from '../../situation/nearest-distances';
import { reachableCells } from '../../situation/reachable-cells';
import { bestSpawnableUnitType } from '../../spawn/best-spawnable-unit-type';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const DEFEND_HURT_UNIT_PATTERN: AiPattern = {
    id: 'defend-hurt-unit',
    priority: 90,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const { tile: t, unit } of idleUnits(map, player, state)) {
        if (!t.settlement || t.settlement.owner !== player.index) continue;
        const maxHp = unitMaxHp(unit);
        // A healthy garrison just holds — it must not leave the village.
        if (unit.hp >= maxHp) continue;
        const threatened = enemyCanReach(map, t, player.index) || enemyCanAttackNext(map, t, player.index);
        if (!threatened) continue;
        // Keep the unit and heal when that restores it to full hp.
        if (canHeal(unit) && unit.hp + HEAL_AMOUNT >= maxHp) {
          return [{ type: AiActionType.HEAL, unitId: unit.id, q: t.q, r: t.r }];
        }
        // Too hurt to fully heal: pull it back and put a strong fresh defender
        // in the village instead (only when the village can actually spawn it).
        const spawnType = bestSpawnableUnitType(player, SpawnPreference.DEFENSE, map, t);
        const slotFree = unitsInVillage(map, t) < villageCapacity(t.settlement.level);
        if (spawnType && slotFree) {
          let best: MapTile | null = null;
          let bestDist = -Infinity;
          for (const c of reachableCells(map, player, unit)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === player.index) continue;
            const d = nearestEnemyDistanceFrom(map, player.index, c);
            if (d > bestDist) {
              bestDist = d;
              best = c;
            }
          }
          if (best) {
            return [
              { type: AiActionType.MOVE, unitId: unit.id, q: best.q, r: best.r },
              { type: AiActionType.SPAWN, q: t.q, r: t.r, unitType: spawnType },
            ];
          }
        }
        // No money (or no room/route): keep the low-hp unit in the village and
        // heal it rather than leaving the village empty.
        if (canHeal(unit)) {
          return [{ type: AiActionType.HEAL, unitId: unit.id, q: t.q, r: t.r }];
        }
        return null;
      }
      return null;
    },
  };
