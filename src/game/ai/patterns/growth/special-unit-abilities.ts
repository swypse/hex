import { AiActionType, UnitType } from '@enums';
import { LIGHTNING_COST, lightningReady } from '../../../units/lightning';
import { stormReady, stormTargetShips } from '../../../units/storm';
import { bestLightningVillage } from '../../military/best-lightning-village';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

/** Money the AI keeps after paying for a lightning. */
const LIGHTNING_MONEY_RESERVE = 10;

export const SPECIAL_UNIT_ABILITIES_PATTERN: AiPattern = {
    id: 'special-unit-abilities',
    priority: 20,
    evaluate({ map, player, state, turn }): AiAction[] | null {
      // Storm when enemy or pirate ships sit on a stormcaller's village waters.
      // Stalker stealth and stunner stun have their own higher-priority
      // patterns (stalker-restealth, stunner-prefer-stun).
      for (const t of map.tiles) {
        const u = t.unit;
        if (!u || u.owner !== player.index) continue;
        const idle = !u.hasMoved && !u.hasAttacked && !u.hasHealed;
        if (u.type === UnitType.STORMCALLER && idle && stormReady(player, turn ?? 0) && stormTargetShips(map, u).length > 0) {
          return [{ type: AiActionType.STORM, unitId: u.id }];
        }
      }
      // Call lightning onto the most worthwhile explored enemy village once recharged,
      // keeping a small purse for spawns.
      if (!state.lightningCalled && lightningReady(player, turn ?? 0) && player.resources.money >= LIGHTNING_COST + LIGHTNING_MONEY_RESERVE) {
        for (const t of map.tiles) {
          const caller = t.unit;
          if (!caller || caller.owner !== player.index || caller.type !== UnitType.STORMCALLER) continue;
          if (caller.shipLevel !== undefined || (caller.stunTurns ?? 0) >= 1) continue;
          const village = bestLightningVillage(map, player.index, caller);
          if (village) return [{ type: AiActionType.LIGHTNING, unitId: caller.id, q: village.q, r: village.r }];
        }
      }
      return null;
    },
  };
