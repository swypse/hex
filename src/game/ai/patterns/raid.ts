import { type MapTile } from '../../map/map-gen';
import { hasSkill } from '../../skills';
import { reachableTargets } from '../../units/selection';
import { type Unit } from '../../units/units';
import { hexDistance } from '../../map/hex';
import { isExploredFor } from '../../map/explore';
import { isFoodBuilding, raidPriority } from '../../economy/buildings';
import { type AiAction } from '../ai-types';
import { flagsFor } from '../ai-flags';
import { roadCutSplits } from '../../economy/roads';
import { unitMaxHp } from '../../units/units';
import { type GameMap } from '../../map/map-gen';
import { walkDistance, walkDistances } from '../ai-walk';
import { AiActionType, AiPersonalityId, SkillId, UnitType } from '@enums';
import { personalityFor } from '../ai-personality';

import { type AiPattern, enemyCanReach, isLikelyLethal, isSupportUnit, key } from '../ai-pattern-helpers';

/** Score weight of one raid-priority step; a move of one hex costs 1. */
const PRIORITY_WEIGHT = 100;

/** Raid priority of an enemy road that is its owner's only link between villages. */
const ROAD_CUT_PRIORITY = 4;
/** Most targets a marching unit plans toward per evaluation (keeps the walk-field search cheap). */
const MARCH_TARGETS = 3;
/** A raider-style player marches on more targets at once. */
const RAIDER_MARCH_TARGETS = 6;

/** Enemy roads whose destruction splits the owner's village network, with no unit on them. */
function roadCutTargets(map: GameMap, playerIndex: number): { tile: MapTile; priority: number }[] {
  const out: { tile: MapTile; priority: number }[] = [];
  for (const t of map.tiles) {
    const owner = t.roadOwner;
    if (owner === null || owner === undefined || owner < 0 || owner === playerIndex) continue;
    if (t.unit || isFoodBuilding(t.building) || !isExploredFor(t, playerIndex)) continue;
    if (roadCutSplits(map, t) > 0) out.push({ tile: t, priority: ROAD_CUT_PRIORITY });
  }
  return out;
}

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
      const roads = roadCutTargets(map, player.index);
      const targets = [...raidTargets(map, player.index), ...roads];
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
          // Other units burn food buildings and cut roads by standing on them.
          const isRoad = roads.some((r) => r.tile === target);
          if ((!isFoodBuilding(target.building) && !isRoad) || moved) continue;
          const onIt = reach.find((c) => c.q === target.q && c.r === target.r);
          if (!onIt || !usable(onIt) || onIt === t) continue;
          // The road is burned on the next turn (burning takes a whole turn without moving).
          if (isRoad) {
            consider(priority * PRIORITY_WEIGHT - hexDistance(t, onIt), [{ type: AiActionType.MOVE, unitId: unit.id, q: onIt.q, r: onIt.r }]);
            continue;
          }
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
  {
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
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      const fields = targets.map((tg) => walkDistances(map, player, [tg.tile]));
      let best: { score: number; unit: Unit; step: MapTile; targetKey: string } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (isSupportUnit(unit) || unit.type === UnitType.STALKER || unit.shipLevel !== undefined) continue;
        if (unit.hp * 2 < unitMaxHp(unit)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        const siege = unit.type === UnitType.CATAPULT;
        const reach = reachableTargets(map, unit, undefined, canClimb, canDock, player.index);
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
  },
];
