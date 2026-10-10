import { type MapTile } from '../../map/map-gen';
import { canAffordAt } from '../../economy/stock';
import { hasSkill } from '../../skills';
import { reachableTargets } from '../../units/selection';
import { unitMaxHp } from '../../units/units';
import { hexDistance } from '../../map/hex';
import { attackableTargets, attackDamage, tradeIsFavorable } from '../../units/combat';
import { builderBuildable, BUILDING_COSTS, type BuilderBuildableKind } from '../../economy/buildings';
import { type AiAction } from '../ai-types';
import { coastExposedTile, isMelee, isNavalEnemy } from '../ai-situation';
import { TRAP_COST, trapCells } from '../../units/traps';
import { AiActionType, BuilderExtraKind, BuildingKind, SkillId, UnitType } from '@enums';

import { type AiPattern, berserkerShouldPress, enemyCanAttackNext, enemyCanReach, friendlyUnitsWithin, frontierTile, isSupportUnit, key, nearestEnemyDistanceFrom } from '../ai-pattern-helpers';

export const UNIT_PATTERNS: AiPattern[] = [
  {
    id: 'banner-position',
    priority: 88,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      // The banner is an aura (friends within 2 hexes get +5 attack): keep it
      // next to the army cluster and never send it into a fight.
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.BANNER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // Already covering at least two friends: hold position.
        if (friendlyUnitsWithin(map, player.index, t, 2) >= 2) continue;
        let bestStep: MapTile | null = null;
        let bestScore = -Infinity;
        for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement && c.settlement.owner !== player.index) continue;
          if (enemyCanAttackNext(map, c, player.index)) continue;
          if (situation?.navalThreat && coastExposedTile(map, c, situation.navalEnemies)) continue;
          const allies = friendlyUnitsWithin(map, player.index, c, 2);
          const score = allies * 20 - hexDistance(t, c);
          if (score > bestScore) {
            bestScore = score;
            bestStep = c;
          }
        }
        if (bestStep && bestScore > 0) return [{ type: AiActionType.MOVE, unitId: unit.id, q: bestStep.q, r: bestStep.r }];
      }
      return null;
    },
  },
  {
    id: 'builder-work',
    priority: 87,
    evaluate({ map, player, state }): AiAction[] | null {
      // The Villagers builder raises buildings without any skill: send it to a
      // mine when mining is locked (smithery), a sawmill when forestry is
      // locked, and otherwise to the best mine/sawmill site. It never fights.
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.BUILDER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        const kinds: Exclude<BuilderBuildableKind, BuilderExtraKind.BRIDGE>[] = [];
        if (!hasSkill(player, SkillId.SMITHERY)) kinds.push(BuildingKind.MINE);
        if (!hasSkill(player, SkillId.FORESTRY)) kinds.push(BuildingKind.SAWMILL);
        if (!kinds.includes(BuildingKind.MINE)) kinds.unshift(BuildingKind.MINE);
        if (!kinds.includes(BuildingKind.SAWMILL)) kinds.push(BuildingKind.SAWMILL);
        kinds.push(BuildingKind.PORT);
        for (const kind of kinds) {
          if (!canAffordAt(map, player, t, BUILDING_COSTS[kind])) continue;
          // Already standing where it can build something.
          const local = builderBuildable(map, t, kind, player);
          if (local.length > 0) {
            return [{ type: AiActionType.BUILDER_BUILD, unitId: unit.id, q: local[0]!.q, r: local[0]!.r, kind }];
          }
          let bestStep: MapTile | null = null;
          let bestDist = Infinity;
          for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement) continue;
            if (enemyCanAttackNext(map, c, player.index)) continue;
            if (builderBuildable(map, c, kind, player).length === 0) continue;
            const d = hexDistance(t, c);
            if (d < bestDist) {
              bestDist = d;
              bestStep = c;
            }
          }
          if (bestStep) return [{ type: AiActionType.MOVE, unitId: unit.id, q: bestStep.q, r: bestStep.r }];
        }
      }
      return null;
    },
  },
  {
    id: 'trapper-lay',
    priority: 86,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      // The Forest trapper lays thorn traps on the front lines and never
      // fights: it stays back from combat and plants traps on likely enemy paths.
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.TRAPPER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;

        // Lay a trap now when affordable, on the best cell within reach.
        const spots = trapCells(map, t);
        if (spots.length > 0 && canAffordAt(map, player, t, TRAP_COST)) {
          let best: MapTile | null = null;
          let bestScore = -Infinity;
          for (const s of spots) {
            const frontier = frontierTile(map, s, player.index) ? 30 : 0;
            const nearEnemy = nearestEnemyDistanceFrom(map, player.index, s) <= 3 ? 20 : 0;
            const score = frontier + nearEnemy - hexDistance(t, s);
            if (score > bestScore) {
              bestScore = score;
              best = s;
            }
          }
          if (best) return [{ type: AiActionType.TRAP, unitId: unit.id, q: best.q, r: best.r }];
        }

        // Otherwise move toward a camp where a trap can cover a frontier tile.
        let bestStep: MapTile | null = null;
        let bestScore = -Infinity;
        for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement) continue;
          if (enemyCanAttackNext(map, c, player.index)) continue;
          if (situation?.navalThreat && coastExposedTile(map, c, situation.navalEnemies)) continue;
          let cover = 0;
          for (const s of trapCells(map, c)) {
            if (frontierTile(map, s, player.index)) cover += 10;
          }
          const score = cover - hexDistance(t, c);
          if (score > bestScore) {
            bestScore = score;
            bestStep = c;
          }
        }
        if (bestStep && bestScore > 0) return [{ type: AiActionType.MOVE, unitId: unit.id, q: bestStep.q, r: bestStep.r }];
      }
      return null;
    },
  },
  {
    id: 'retreat-heal',
    priority: 85,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (unit.hp > unitMaxHp(unit) / 2) continue;
        if (berserkerShouldPress(map, player, unit)) continue;
        if (t.settlement && t.settlement.owner === player.index) continue;
        if (!enemyCanAttackNext(map, t, player.index)) continue;
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
      return null;
    },
  },
  {
    id: 'archer-kite',
    priority: 80,
    evaluate({ map, player, rng, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.ARCHER) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement) continue;
        const enemy = map.tiles.find(
          (e) => e.unit && e.unit.owner !== player.index && hexDistance(t, e) === 1,
        );
        if (!enemy) continue;
        const targets = reachableTargets(map, unit, undefined, undefined, hasSkill(player, SkillId.NAVIGATION), unit.owner).filter(
          (c) => hexDistance(enemy, c) === 2 && !state.occupied.has(key(c.q, c.r)),
        );
        if (targets.length === 0) continue;
        const target = targets[Math.floor(rng.next() * targets.length)]!;
        return [
          { type: AiActionType.MOVE, unitId: unit.id, q: target.q, r: target.r },
          { type: AiActionType.ATTACK, unitId: unit.id, q: enemy.q, r: enemy.r },
        ];
      }
      return null;
    },
  },
  {
    id: 'hunt-idle-enemy',
    priority: 78,
    evaluate({ map, player, state, situation, difficulty }): AiAction[] | null {
      if (!situation || situation.enemies.length === 0) return null;
      // When endangered, reinforcement (higher priority) recalls the closest
      // free unit to the village; units already engaging a threat keep pressing
      // it instead of being frozen out of combat entirely.
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      let best: { action: AiAction[]; score: number } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // Support units don't hunt; the stalker only strikes to free a village
        // (handled by its own scout pattern), so keep it out of general hunts.
        if (isSupportUnit(unit) || unit.type === UnitType.STALKER) continue;
        if (t.settlement && t.settlement.owner === player.index) continue;
        const melee = isMelee(unit);
        for (const e of situation.enemies) {
          const enemyTile = e.tile;
          if (!enemyTile.unit || enemyTile.unit.owner === player.index) continue;
          // Naval enemies cannot be reached by land chases; ships handle them
          // in their own naval-hunt pattern.
          if (isNavalEnemy(e.unit)) continue;
          const strikes = (tile: MapTile): boolean =>
            attackableTargets(map, { ...unit, q: tile.q, r: tile.r }, player.index).some(
              (a) => a.q === enemyTile.q && a.r === enemyTile.r,
            );
          const isGood = (tile: MapTile): boolean => {
            const enemy = enemyTile.unit!;
            if (attackDamage(unit) >= enemy.hp) return true;
            if (!difficulty || !difficulty.checkTrades) return true;
            return tradeIsFavorable({ ...unit, q: tile.q, r: tile.r }, enemyTile);
          };
          if (strikes(t)) {
            const kills = attackDamage(unit) >= enemyTile.unit.hp;
            if (!kills && difficulty?.checkTrades && !tradeIsFavorable(unit, enemyTile)) continue;
            const score = (kills ? 500 : 300) - hexDistance(t, enemyTile);
            if (!best || score > best.score) {
              best = { action: [{ type: AiActionType.ATTACK, unitId: unit.id, q: enemyTile.q, r: enemyTile.r }], score };
            }
            continue;
          }
          if (!melee) continue;
          const canKill = attackDamage(unit) >= enemyTile.unit.hp;
          const notTougher = unitMaxHp(enemyTile.unit) <= unitMaxHp(unit);
          if (!canKill && !notTougher) continue;
          const startDist = hexDistance(t, enemyTile);
          for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === player.index) continue;
            // Don't use a foreign village as an attack staging tile: stepping on
            // it should claim it for capture, never to strike-and-leave.
            if (c.settlement && c.settlement.owner !== player.index) continue;
            const nd = hexDistance(c, enemyTile);
            if (nd >= startDist) continue;
            const moveDist = hexDistance(t, c);
            if (strikes(c) && isGood(c)) {
              const score = (canKill ? 500 : 300) - nd * 10 - moveDist;
              if (!best || score > best.score) {
                best = {
                  action: [
                    { type: AiActionType.MOVE, unitId: unit.id, q: c.q, r: c.r },
                    { type: AiActionType.ATTACK, unitId: unit.id, q: enemyTile.q, r: enemyTile.r },
                  ],
                  score,
                };
              }
            } else {
              const score = 200 - nd * 10 - moveDist;
              if (!best || score > best.score) {
                best = { action: [{ type: AiActionType.MOVE, unitId: unit.id, q: c.q, r: c.r }], score };
              }
            }
          }
        }
      }
      if (!best) return null;
      return best.action;
    },
  },
];
