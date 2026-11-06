import { AiActionType, VillageUpgradeBonus } from '@enums';
import { villageUpgradeCost } from '../../../economy/resources';
import { canAffordAt } from '../../../economy/stock';
import { villageUpgradeChoices } from '../../../economy/village';
import { landEnemyCanReach } from '../../situation/enemy-reach';
import type { AiAction } from '../../types/action';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

export const UPGRADE_FOR_SWORDSMAN_PATTERN: AiPattern = {
    // Last chance for a village an enemy stands on or is about to take: the
    // upgrade raises a free veteran swordsman there and pushes the intruder off.
    id: 'upgrade-for-swordsman',
    priority: 106,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const s = t.settlement;
        if (!s || s.owner !== player.index || state.upgraded.has(key(t.q, t.r))) continue;
        if (!villageUpgradeChoices(s.level).includes(VillageUpgradeBonus.VETERAN_SWORDSMAN)) continue;
        const occupied = !!t.unit && t.unit.owner !== player.index;
        const exposed = !t.unit && landEnemyCanReach(map, t, player.index, 1);
        if (!occupied && !exposed) continue;
        if (!canAffordAt(map, player, t, villageUpgradeCost(s.level))) continue;
        return [{ type: AiActionType.UPGRADE, q: t.q, r: t.r, bonus: VillageUpgradeBonus.VETERAN_SWORDSMAN }];
      }
      return null;
    },
  };
