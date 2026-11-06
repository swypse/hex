import { AiActionType, BuildingKind, SkillId } from '@enums';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { hasSkill } from '../../../skills';
import { attackableTargets } from '../../../units/combat';
import { reachableTargets } from '../../../units/selection';
import type { Unit } from '../../../units/units';
import { landEnemyCanReach } from '../../situation/enemy-reach';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const NAVAL_BOARD_SHIP_PATTERN: AiPattern = {
    id: 'naval-board-ship',
    priority: 76,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat) return null;
      if (!hasSkill(player, SkillId.NAVIGATION)) return null;
      const port = map.tiles.find((t) => t.building !== null && t.building.kind === BuildingKind.PORT && t.ownedBy === player.index);
      if (!port) return null;
      if (state.occupied.has(key(port.q, port.r))) return null;
      const hasShip = map.tiles.some((t) => t.unit && t.unit.owner === player.index && t.unit.shipLevel !== undefined);
      if (hasShip) return null;
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      let best: { unit: Unit; step: MapTile; dist: number } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // A unit that can strike an enemy this turn is pressing that fight.
        if (attackableTargets(map, unit, player.index).length > 0) continue;
        // Don't strip the last defender from a village a land enemy can reach.
        if (t.settlement && t.settlement.owner === player.index && landEnemyCanReach(map, t, player.index)) continue;
        const before = hexDistance(unit, port);
        for (const c of reachableTargets(map, unit, undefined, canClimb, true, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement && c.settlement.owner === player.index) continue;
          const after = hexDistance(c, port);
          if (after >= before) continue;
          if (!best || after < best.dist) best = { unit, step: c, dist: after };
        }
      }
      if (!best) return null;
      return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  };
