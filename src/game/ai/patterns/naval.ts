import { type MapTile } from '../../map/map-gen';
import { canAffordAt } from '../../economy/stock';
import { isWaterType } from '../../map/tile-types';
import { canOpenSkill, hasSkill } from '../../skills';
import { reachableTargets } from '../../units/selection';
import { type Unit } from '../../units/units';
import { hexDistance } from '../../map/hex';
import { attackableTargets } from '../../units/combat';
import { canBuildPort, BUILDING_COSTS } from '../../economy/buildings';
import { type AiAction } from '../ai-types';
import { coastExposedTile, isNavalEnemy } from '../ai-situation';
import { shipAttackDistance } from '../../units/ship';
import { AiActionType, BuildingKind, SkillId, UnitType } from '@enums';

import { type AiPattern, enemyCanReach, key, landEnemyCanReach } from '../ai-pattern-helpers';

export const NAVAL_PATTERNS: AiPattern[] = [
  {
    id: 'naval-open-skills',
    priority: 78,
    evaluate({ player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat) return null;
      const chain: SkillId[] = [SkillId.WATER, SkillId.NAVIGATION, SkillId.CATAPULT];
      for (const skill of chain) {
        if (state.opened.has(skill)) continue;
        if (skill === SkillId.CATAPULT && !hasSkill(player, SkillId.SHIELDS)) {
          if (!state.opened.has(SkillId.SHIELDS) && canOpenSkill(player, SkillId.SHIELDS)) {
            return [{ type: AiActionType.OPEN_SKILL, skill: SkillId.SHIELDS }];
          }
          continue;
        }
        if (canOpenSkill(player, skill)) return [{ type: AiActionType.OPEN_SKILL, skill }];
      }
      return null;
    },
  },
  {
    id: 'naval-build-port',
    priority: 77,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat || !situation.nearestNaval) return null;
      if (!hasSkill(player, SkillId.WATER)) return null;
      const naval = situation.nearestNaval;
      let best: MapTile | null = null;
      let bestDist = Infinity;
      for (const tile of map.tiles) {
        if (state.built.has(key(tile.q, tile.r))) continue;
        if (!canBuildPort(map, tile, player)) continue;
        if (!canAffordAt(map, player, tile, BUILDING_COSTS.port)) continue;
        const d = hexDistance(tile, naval.tile);
        if (d < bestDist) {
          bestDist = d;
          best = tile;
        }
      }
      if (!best) return null;
      return [{ type: AiActionType.BUILD, q: best.q, r: best.r, kind: BuildingKind.PORT }];
    },
  },
  {
    id: 'naval-board-ship',
    priority: 76,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat) return null;
      if (!hasSkill(player, SkillId.NAVIGATION)) return null;
      const port = map.tiles.find((t) => t.building !== null && t.building.kind === BuildingKind.PORT && t.ownedBy === player.index);
      if (!port) return null;
      if (state.occupied.has(key(port.q, port.r))) return null;
      const hasShip = map.tiles.some((t) => t.unit && t.unit.owner === player.index && t.unit.shipLevel !== undefined);
      if (hasShip) return null;
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      let best: { unit: Unit; step: MapTile; dist: number } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // A unit that can strike an enemy this turn is pressing that fight.
        if (attackableTargets(map, unit, player.index).length > 0) continue;
        // Don't strip the last defender from a village a land enemy can reach.
        if (t.settlement && t.settlement.owner === player.index && landEnemyCanReach(map, t, player.index)) continue;
        const before = hexDistance(unit, port);
        for (const c of reachableTargets(map, unit, undefined, canClimb, true, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement && c.settlement.owner === player.index) continue;
          const after = hexDistance(c, port);
          if (after >= before) continue;
          if (!best || after < best.dist) best = { unit, step: c, dist: after };
        }
      }
      if (!best) return null;
      return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  },
  {
    id: 'naval-hunt',
    priority: 75,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat) return null;
      if (situation.navalEnemies.length === 0) return null;
      const pirates = situation.navalEnemies.filter((e) => e.unit.type === UnitType.PIRATE);
      const safeTile = (c: MapTile): boolean => !pirates.some((p) => hexDistance(c, p.tile) < 2);
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      let best: { action: AiAction[]; score: number } | null = null;
      for (const t of map.tiles) {
        const ship = t.unit;
        if (!ship || ship.owner !== player.index || ship.shipLevel === undefined) continue;
        if (state.acted.has(ship.id) || state.moved.has(ship.id)) continue;
        const range = shipAttackDistance(ship);
        for (const e of situation.navalEnemies) {
          const enemyTile = e.tile;
          if (!enemyTile.unit) continue;
          const dist = hexDistance(ship, enemyTile);
          if (dist >= 2 && dist <= range) {
            const score = 600 - dist * 10;
            if (!best || score > best.score) {
              best = { action: [{ type: AiActionType.ATTACK, unitId: ship.id, q: enemyTile.q, r: enemyTile.r }], score };
            }
            continue;
          }
          for (const c of reachableTargets(map, ship, undefined, canClimb, true, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            // Ships sail, they do not land through the AI planner; only water
            // destinations are real moves.
            if (!isWaterType(c.terrain)) continue;
            if (!safeTile(c)) continue;
            const nd = hexDistance(c, enemyTile);
            const moveDist = hexDistance(ship, c);
            if (nd >= 2 && nd <= range) {
              const score = 550 - nd * 10 - moveDist;
              if (!best || score > best.score) {
                best = {
                  action: [
                    { type: AiActionType.MOVE, unitId: ship.id, q: c.q, r: c.r },
                    { type: AiActionType.ATTACK, unitId: ship.id, q: enemyTile.q, r: enemyTile.r },
                  ],
                  score,
                };
              }
            } else if (nd < dist && nd >= 2) {
              const score = 250 - nd * 10 - moveDist;
              if (!best || score > best.score) {
                best = { action: [{ type: AiActionType.MOVE, unitId: ship.id, q: c.q, r: c.r }], score };
              }
            }
          }
        }
      }
      if (!best) return null;
      return best.action;
    },
  },
  {
    id: 'naval-position-catapult',
    priority: 73,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat || !situation.nearestNaval) return null;
      if (!hasSkill(player, SkillId.CATAPULT)) return null;
      const naval = situation.nearestNaval;
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      let best: { unit: Unit; step: MapTile; score: number } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.CATAPULT) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // A catapult garrisoning an endangered own village holds its ground.
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        // Already able to fire: leave it to the attack logic.
        if (attackableTargets(map, unit, player.index).some((a) => a.unit && isNavalEnemy(a.unit))) continue;
        const before = hexDistance(unit, naval.tile);
        for (const c of reachableTargets(map, unit, undefined, canClimb, false, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement) continue;
          const after = hexDistance(c, naval.tile);
          // Step closer each turn but never park within a pirate's easy reach
          // (range 3): hold the catapult at distance >= 4.
          if (after >= before || after < 4) continue;
          if (coastExposedTile(map, c, situation.navalEnemies)) continue;
          const score = -after;
          if (!best || score > best.score) best = { unit, step: c, score };
        }
      }
      if (!best) return null;
      return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  },
];
