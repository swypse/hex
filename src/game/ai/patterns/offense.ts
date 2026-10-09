import { type MapTile } from '../../map/map-gen';
import { hasSkill } from '../../skills';
import { reachableTargets } from '../../units/selection';
import { UNIT_MOVE_POINTS, type Unit } from '../../units/units';
import { hexDistance } from '../../map/hex';
import { attackableTargets, attackDamage } from '../../units/combat';
import { isExploredFor } from '../../map/explore';
import { type AiAction } from '../ai-types';
import { coastExposedTile } from '../ai-situation';
import { adjacentEnemyVillages } from '../../units/stalker';
import { canUpgradeShip } from '../../units/ship';
import { extinguishCells } from '../../weather/fire';
import { isForestType } from '../../map/tile-types';
import { flagsFor } from '../ai-flags';
import { AiActionType, AiStance, GarrisonGuardKind, SkillId, UnitType } from '@enums';

import { type AiPattern, STALKER_STEALTH_RADIUS, STUN_MIN_DAMAGE, attackersForTile, enemyCanReach, guardGarrisonAttack, isSupportUnit, key, nearestEnemyDistanceFrom } from '../ai-pattern-helpers';

export const OFFENSE_PATTERNS: AiPattern[] = [
  {
    id: 'capture-ready-village',
    priority: 500,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner !== unit.owner && t.settlement.captureReady) {
          state.acted.add(unit.id);
          return [{ type: AiActionType.CAPTURE, q: t.q, r: t.r, unitId: unit.id }];
        }
      }
      return null;
    },
  },
  {
    // Fire on an own building, an own forest or under an own unit is put out
    // before anything else; a unit that is fighting this turn keeps fighting.
    id: 'extinguish-fire',
    priority: 220,
    evaluate({ map, player, state }): AiAction[] | null {
      let best: { action: AiAction[]; score: number } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (unit.hasMoved || unit.hasAttacked || unit.hasHealed || (unit.stunTurns ?? 0) >= 1) continue;
        const cells = extinguishCells(map, unit);
        if (cells.length === 0) continue;
        const fighting = attackableTargets(map, unit, player.index).length > 0;
        for (const c of cells) {
          // Standing in the flames of a forest costs 10 hp a round.
          const underOwn = c.unit?.owner === player.index && isForestType(c.terrain);
          let score = 0;
          if ((c.building && c.ownedBy === player.index) || c.bridge?.owner === player.index) score = 300;
          else if (underOwn) score = 250;
          else if (isForestType(c.terrain) && c.ownedBy === player.index) score = 150;
          if (score === 0) continue;
          if (fighting && c.unit !== unit) continue;
          if (c.q === unit.q && c.r === unit.r) score += 20;
          if (!best || score > best.score) best = { action: [{ type: AiActionType.EXTINGUISH, unitId: unit.id, q: c.q, r: c.r }], score };
        }
      }
      return best ? best.action : null;
    },
  },
  {
    // A ship is upgraded the moment it is affordable, before it fights as level 1.
    id: 'upgrade-ship',
    priority: 215,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.shipLevel === undefined || unit.shipLevel >= 3) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (!canUpgradeShip(map, unit, t, player)) continue;
        return [{ type: AiActionType.UPGRADE_SHIP, unitId: unit.id }];
      }
      return null;
    },
  },
  {
    id: 'stunner-prefer-stun',
    priority: 210,
    evaluate({ map, player, state }): AiAction[] | null {
      // The stunner is a regular ranged combat unit (it attacks like any
      // ranged unit), but when an enemy sits at full reach it prefers the stun:
      // no damage, no counter, and the target loses its turn.
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.STUNNER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) continue;
        let best: MapTile | null = null;
        let bestScore = -Infinity;
        for (const e of map.tiles) {
          if (!e.unit || e.unit.owner === player.index) continue;
          if (!isExploredFor(e, player.index)) continue;
          if (hexDistance(unit, e) !== 2) continue;
          const score = attackDamage(e.unit);
          if (score > bestScore) {
            bestScore = score;
            best = e;
          }
        }
        if (best) return [{ type: AiActionType.STUN, unitId: unit.id, q: best.q, r: best.r }];
      }
      return null;
    },
  },
  {
    id: 'stunner-approach-stun',
    priority: 205,
    evaluate({ map, player, state }): AiAction[] | null {
      // Walk into stun range (exactly 2 hexes) of the hardest-hitting reachable
      // enemy and stun it, but only with a follow-up attacker close behind:
      // a stunned target cannot counter, so the rest of the army hits it free.
      if (!flagsFor(player).stunnerHunt) return null;
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index || unit.type !== UnitType.STUNNER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        let best: { step: MapTile; target: MapTile; score: number } | null = null;
        for (const e of map.tiles) {
          if (!e.unit || e.unit.owner === player.index || e.unit.owner < 0) continue;
          if (!isExploredFor(e, player.index) || e.unit.isStealthed === true) continue;
          if ((e.unit.stunTurns ?? 0) >= 1) continue;
          const power = attackDamage(e.unit);
          if (power < STUN_MIN_DAMAGE) continue;
          let followers = 0;
          for (const f of map.tiles) {
            if (!f.unit || f.unit.owner !== player.index || f.unit === unit) continue;
            if (isSupportUnit(f.unit) || f.unit.type === UnitType.STALKER) continue;
            if (hexDistance(f, e) <= 4) followers += 1;
          }
          if (followers === 0) continue;
          for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner !== player.index) continue;
            if (hexDistance(c, e) !== 2) continue;
            const score = power * 10 + followers - hexDistance(t, c);
            if (!best || score > best.score) best = { step: c, target: e, score };
          }
        }
        if (best) {
          return [
            { type: AiActionType.MOVE, unitId: unit.id, q: best.step.q, r: best.step.r },
            { type: AiActionType.STUN, unitId: unit.id, q: best.target.q, r: best.target.r },
          ];
        }
      }
      return null;
    },
  },
  {
    id: 'attack-enemy-in-village',
    priority: 200,
    evaluate({ map, player, state }): AiAction[] | null {
      const enemyInVillage = map.tiles.find(
        (t) =>
          t.unit &&
          t.settlement &&
          t.settlement.owner === player.index &&
          t.unit.owner !== player.index,
      );
      if (!enemyInVillage) return null;
      const actions: AiAction[] = [];
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id)) continue;
        // Support units never join a fight; a stalker strikes only when it can
        // kill the defender outright.
        if (isSupportUnit(unit)) continue;
        if (unit.type === UnitType.STALKER && enemyInVillage.unit && attackDamage(unit) < enemyInVillage.unit.hp) continue;
        if (
          attackableTargets(map, unit, unit.owner).some(
            (a) => a.q === enemyInVillage.q && a.r === enemyInVillage.r,
          )
        ) {
          const garrisonGuard = guardGarrisonAttack(map, player, unit, enemyInVillage, state);
          if (garrisonGuard.kind === GarrisonGuardKind.HOLD) continue;
          actions.push({ type: AiActionType.ATTACK, unitId: unit.id, q: enemyInVillage.q, r: enemyInVillage.r });
          if (garrisonGuard.guardType) {
            actions.push({ type: AiActionType.SPAWN, q: t.q, r: t.r, unitType: garrisonGuard.guardType });
          }
          continue;
        }
        if (state.moved.has(unit.id)) continue;
        // A garrison in its own endangered village defends in place; it must
        // not march to help a different village and leave home empty.
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        const moveTarget = reachableTargets(map, unit, undefined, undefined, undefined, unit.owner).find(
          (c) =>
            !state.occupied.has(key(c.q, c.r)) &&
            hexDistance(c, enemyInVillage) <= unit.attackDistance,
        );
        if (moveTarget) {
          actions.push(
            { type: AiActionType.MOVE, unitId: unit.id, q: moveTarget.q, r: moveTarget.r },
            { type: AiActionType.ATTACK, unitId: unit.id, q: enemyInVillage.q, r: enemyInVillage.r },
          );
        }
      }
      return actions.length > 0 ? actions : null;
    },
  },
  {
    id: 'focus-fire',
    priority: 190,
    evaluate({ map, player, state }): AiAction[] | null {
      // Gang up on a single enemy: every idle unit that can attack it now — or
      // reach it with a move first — attacks it. Killable targets win, otherwise
      // the enemy that can be hit by the most units / combined damage is chosen.
      let best:
        | { t: MapTile; attackers: { unit: Unit; moveTo: MapTile | null }[]; killable: boolean; total: number }
        | null = null;
      for (const t of map.tiles) {
        const enemy = t.unit;
        if (!enemy || enemy.owner === player.index) continue;
        if (!isExploredFor(t, player.index)) continue;
        const attackers = attackersForTile(map, player, t, state);
        if (attackers.length < 2) continue;
        const total = attackers.reduce((s, a) => s + attackDamage(a.unit), 0);
        const killable = total >= enemy.hp;
        const better =
          best === null ||
          (killable && !best.killable) ||
          (killable === best.killable &&
            (attackers.length > best.attackers.length || (attackers.length === best.attackers.length && total > best.total)));
        if (better) best = { t, attackers, killable, total };
      }
      if (!best) return null;
      const actions: AiAction[] = [];
      for (const a of best.attackers) {
        // A garrison that joins from its own village without moving first may
        // take a lethal counter: it must not unless a spawn covers the village,
        // or hold entirely when it cannot be replaced.
        const garrisonGuard = a.moveTo ? null : guardGarrisonAttack(map, player, a.unit, best.t, state);
        if (garrisonGuard?.kind === GarrisonGuardKind.HOLD) continue;
        if (a.moveTo) actions.push({ type: AiActionType.MOVE, unitId: a.unit.id, q: a.moveTo.q, r: a.moveTo.r });
        actions.push({ type: AiActionType.ATTACK, unitId: a.unit.id, q: best.t.q, r: best.t.r });
        if (garrisonGuard?.guardType) {
          const home = map.tiles.find((x) => x.unit === a.unit);
          if (home) actions.push({ type: AiActionType.SPAWN, q: home.q, r: home.r, unitType: garrisonGuard.guardType });
        }
      }
      return actions;
    },
  },
  {
    id: 'stalker-restealth',
    priority: 132,
    evaluate({ map, player, state }): AiAction[] | null {
      // A stalker exposed near the enemy re-hides (stealth is lost by attacking
      // or ending a move beside an enemy village). Far from danger it stays
      // visible and scouts instead — hiding pointlessly wastes a whole turn.
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.STALKER || unit.shipLevel !== undefined) continue;
        if (unit.isStealthed) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) continue;
        // The holster cannot hide while standing beside an enemy village.
        if (adjacentEnemyVillages(map, unit, player.index).length > 0) continue;
        if (nearestEnemyDistanceFrom(map, player.index, t) > STALKER_STEALTH_RADIUS) continue;
        return [{ type: AiActionType.ENABLE_STEALTH, unitId: unit.id }];
      }
      return null;
    },
  },
  {
    id: 'stalker-scout',
    priority: 131,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      // The stalker is the Cats' scout: it explores to find villages, claims
      // empty ones and free villages, and only ever fights to kill a defender
      // standing inside a village so the tile can be claimed afterwards.
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== UnitType.STALKER) continue;
        if (unit.shipLevel !== undefined) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;

        // 1. Kill an enemy standing inside a village (its only combat) so the
        //    village tile can be taken next turn.
        let killTile: MapTile | null = null;
        let killStep: MapTile | null = null;
        for (const e of map.tiles) {
          if (!e.settlement || !e.unit || e.unit.owner === player.index) continue;
          if (!isExploredFor(e, player.index)) continue;
          if (attackableTargets(map, unit, player.index).some((a) => a.q === e.q && a.r === e.r)) {
            if (attackDamage(unit) >= e.unit.hp) {
              killTile = e;
              killStep = null;
              break;
            }
            continue;
          }
          for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === player.index) continue;
            const ghost: Unit = { ...unit, q: c.q, r: c.r };
            if (
              attackableTargets(map, ghost, player.index).some((a) => a.q === e.q && a.r === e.r) &&
              attackDamage(unit) >= e.unit.hp
            ) {
              killTile = e;
              killStep = c;
              break;
            }
          }
          if (killTile) break;
        }
        if (killTile) {
          return killStep
            ? [
                { type: AiActionType.MOVE, unitId: unit.id, q: killStep.q, r: killStep.r },
                { type: AiActionType.ATTACK, unitId: unit.id, q: killTile.q, r: killTile.r },
              ]
            : [{ type: AiActionType.ATTACK, unitId: unit.id, q: killTile.q, r: killTile.r }];
        }

        // 2. Move onto an empty (free) village to claim it.
        for (const v of map.tiles) {
          if (!v.settlement || v.settlement.owner !== null) continue;
          if (v.unit) continue;
          if (state.occupied.has(key(v.q, v.r))) continue;
          if (!reachableTargets(map, unit, undefined, canClimb, canDock, player.index).some((c) => c.q === v.q && c.r === v.r)) continue;
          return [{ type: AiActionType.MOVE, unitId: unit.id, q: v.q, r: v.r }];
        }

        // 3. Scout one step toward unexplored ground or an empty enemy village.
        let goal: MapTile | null = null;
        let goalDist = Infinity;
        for (const g of map.tiles) {
          if (!isExploredFor(g, player.index)) {
            const d = hexDistance(t, g);
            if (d < goalDist) {
              goalDist = d;
              goal = g;
            }
            continue;
          }
          if (g.settlement && g.settlement.owner !== player.index && !g.unit) {
            const d = hexDistance(t, g);
            if (d < goalDist) {
              goalDist = d;
              goal = g;
            }
          }
        }
        if (goal) {
          let bestStep: MapTile | null = null;
          let bestDist = Infinity;
          for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === player.index) continue;
            if (situation?.navalThreat && coastExposedTile(map, c, situation.navalEnemies)) continue;
            const d = hexDistance(c, goal);
            if (d >= hexDistance(t, goal)) continue;
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
    id: 'capture-free-village',
    priority: 130,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      let best: { unit: Unit; target: MapTile } | null = null;
      let bestDist = Infinity;
      for (const v of map.tiles) {
        if (!v.settlement || v.settlement.owner !== null) continue;
        if (!isExploredFor(v, player.index)) continue;
        if (state.occupied.has(key(v.q, v.r))) continue;
        if (v.unit && v.unit.owner === player.index) continue;
        for (const t of map.tiles) {
          const unit = t.unit;
          if (!unit || unit.owner !== player.index) continue;
          if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
          if (isSupportUnit(unit)) continue;
          if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
          if (
            !reachableTargets(map, unit, undefined, canClimb, canDock, player.index).some(
              (c) => c.q === v.q && c.r === v.r,
            )
          ) {
            continue;
          }
          const d = hexDistance(t, v);
          if (d < bestDist) {
            bestDist = d;
            best = { unit, target: v };
          }
        }
      }
      if (best) return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.target.q, r: best.target.r }];
      return null;
    },
  },
  {
    id: 'collect-bonus',
    priority: 125,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      const goals: MapTile[] = [];
      for (const t of map.tiles) {
        if (!t.bonus) continue;
        if (!isExploredFor(t, player.index)) continue;
        if (t.unit) continue;
        if (t.bonus.claimer === player.index) continue;
        goals.push(t);
      }
      if (goals.length === 0) return null;
      let best: { unit: Unit; step: MapTile; score: number } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        const targets = reachableTargets(map, unit, undefined, canClimb, canDock, player.index).filter(
          (c) => !state.occupied.has(key(c.q, c.r)) && !(c.settlement && c.settlement.owner === player.index),
        );
        if (targets.length === 0) continue;
        // Let combat go first: skip units that could move into an attack this turn.
        let canStrike = false;
        for (const c of targets) {
          const ghost: Unit = { ...unit, q: c.q, r: c.r };
          if (attackableTargets(map, ghost, unit.owner).length > 0) {
            canStrike = true;
            break;
          }
        }
        if (canStrike) continue;
        for (const g of goals) {
          const before = hexDistance(t, g);
          if (before === 0) continue;
          for (const c of targets) {
            const after = hexDistance(c, g);
            if (after >= before) continue;
            const score = after;
            if (best === null || score < best.score) best = { unit, step: c, score };
          }
        }
      }
      if (!best) return null;
      return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  },
  {
    id: 'reinforce-endangered-village',
    priority: 120,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || situation.stance !== AiStance.DEFEND) return null;
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      let best: { unit: Unit; step: MapTile; villageKey: string; score: number } | null = null;
      for (const d of situation.dangers) {
        const v = d.village;
        const vk = key(v.q, v.r);
        if (state.occupied.has(vk) || state.spawned.has(vk)) continue;
        if (v.unit && v.unit.owner === player.index) continue;
        for (const t of map.tiles) {
          const unit = t.unit;
          if (!unit || unit.owner !== player.index) continue;
          if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
          if (isSupportUnit(unit)) continue;
          if (t.settlement && t.settlement.owner === player.index) continue;
          // A unit that can strike an enemy this turn is pressing that fight —
          // do not strip it for garrison duty (that causes pointless retreat
          // loops when the unit is the only one left).
          if (attackableTargets(map, unit, player.index).length > 0) continue;
          if (hexDistance(t, v) > (d.enemyTurns * UNIT_MOVE_POINTS[unit.type]) / 10) continue;
          const reach = reachableTargets(map, unit, undefined, canClimb, canDock, player.index).filter(
            (c) =>
              !state.occupied.has(key(c.q, c.r)) &&
              ((c.q === v.q && c.r === v.r) || !(c.settlement && c.settlement.owner === player.index)),
          );
          let bestStep: MapTile | null = null;
          let bestStepDist = Infinity;
          for (const c of reach) {
            const dist = hexDistance(c, v);
            if (dist < bestStepDist) {
              bestStepDist = dist;
              bestStep = c;
            }
          }
          if (!bestStep) continue;
          const score = hexDistance(t, v);
          if (!best || score < best.score) best = { unit, step: bestStep, villageKey: vk, score };
        }
      }
      if (!best) return null;
      state.occupied.add(best.villageKey);
      return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  },
  {
    id: 'capture-push',
    priority: 110,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      for (const t of map.tiles) {
        if (!t.settlement || t.settlement.owner === player.index) continue;
        if (!isExploredFor(t, player.index)) continue;
        if (t.settlement.captureReady) continue;
        if (t.unit && t.unit.owner === player.index) continue;
        for (const src of map.tiles) {
          const unit = src.unit;
          if (!unit || unit.owner !== player.index) continue;
          if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
          if (isSupportUnit(unit)) continue;
          // Don't strip the last defender from a village an enemy could reach.
          if (src.settlement && src.settlement.owner === player.index && enemyCanReach(map, src, player.index)) continue;
          if (state.occupied.has(key(t.q, t.r))) continue;
          const canReach = reachableTargets(map, unit, undefined, canClimb, canDock, player.index).some(
            (c) => c.q === t.q && c.r === t.r,
          );
          if (!canReach) continue;
          return [{ type: AiActionType.MOVE, unitId: unit.id, q: t.q, r: t.r }];
        }
      }
      return null;
    },
  },
];
