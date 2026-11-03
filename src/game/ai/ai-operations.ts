import { attackableTargets, attackDamage, chooseBestAttack, tradeIsFavorable } from '../units/combat';
import { flagsFor } from './ai-flags';
import { type AiAction, type AiOperation } from './ai-types';
import { type AiPatternContext, enemyCanAttackNext, enemyCanReach, isSupportUnit } from './ai-patterns';
import { type AiSituation } from './ai-situation';
import { isExploredFor } from '../map/explore';
import { hexDistance, hexNeighbors } from '../map/hex';
import { type GameMap, type MapTile } from '../map/map-gen';
import { type Player } from '../players';
import { reachableTargets } from '../units/selection';
import { hasSkill } from '../skills';
import { isMountainType, isWaterType } from '../map/tile-types';

import { unitMaxHp, type Unit } from '../units/units';
import { AiActionType, AiGoalId, AiOperationPhase, AiStance, SkillId, UnitType } from '@enums';
import { tileAt } from '../map/tile-index';
import { type WalkField, walkDistance, walkDistances } from './ai-walk';

/** Fewest idle units for which the AI bothers running a squad operation. */
const MIN_SQUAD = 3;
/** The rally hex sits this many hexes (min..max) from the target village. */
const RALLY_MIN_DIST = 3;
const RALLY_MAX_DIST = 5;
/** Share of the squad that must be at the rally hex before the assault starts. */
const RALLY_QUORUM = 0.7;
/** The target counts as contested when the enemy force near it is at least this
 *  share of the squad's power (ratio applied as near * RATIO > squad). */
const CONTESTED_RATIO = 2;
/** Turns after which an operation stops waiting for stragglers. */
const LEASH_TURNS = 14;
/** The assault is called off when the squad is weaker than this share of the
 *  enemy force standing near the target. */
const ABORT_POWER_RATIO = 0.6;
/** No squad member may advance further than this past the rearmost one. */
const LEASH_SLACK = 2;
/** Units this far from the destination are stragglers and do not hold others back. */
const STRAGGLER_DIST = 10;

function key(q: number, r: number): string {
  return `${q},${r}`;
}

function walkField(map: GameMap, player: Player, dest: { q: number; r: number }): WalkField {
  return walkDistances(map, player, [dest]);
}

function walk(field: WalkField, t: { q: number; r: number }): number {
  return walkDistance(field, t);
}

/** Land unit that can join a squad: fit, not support/stalker/ship, and not the
 *  last defender of a village an enemy could reach. */
function squadEligible(map: GameMap, player: Player, tile: MapTile): Unit | null {
  const unit = tile.unit;
  if (!unit || unit.owner !== player.index) return null;
  if (isSupportUnit(unit) || unit.type === UnitType.STALKER || unit.type === UnitType.PIRATE) return null;
  if (unit.shipLevel !== undefined) return null;
  if (unit.hp * 2 < unitMaxHp(unit)) return null;
  if (tile.settlement && tile.settlement.owner === player.index && enemyCanReach(map, tile, player.index)) return null;
  return unit;
}

function squadTiles(map: GameMap, player: Player, field: WalkField): MapTile[] {
  return map.tiles.filter((t) => walk(field, t) < Infinity && squadEligible(map, player, t) !== null);
}

function enemyVillageAt(map: GameMap, player: Player, target: { q: number; r: number }): MapTile | null {
  const t = tileAt(map, target.q, target.r);
  if (!t?.settlement || t.settlement.owner === null || t.settlement.owner === player.index) return null;
  return isExploredFor(t, player.index) ? t : null;
}

function nearEnemyPower(map: GameMap, player: Player, target: { q: number; r: number }): number {
  let total = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === player.index || t.unit.owner < 0) continue;
    if (t.unit.isStealthed === true || !isExploredFor(t, player.index)) continue;
    if (hexDistance(t, target) <= 4) total += attackDamage(t.unit);
  }
  return total;
}

