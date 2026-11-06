import { AiActionType,UnitType } from '@enums';
import { isFoodBuilding } from '../../../economy/buildings';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { flagsFor } from '../../config/flags';
import { enemyCanReach,isLikelyLethal } from '../../situation/enemy-reach';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';
import { PRIORITY_WEIGHT,raidTargets,roadCutTargets } from './raid-targets';

export const RAID_ENEMY_BUILDINGS_PATTERN: AiPattern = {
    id: 'raid-enemy-buildings',
    priority: 78,
    evaluate({ map, player, state }): AiAction[] | null {
      if (!flagsFor(player).raidBuildings) return null;
      const roads = roadCutTargets(map, player.index);
      const targets = [...raidTargets(map, player.index), ...roads];
      if (targets.length === 0) return null;
      let best: { score: number; actions: AiAction[] } | null = null;
      const consider = (score: number, actions: AiAction[]): void => {
        if (!best || score > best.score) best = { score, actions };
      };

      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id)) continue;
        if (isSupportUnit(unit) || unit.type === UnitType.STALKER || unit.shipLevel !== undefined) continue;
        // Garrisons stay home while an enemy can reach their village.
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        const siege = unit.type === UnitType.CATAPULT;
        const moved = state.moved.has(unit.id);
        const reach: MapTile[] = moved ? [] : reachableCells(map, player, unit);
        const usable = (c: MapTile): boolean =>
          !state.occupied.has(key(c.q, c.r)) && !c.settlement && !isLikelyLethal(map, c, player.index, unit);

        for (const { tile: target, priority } of targets) {
          if (siege) {
            // From where it stands, or after a move, within its range of the structure.
            if (hexDistance(t, target) <= unit.attackDistance && !isLikelyLethal(map, t, player.index, unit)) {
              consider(priority * PRIORITY_WEIGHT, [{ type: AiActionType.ATTACK, unitId: unit.id, q: target.q, r: target.r }]);
              continue;
            }
            for (const c of reach) {
              if (hexDistance(c, target) > unit.attackDistance || !usable(c)) continue;
              consider(priority * PRIORITY_WEIGHT - hexDistance(t, c), [
                { type: AiActionType.MOVE, unitId: unit.id, q: c.q, r: c.r },
                { type: AiActionType.ATTACK, unitId: unit.id, q: target.q, r: target.r },
              ]);
            }
            continue;
          }
          // Other units burn food buildings and cut roads by standing on them.
          const isRoad = roads.some((r) => r.tile === target);
          if ((!isFoodBuilding(target.building) && !isRoad) || moved) continue;
          const onIt = reach.find((c) => c.q === target.q && c.r === target.r);
          if (!onIt || !usable(onIt) || onIt === t) continue;
          // The road is burned on the next turn (burning takes a whole turn without moving).
          if (isRoad) {
            consider(priority * PRIORITY_WEIGHT - hexDistance(t, onIt), [{ type: AiActionType.MOVE, unitId: unit.id, q: onIt.q, r: onIt.r }]);
            continue;
          }
          consider(priority * PRIORITY_WEIGHT - hexDistance(t, onIt), [
            { type: AiActionType.MOVE, unitId: unit.id, q: onIt.q, r: onIt.r },
            { type: AiActionType.BURN, unitId: unit.id },
          ]);
        }
      }
      const chosen = best as { score: number; actions: AiAction[] } | null;
      return chosen ? chosen.actions : null;
    },
  };
