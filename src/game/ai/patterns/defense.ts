import { type MapTile } from '../../map/map-gen';
import { hasSkill } from '../../skills';
import { reachableTargets } from '../../units/selection';
import { unitMaxHp, canHeal, HEAL_AMOUNT, type Unit } from '../../units/units';
import { hexDistance } from '../../map/hex';
import { attackableTargets, attackDamage } from '../../units/combat';
import { unitsInVillage, villageCapacity } from '../../economy/village';
import { isExploredFor } from '../../map/explore';
import { type AiAction } from '../ai-types';
import { AiActionType, SkillId, SpawnPreference, UnitType } from '@enums';

import { type AiPattern, berserkerShouldPress, bestSpawnableUnitType, enemyCanAttackNext, enemyCanReach, isSupportUnit, key, landEnemyCanReach, nearestEnemyDistanceFrom } from '../ai-pattern-helpers';

export const DEFENSE_PATTERNS: AiPattern[] = [
  {
    id: 'secure-free-village',
    priority: 105,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      let best: { unit: Unit; target: MapTile; villageKey: string } | null = null;
      let bestScore = Infinity;
      for (const v of map.tiles) {
        if (!v.settlement || v.settlement.owner !== null) continue;
        const vk = key(v.q, v.r);
        if (state.occupied.has(vk)) continue;
        if (v.unit && v.unit.owner === player.index) continue;
        for (const t of map.tiles) {
          const unit = t.unit;
          if (!unit || unit.owner !== player.index) continue;
          if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
          if (isSupportUnit(unit)) continue;
          if (enemyCanAttackNext(map, t, player.index)) continue;
          if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
          const reach = reachableTargets(map, unit, undefined, canClimb, canDock, player.index).filter(
            (c) => !state.occupied.has(key(c.q, c.r)) && !(c.settlement && c.settlement.owner === player.index),
          );
          let bestStep: MapTile | null = null;
          let bestStepDist = Infinity;
          for (const c of reach) {
            const d = hexDistance(c, v);
            if (d < bestStepDist) {
              bestStepDist = d;
              bestStep = c;
            }
          }
          if (!bestStep) continue;
          const score = hexDistance(t, v);
          if (score < bestScore) {
            bestScore = score;
            best = { unit, target: bestStep, villageKey: vk };
          }
        }
      }
      if (best) {
        state.occupied.add(best.villageKey);
        return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.target.q, r: best.target.r }];
      }
      return null;
    },
  },
  {
    id: 'defend-empty-village',
    priority: 100,
    evaluate({ map, player, state }): AiAction[] | null {
      const villages = map.tiles.filter((t) => t.settlement && t.settlement.owner === player.index);
      for (const v of villages) {
        const k = key(v.q, v.r);
        if (state.spawned.has(k)) continue;
        if (v.unit) continue;
        if (!landEnemyCanReach(map, v, player.index)) continue;
        const type = bestSpawnableUnitType(player, SpawnPreference.DEFENSE, map, v);
        if (!type) continue;
        return [{ type: AiActionType.SPAWN, q: v.q, r: v.r, unitType: type }];
      }
      return null;
    },
  },
  {
    id: 'counter-threat',
    priority: 95,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // Support units don't retaliate and the stalker avoids combat entirely.
        if (isSupportUnit(unit) || unit.type === UnitType.STALKER) continue;
        // Ships have their own naval-hunt pattern; don't retreat them here.
        if (unit.shipLevel !== undefined) continue;
        if (berserkerShouldPress(map, player, unit)) continue;
        // Don't retreat the last defender out of an endangered own village;
        // defend-hurt-unit decides whether it heals, retreats+spawns, or holds.
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        for (const e of map.tiles) {
          const enemy = e.unit;
          if (!enemy || enemy.owner === player.index) continue;
          if (!isExploredFor(e, player.index)) continue;
          if (hexDistance(t, e) > enemy.attackDistance) continue;
          if (attackDamage(enemy) < unit.hp) continue;
          const canKill = attackableTargets(map, unit, player.index).some((a) => a.q === e.q && a.r === e.r) && attackDamage(unit) >= enemy.hp;
          if (canKill) return [{ type: AiActionType.ATTACK, unitId: unit.id, q: e.q, r: e.r }];
          let best: MapTile | null = null;
          let bestDist = -Infinity;
          for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === unit.owner) {
              best = c;
              break;
            }
            const d = nearestEnemyDistanceFrom(map, player.index, c);
            if (d > bestDist) {
              bestDist = d;
              best = c;
            }
          }
          if (best) return [{ type: AiActionType.MOVE, unitId: unit.id, q: best.q, r: best.r }];
        }
      }
      return null;
    },
  },
  {
    id: 'garrison-empty-village',
    priority: 92,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      for (const v of map.tiles) {
        if (!v.settlement || v.settlement.owner !== player.index) continue;
        if (v.unit) continue;
        const vk = key(v.q, v.r);
        if (state.occupied.has(vk)) continue;
        if (!landEnemyCanReach(map, v, player.index)) continue;
        let best: { unit: Unit; dist: number } | null = null;
        for (const t of map.tiles) {
          const unit = t.unit;
          if (!unit || unit.owner !== player.index) continue;
          if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
          if (isSupportUnit(unit)) continue;
          if (t.settlement && t.settlement.owner === player.index) continue;
          // A unit that can strike an enemy keeps pressing that fight unless an
          // enemy could take the village next turn.
          if (attackableTargets(map, unit, player.index).length > 0 && !landEnemyCanReach(map, v, player.index, 1)) continue;
          const reach = reachableTargets(map, unit, undefined, canClimb, canDock, player.index);
          if (!reach.some((c) => c.q === v.q && c.r === v.r)) continue;
          const dist = hexDistance(unit, v);
          if (!best || dist < best.dist) best = { unit, dist };
        }
        if (!best) continue;
        return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: v.q, r: v.r }];
      }
      return null;
    },
  },
  {
    id: 'defend-hurt-unit',
    priority: 90,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (!t.settlement || t.settlement.owner !== player.index) continue;
        const maxHp = unitMaxHp(unit);
        // A healthy garrison just holds — it must not leave the village.
        if (unit.hp >= maxHp) continue;
        const threatened = enemyCanReach(map, t, player.index) || enemyCanAttackNext(map, t, player.index);
        if (!threatened) continue;
        // Keep the unit and heal when that restores it to full hp.
        if (canHeal(unit) && unit.hp + HEAL_AMOUNT >= maxHp) {
          return [{ type: AiActionType.HEAL, unitId: unit.id, q: t.q, r: t.r }];
        }
        // Too hurt to fully heal: pull it back and put a strong fresh defender
        // in the village instead (only when the village can actually spawn it).
        const canClimb = hasSkill(player, SkillId.CLIMBING);
        const canDock = hasSkill(player, SkillId.NAVIGATION);
        const spawnType = bestSpawnableUnitType(player, SpawnPreference.DEFENSE, map, t);
        const slotFree = unitsInVillage(map, t) < villageCapacity(t.settlement.level);
        if (spawnType && slotFree) {
          let best: MapTile | null = null;
          let bestDist = -Infinity;
          for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === player.index) continue;
            const d = nearestEnemyDistanceFrom(map, player.index, c);
            if (d > bestDist) {
              bestDist = d;
              best = c;
            }
          }
          if (best) {
            return [
              { type: AiActionType.MOVE, unitId: unit.id, q: best.q, r: best.r },
              { type: AiActionType.SPAWN, q: t.q, r: t.r, unitType: spawnType },
            ];
          }
        }
        // No money (or no room/route): keep the low-hp unit in the village and
        // heal it rather than leaving the village empty.
        if (canHeal(unit)) {
          return [{ type: AiActionType.HEAL, unitId: unit.id, q: t.q, r: t.r }];
        }
        return null;
      }
      return null;
    },
  },
];
