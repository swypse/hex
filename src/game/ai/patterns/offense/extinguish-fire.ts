import { AiActionType } from '@enums';
import { isForestType } from '../../../map/tile-types';
import { attackableTargets } from '../../../units/combat';
import { extinguishCells } from '../../../weather/fire';
import { idleUnits } from '../../situation/idle-units';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

export const EXTINGUISH_FIRE_PATTERN: AiPattern = {
    // Fire on an own building, an own forest or under an own unit is put out
    // before anything else; a unit that is fighting this turn keeps fighting.
    id: 'extinguish-fire',
    priority: 220,
    evaluate({ map, player, state }): AiAction[] | null {
      let best: { action: AiAction[]; score: number } | null = null;
      for (const { tile: t, unit } of idleUnits(map, player, state)) {
        if (unit.hasMoved || unit.hasAttacked || unit.hasHealed || (unit.stunTurns ?? 0) >= 1) continue;
        const cells = extinguishCells(map, unit);
        if (cells.length === 0) continue;
        const fighting = attackableTargets(map, unit, player.index).length > 0;
        for (const c of cells) {
          // Standing in the flames of a forest costs 10 hp a round.
          const underOwn = c.unit?.owner === player.index && isForestType(c.terrain);
          let score = 0;
          if ((c.building && c.ownedBy === player.index) || c.bridge?.owner === player.index) score = 300;
          else if (underOwn) score = 250;
          else if (isForestType(c.terrain) && c.ownedBy === player.index) score = 150;
          if (score === 0) continue;
          if (fighting && c.unit !== unit) continue;
          if (c.q === unit.q && c.r === unit.r) score += 20;
          if (!best || score > best.score) best = { action: [{ type: AiActionType.EXTINGUISH, unitId: unit.id, q: c.q, r: c.r }], score };
        }
      }
      return best ? best.action : null;
    },
  };
