import { AiActionType, BuilderExtraKind, BuildingKind, SkillId, UnitType } from '@enums';
import { type BuilderBuildableKind, BUILDING_COSTS, builderBuildable } from '../../../economy/buildings';
import { canAffordAt } from '../../../economy/stock';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { hasSkill } from '../../../skills';
import { enemyCanAttackNext, enemyCanReach } from '../../situation/enemy-reach';
import { reachableCells } from '../../situation/reachable-cells';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const BUILDER_WORK_PATTERN: AiPattern = {
    id: 'builder-work',
    priority: 87,
    evaluate({ map, player, state }): AiAction[] | null {
      // The Villagers builder raises buildings without any skill: send it to a
      // mine when mining is locked (smithery), a sawmill when forestry is
      // locked, and otherwise to the best mine/sawmill site. It never fights.
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.BUILDER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        const kinds: Exclude<BuilderBuildableKind, BuilderExtraKind>[] = [];
        if (!hasSkill(player, SkillId.SMITHERY)) kinds.push(BuildingKind.MINE);
        if (!hasSkill(player, SkillId.FORESTRY)) kinds.push(BuildingKind.SAWMILL);
        if (!kinds.includes(BuildingKind.MINE)) kinds.unshift(BuildingKind.MINE);
        if (!kinds.includes(BuildingKind.SAWMILL)) kinds.push(BuildingKind.SAWMILL);
        kinds.push(BuildingKind.PORT);
        for (const kind of kinds) {
          if (!canAffordAt(map, player, t, BUILDING_COSTS[kind])) continue;
          // Already standing where it can build something.
          const local = builderBuildable(map, t, kind, player);
          if (local.length > 0) {
            return [{ type: AiActionType.BUILDER_BUILD, unitId: unit.id, q: local[0]!.q, r: local[0]!.r, kind }];
          }
          let bestStep: MapTile | null = null;
          let bestDist = Infinity;
          for (const c of reachableCells(map, player, unit)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement) continue;
            if (enemyCanAttackNext(map, c, player.index)) continue;
            if (builderBuildable(map, c, kind, player).length === 0) continue;
            const d = hexDistance(t, c);
            if (d < bestDist) {
              bestDist = d;
              bestStep = c;
            }
          }
          if (bestStep) return [{ type: AiActionType.MOVE, unitId: unit.id, q: bestStep.q, r: bestStep.r }];
        }
      }
      return null;
    },
  };
