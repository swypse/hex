import { type MapTile } from '../../map/map-gen';
import { hasSkill } from '../../skills';
import { reachableTargets } from '../../units/selection';
import { type Unit } from '../../units/units';
import { hexDistance } from '../../map/hex';
import { isExploredFor } from '../../map/explore';
import { isFoodBuilding, raidPriority } from '../../economy/buildings';
import { type AiAction } from '../ai-types';
import { flagsFor } from '../ai-flags';
import { AiActionType, SkillId, UnitType } from '@enums';

import { type AiPattern, enemyCanReach, isLikelyLethal, isSupportUnit, key } from '../ai-pattern-helpers';

/** Score weight of one raid-priority step; a move of one hex costs 1. */
const PRIORITY_WEIGHT = 100;

/** Enemy buildings worth destroying that no unit stands on (a unit on the tile
 *  is a normal combat target), with their raid priority. */
function raidTargets(map: { tiles: MapTile[] }, playerIndex: number): { tile: MapTile; priority: number }[] {
  const out: { tile: MapTile; priority: number }[] = [];
  for (const t of map.tiles) {
    const b = t.building;
    if (!b || t.unit) continue;
    if (t.ownedBy === null || t.ownedBy === undefined || t.ownedBy < 0 || t.ownedBy === playerIndex) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    const priority = raidPriority(b.kind);
    if (priority > 0) out.push({ tile: t, priority });
  }
  return out;
}

export const RAID_PATTERNS: AiPattern[] = [
  {
    id: 'raid-enemy-buildings',
    priority: 78,
    evaluate({ map, player, state }): AiAction[] | null {
      if (!flagsFor(player).raidBuildings) return null;
      const targets = raidTargets(map, player.index);
      if (targets.length === 0) return null;
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
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
        const reach: MapTile[] = moved ? [] : reachableTargets(map, unit, undefined, canClimb, canDock, player.index);
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
          // Other units can only burn food buildings, by standing on them.
          if (!isFoodBuilding(target.building) || moved) continue;
          const onIt = reach.find((c) => c.q === target.q && c.r === target.r);
          if (!onIt || !usable(onIt) || onIt === t) continue;
          consider(priority * PRIORITY_WEIGHT - hexDistance(t, onIt), [
            { type: AiActionType.MOVE, unitId: unit.id, q: onIt.q, r: onIt.r },
            { type: AiActionType.BURN, unitId: unit.id },
          ]);
        }
      }
      const chosen = best as { score: number; actions: AiAction[] } | null;
      return chosen ? chosen.actions : null;
    },
  },
];
