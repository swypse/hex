import { isExploredFor } from '../../../map/explore';
import { hexDistance } from '../../../map/hex';
import { flagsFor } from '../../config/flags';
import { attackersForTile } from '../../military/gang-attack';
import { planGangAttack } from '../../military/plan-gang-attack';
import { squadTiles } from '../../military/squad-members';
import { enemyVillageAt } from '../../situation/enemy-village-at';
import { walkDistances } from '../../situation/walk-distances';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

/** Enemy units within this many hexes of the target village are its defenders. */
const DEFENDER_RADIUS = 2;

/** While the operation is committed, every squad member that can reach a defender strikes the
 *  same one (the one on the village first, then the weakest), even when the gang takes losses. */
export const FOCUSED_ASSAULT_PATTERN: AiPattern = {
  id: 'focused-assault',
  priority: 201,
  evaluate({ map, player, state, operation: op }): AiAction[] | null {
    if (!op?.committed || !flagsFor(player).focusAssault) return null;
    if (!enemyVillageAt(map, player, op.target)) return null;
    const squad = new Set(squadTiles(map, player, walkDistances(map, player, [op.target])).map((t) => t.unit!.id));
    const defenders = map.tiles
      .filter((t) => t.unit && t.unit.owner >= 0 && t.unit.owner !== player.index && isExploredFor(t, player.index) && hexDistance(t, op.target) <= DEFENDER_RADIUS)
      .sort((a, b) => Number(hexDistance(a, op.target) > 0) - Number(hexDistance(b, op.target) > 0) || a.unit!.hp - b.unit!.hp);
    for (const t of defenders) {
      const attackers = attackersForTile(map, player, t, state).filter((a) => squad.has(a.unit.id));
      if (attackers.length === 0) continue;
      const actions = planGangAttack(map, player, t, attackers, state);
      if (actions.length > 0) return actions;
    }
    return null;
  },
};
