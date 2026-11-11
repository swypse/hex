import { AiActionType } from '@enums';
import { canHeal, unitMaxHp } from '../../../units/units';
import { flagsFor } from '../../config/flags';
import { personalityFor } from '../../config/personality';
import { enemyCanAttackNext } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

/** Units below this share of max hp rest instead of walking (starved units sit at 1-10 hp for whole seasons otherwise). */
const MIN_RECOVER_RATIO = 0.5;

/** A wounded idle unit that no enemy can hit next turn heals where it stands (+15 hp, once it has not moved).
 *  Without it scouts, marchers and garrison swaps keep walking units at 1-7 hp that never get to heal. */
export const RECOVER_WOUNDED_PATTERN: AiPattern = {
  id: 'recover-wounded',
  priority: 89,
  evaluate({ map, player, state }): AiAction[] | null {
    if (!flagsFor(player).recoverWounded) return null;
    const ratio = Math.max(MIN_RECOVER_RATIO, personalityFor(player).retreatHpRatio);
    for (const { tile, unit } of idleUnits(map, player, state)) {
      if (unit.hp >= unitMaxHp(unit) * ratio || !canHeal(unit)) continue;
      if (enemyCanAttackNext(map, tile, player.index)) continue;
      return [{ type: AiActionType.HEAL, unitId: unit.id, q: tile.q, r: tile.r }];
    }
    return null;
  },
};
