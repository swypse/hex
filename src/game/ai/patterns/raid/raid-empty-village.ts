import { AiActionType, UnitType } from '@enums';
import { isExploredFor } from '../../../map/explore';
import type { MapTile } from '../../../map/map-gen';
import { unitMaxHp } from '../../../units/units';
import { flagsFor } from '../../config/flags';
import { enemyCanReach, isLikelyLethal } from '../../situation/enemy-reach';
import { idleUnits } from '../../situation/idle-units';
import { reachableCells } from '../../situation/reachable-cells';
import { walkDistance, walkDistances } from '../../situation/walk-distances';
import type { AiAction } from '../../types/action';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';
import type { AiPattern } from '../pattern-types';

/** Units farther than this many walking steps from an empty enemy village do not go for it. */
const MAX_RAID_DISTANCE = 14;

/** Units below this share of max hp stay out of the raid. */
const MIN_RAID_HP = 0.6;

/** Healthy idle units walk to an enemy village that stands empty (no garrison) and take it; the nearest unit goes first.
 *  Lone enemy garrisons are handled by the attack patterns; this covers the villages nobody holds. */
export const RAID_EMPTY_VILLAGE_PATTERN: AiPattern = {
  id: 'raid-empty-village',
  priority: 78,
  evaluate({ map, player, state }): AiAction[] | null {
    if (!flagsFor(player).emptyRaid) return null;
    const targets = map.tiles.filter(
      (t) => t.settlement && t.settlement.owner !== null && t.settlement.owner !== player.index && !t.unit && isExploredFor(t, player.index),
    );
    if (targets.length === 0) return null;
    const field = walkDistances(map, player, targets);
    let best: { unitId: string; step: MapTile; score: number } | null = null;
    for (const { tile: t, unit } of idleUnits(map, player, state)) {
      if (isSupportUnit(unit) || unit.type === UnitType.STALKER || unit.type === UnitType.PIRATE || unit.shipLevel !== undefined) continue;
      if (unit.hp < unitMaxHp(unit) * MIN_RAID_HP) continue;
      if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
      const d0 = walkDistance(field, t);
      if (d0 === Infinity || d0 === 0 || d0 > MAX_RAID_DISTANCE) continue;
      for (const c of reachableCells(map, player, unit)) {
        if (state.occupied.has(key(c.q, c.r)) || (c.settlement && c.settlement.owner === player.index)) continue;
        const dc = walkDistance(field, c);
        if (dc >= d0 || isLikelyLethal(map, c, player.index, unit)) continue;
        // Nearest unit first, then the biggest step toward the village.
        const score = -d0 * 10 + (d0 - dc);
        if (!best || score > best.score) best = { unitId: unit.id, step: c, score };
      }
    }
    return best ? [{ type: AiActionType.MOVE, unitId: best.unitId, q: best.step.q, r: best.step.r }] : null;
  },
};