function chooseRally(map: GameMap, player: Player, target: MapTile, squad: MapTile[], targetField: WalkField): { q: number; r: number } {
  const canClimb = hasSkill(player, SkillId.CLIMBING);
  let cq = 0;
  let cr = 0;
  for (const t of squad) {
    cq += t.q;
    cr += t.r;
  }
  const centroid = { q: Math.round(cq / squad.length), r: Math.round(cr / squad.length) };
  let best: MapTile | null = null;
  let bestScore = -Infinity;
  for (const t of map.tiles) {
    if (t.unit || t.settlement || isWaterType(t.terrain)) continue;
    if (isMountainType(t.terrain) && !canClimb) continue;
    if (!isExploredFor(t, player.index)) continue;
    const dt = walk(targetField, t);
    if (dt < RALLY_MIN_DIST || dt > RALLY_MAX_DIST) continue;
    let score = -hexDistance(t, centroid);
    if (enemyCanAttackNext(map, t, player.index)) score -= 6;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best ? { q: best.q, r: best.r } : { q: target.q, r: target.r };
}

/** Rebuilds the player's operation once per AI turn from the strategy target
 *  (army goal, else the war-stance front). Returns null, and clears any stored
 *  operation, when no worthwhile squad plan exists. */
export function updateOperation(
  map: GameMap,
  player: Player,
  situation: AiSituation,
  turn: number,
): AiOperation | null {
  const clear = (): null => {
    player.operation = null;
    return null;
  };
  if (!flagsFor(player).operations) return clear();
  if (situation.stance === AiStance.DEFEND || situation.endangered) return clear();
  const armyGoal = player.strategy?.goals.find((g) => g.id === AiGoalId.ARMY)?.target ?? null;
  const goal = armyGoal ?? (situation.frontTarget ? { q: situation.frontTarget.q, r: situation.frontTarget.r } : null);
  if (!goal) return clear();
  const targetTile = enemyVillageAt(map, player, goal);
  if (!targetTile) return clear();
  const targetField = walkField(map, player, goal);
  const squad = squadTiles(map, player, targetField);
  if (squad.length < MIN_SQUAD) return clear();

  const squadPower = squad.reduce((s, t) => s + attackDamage(t.unit!), 0);
  const nearPower = nearEnemyPower(map, player, goal);
  // A weakly held village is rushed at once: waiting to mass up only gives the
  // defender time. Gathering and the advance leash are for contested targets.
  const contested = nearPower * CONTESTED_RATIO > squadPower;

  const prev = player.operation;
  const sameTarget = prev !== null && prev !== undefined && prev.target.q === goal.q && prev.target.r === goal.r;
  let op: AiOperation = sameTarget
    ? { ...prev! }
    : {
        target: { q: goal.q, r: goal.r },
        rally: chooseRally(map, player, targetTile, squad, targetField),
        phase: contested ? AiOperationPhase.GATHER : AiOperationPhase.ASSAULT,
        startTurn: turn,
        leash: contested,
      };
  op.leash = contested && turn - op.startTurn <= LEASH_TURNS;

  if (op.phase === AiOperationPhase.GATHER) {
    const rallyField = walkField(map, player, op.rally);
    const atRally = squad.filter((t) => walk(rallyField, t) <= 3).length;
    const allClose = squad.every((t) => walk(targetField, t) <= 6);
    const ready = !contested || atRally >= Math.ceil(squad.length * RALLY_QUORUM) || allClose || turn - op.startTurn > LEASH_TURNS;
    if (ready && squadPower >= nearPower * ABORT_POWER_RATIO) op.phase = AiOperationPhase.ASSAULT;
  } else if (squadPower < nearPower * ABORT_POWER_RATIO) {
    op = { ...op, phase: AiOperationPhase.GATHER, rally: chooseRally(map, player, targetTile, squad, targetField), startTurn: turn, leash: true };
  }
  player.operation = op;
  return op;
}

export const OPERATION_PATTERN = {
  id: 'operation-advance',
  priority: 79,
  evaluate(ctx: AiPatternContext): AiAction[] | null {
    const { map, player, state, operation: op, difficulty } = ctx;
    if (!op) return null;
    if (!enemyVillageAt(map, player, op.target)) return null;
    const canClimb = hasSkill(player, SkillId.CLIMBING);
    const canDock = hasSkill(player, SkillId.NAVIGATION);

    const targetField = walkField(map, player, op.target);
    const field = op.phase === AiOperationPhase.GATHER ? walkField(map, player, op.rally) : targetField;
    const squad = squadTiles(map, player, targetField).filter((t) => walk(field, t) < Infinity);
    if (squad.length < 2) return null;
    let rearmost = 0;
    for (const t of squad) {
      const d = walk(field, t);
      if (d <= STRAGGLER_DIST && d > rearmost) rearmost = d;
    }
    const leashDist = rearmost - LEASH_SLACK;
    // Farthest units move first so the tail is never blocked by the head.
    const order = [...squad].sort((a, b) => walk(field, b) - walk(field, a));

    for (const t of order) {
      const unit = t.unit!;
      if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
      // A unit that can strike right now is left to the combat patterns.
      if (attackableTargets(map, unit, player.index).length > 0) continue;
      const d0 = walk(field, t);
      if (op.phase === AiOperationPhase.GATHER && d0 <= 1) {
        state.moved.add(unit.id);
        continue;
      }
      let best: { c: MapTile; score: number; attack: MapTile | null } | null = null;
      for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
        if (state.occupied.has(key(c.q, c.r))) continue;
        if (c.settlement && c.settlement.owner === player.index) continue;
        const isTarget = c.q === op.target.q && c.r === op.target.r;
        // A foreign village is only stepped on when it is the operation's target.
        if (c.settlement && c.settlement.owner !== player.index && !isTarget) continue;
        const dc = walk(field, c);
        if (dc >= d0) continue;
        const ghost: Unit = { ...unit, q: c.q, r: c.r };
        let attack: MapTile | null = null;
        if (op.phase === AiOperationPhase.ASSAULT && !isTarget) {
          const a = chooseBestAttack(map, ghost, player.index);
          if (a && (!difficulty?.checkTrades || tradeIsFavorable(ghost, a))) attack = a;
        }
        if (!attack && op.leash && dc < leashDist) continue;
        let score = -dc * 10;
        if (enemyCanAttackNext(map, c, player.index)) score -= 15;
        if (attack) score += 1000;
        if (isTarget) score += 500;
        if (!best || score > best.score) best = { c, score, attack };
      }
      if (!best) {
        state.moved.add(unit.id);
        continue;
      }
      const actions: AiAction[] = [{ type: AiActionType.MOVE, unitId: unit.id, q: best.c.q, r: best.c.r }];
      if (best.attack) actions.push({ type: AiActionType.ATTACK, unitId: unit.id, q: best.attack.q, r: best.attack.r });
      return actions;
    }
    return null;
  },
};
