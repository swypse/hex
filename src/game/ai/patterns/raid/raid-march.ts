import { AiActionType,AiPersonalityId,UnitType } from '@enums';
import { isFoodBuilding } from '../../../economy/buildings';
import type { MapTile } from '../../../map/map-gen';
import { type Unit,unitMaxHp } from '../../../units/units';
import { flagsFor } from '../../config/flags';
import { personalityFor } from '../../config/personality';
import { enemyCanReach,isLikelyLethal } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import { reachableCells } from '../../situation/reachable-cells';
import { walkDistance,walkDistances } from '../../situation/walk-distances';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';
import { MARCH_TARGETS,PRIORITY_WEIGHT,RAIDER_MARCH_TARGETS,raidTargets,roadCutTargets } from './raid-targets';

export const RAID_MARCH_PATTERN: AiPattern = {
    id: 'raid-march',
    priority: 78,
    evaluate({ map, player, state }): AiAction[] | null {
      if (!flagsFor(player).raidBuildings) return null;
      const roads = roadCutTargets(map, player.index);
      const targets = [...raidTargets(map, player.index), ...roads]
        .filter((tg) => !state.occupied.has(`raid:${key(tg.tile.q, tg.tile.r)}`))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, personalityFor(player).id === AiPersonalityId.RAIDER ? RAIDER_MARCH_TARGETS : MARCH_TARGETS);
      if (targets.length === 0) return null;
      const fields = targets.map((tg) => walkDistances(map, player, [tg.tile]));
      let best: { score: number; unit: Unit; step: MapTile; targetKey: string } | null = null;
      for (const { tile: t, unit } of idleUnits(map, player, state)) {
        if (isSupportUnit(unit) || unit.type === UnitType.STALKER || unit.shipLevel !== undefined) continue;
        if (unit.hp * 2 < unitMaxHp(unit)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        const siege = unit.type === UnitType.CATAPULT;
        const reach = reachableCells(map, player, unit);
        targets.forEach(({ tile: target, priority }, i) => {
          // Only catapults reach other buildings; the rest go for food buildings and cut roads.
          if (!siege && !isFoodBuilding(target.building) && !roads.some((r) => r.tile === target)) return;
          const field = fields[i]!;
          const d0 = walkDistance(field, t);
          if (d0 === Infinity) return;
          for (const c of reach) {
            if (state.occupied.has(key(c.q, c.r)) || c.settlement || isLikelyLethal(map, c, player.index, unit)) continue;
            const dc = walkDistance(field, c);
            if (dc >= d0) continue;
            const score = priority * PRIORITY_WEIGHT - dc * 10;
            if (!best || score > best.score) best = { score, unit, step: c, targetKey: key(target.q, target.r) };
          }
        });
      }
      const chosen = best as { score: number; unit: Unit; step: MapTile; targetKey: string } | null;
      if (!chosen) return null;
      // One marcher per target.
      state.occupied.add(`raid:${chosen.targetKey}`);
      return [{ type: AiActionType.MOVE, unitId: chosen.unit.id, q: chosen.step.q, r: chosen.step.r }];
    },
  };
