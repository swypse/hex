import { type MapTile } from '../../map/map-gen';
import { hexDistance } from '../../map/hex';
import { isExploredFor } from '../../map/explore';
import { reachableTargets } from '../../units/selection';
import { hasSkill } from '../../skills';
import { attackDamage } from '../../units/combat';
import { unitMaxHp, type Unit } from '../../units/units';
import { type AiAction } from '../ai-types';
import { flagsFor } from '../ai-flags';
import { type AiPattern, attackersForTile, enemyCanAttackNext, enemyCanReach, gangAttackActions, isSupportUnit, key } from '../ai-pattern-helpers';
import { AiActionType, AiStance, SkillId, UnitType } from '@enums';

/** Own units within this many hexes of an enemy village take part in its siege. */
const SIEGE_RADIUS = 6;
/** Fewest nearby units for a siege (a lone unit is left to the other patterns). */
const SIEGE_MIN = 3;
/** Units gather this far from the village before the joint strike. */
const STAGING_DIST = 2;
/** Share of the besiegers that must be able to strike at once for the assault. */
const STRIKE_QUORUM = 0.7;
/** Turns the group waits for stragglers before striking with whoever is there. */
const MAX_WAIT_TURNS = 2;
/** Only units at or above this share of max hp join a siege: wounded ones drag it down. */
const FIT_HP_RATIO = 0.8;
/** Score bonus for the village already under siege (commitment). */
const COMMIT_BONUS = 40;
/** Besiegers give up when enemy units near the village out-damage them by this ratio. */
const ABORT_RATIO = 2;

function besieger(map: Parameters<typeof enemyCanReach>[0], playerIndex: number, t: MapTile): Unit | null {
  const u = t.unit;
  if (!u || u.owner !== playerIndex) return null;
  if (isSupportUnit(u) || u.type === UnitType.STALKER || u.type === UnitType.PIRATE || u.shipLevel !== undefined) return null;
  if (u.hp < unitMaxHp(u) * FIT_HP_RATIO) return null;
  if (t.settlement?.owner === playerIndex) return null;
  return u;
}

/** Group attack on an enemy village: every unit near it gathers, then all of
 *  them strike together (or step on the empty village), instead of one unit
 *  attacking while the others wander. The target is kept across turns. */
export const SIEGE_PATTERN: AiPattern = {
  id: 'siege-village',
  priority: 185,
  evaluate({ map, player, state, situation, turn = 0 }): AiAction[] | null {
    if (!flagsFor(player).siege) return null;
    if (situation?.stance === AiStance.DEFEND || situation?.endangered) return null;
    const canClimb = hasSkill(player, SkillId.CLIMBING);
    const canDock = hasSkill(player, SkillId.NAVIGATION);

    const units = map.tiles.filter((t) => besieger(map, player.index, t) !== null);
    if (units.length < SIEGE_MIN) return null;
    const idle = (t: MapTile): boolean => !state.acted.has(t.unit!.id) && !state.moved.has(t.unit!.id);

    let target: MapTile | null = null;
    let bestScore = -Infinity;
    for (const v of map.tiles) {
      if (!v.settlement || v.settlement.owner === null || v.settlement.owner === player.index) continue;
      if (!isExploredFor(v, player.index)) continue;
      const near = units.filter((t) => hexDistance(t, v) <= SIEGE_RADIUS);
      if (near.length < SIEGE_MIN) continue;
      const mine = near.reduce((s, t) => s + attackDamage(t.unit!), 0);
      let theirs = 0;
      for (const e of map.tiles) {
        if (!e.unit || e.unit.owner === player.index || e.unit.owner < 0 || e.unit.isStealthed === true) continue;
        if (isExploredFor(e, player.index) && hexDistance(e, v) <= STAGING_DIST) theirs += attackDamage(e.unit);
      }
      if (theirs > mine * ABORT_RATIO) continue;
      const nearest = Math.min(...near.map((t) => hexDistance(t, v)));
      let score = near.length * 10 - nearest;
      if (player.siege && player.siege.q === v.q && player.siege.r === v.r) score += COMMIT_BONUS;
      if (score > bestScore) {
        bestScore = score;
        target = v;
      }
    }
    if (!target) {
      player.siege = null;
      return null;
    }
    if (!player.siege || player.siege.q !== target.q || player.siege.r !== target.r) {
      player.siege = { q: target.q, r: target.r, since: turn };
    }
    const waited = turn - player.siege.since;

    const squad = units.filter((t) => hexDistance(t, target!) <= SIEGE_RADIUS && idle(t));
    if (squad.length === 0) return null;
    const garrison = target.unit && target.unit.owner !== player.index ? target.unit : null;

    if (garrison) {
      const attackers = attackersForTile(map, player, target, state);
      const total = attackers.reduce((s, a) => s + attackDamage(a.unit), 0);
      // A lone striker never opens the assault: the enemy would refill the village.
      const ready = waited >= MAX_WAIT_TURNS || (attackers.length >= 2 && (total >= garrison.hp || attackers.length >= Math.ceil(squad.length * STRIKE_QUORUM)));
      if (ready && attackers.length > 0) {
        const actions = gangAttackActions(map, player, target, attackers, state);
        if (actions.length > 0) return actions;
      }
    } else if (!state.occupied.has(key(target.q, target.r))) {
      // Empty village: the nearest unit that can reach it steps in.
      let best: { unit: Unit; d: number } | null = null;
      for (const t of squad) {
        if (state.moved.has(t.unit!.id)) continue;
        if (!reachableTargets(map, t.unit!, undefined, canClimb, canDock, player.index).some((c) => c.q === target!.q && c.r === target!.r)) continue;
        const d = hexDistance(t, target);
        if (!best || d < best.d) best = { unit: t.unit!, d };
      }
      if (best) return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: target.q, r: target.r }];
    }

    // The rest close in: to the staging ring while waiting, to the village once striking.
    const ring = garrison ? STAGING_DIST : 1;
    const ordered = [...squad].sort((a, b) => hexDistance(b, target!) - hexDistance(a, target!));
    for (const t of ordered) {
      const unit = t.unit!;
      if (state.moved.has(unit.id) || state.acted.has(unit.id)) continue;
      const d0 = hexDistance(t, target);
      if (d0 <= ring) {
        state.moved.add(unit.id);
        continue;
      }
      let best: { c: MapTile; score: number } | null = null;
      for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
        if (state.occupied.has(key(c.q, c.r))) continue;
        if (c.settlement && c.settlement.owner === player.index) continue;
        if (c.settlement && c.settlement.owner !== player.index) continue;
        const dc = hexDistance(c, target);
        if (dc >= d0 || dc < ring) continue;
        let score = -(dc - ring) * 10;
        if (enemyCanAttackNext(map, c, player.index)) score -= 15;
        if (!best || score > best.score) best = { c, score };
      }
      if (!best) {
        state.moved.add(unit.id);
        continue;
      }
      return [{ type: AiActionType.MOVE, unitId: unit.id, q: best.c.q, r: best.c.r }];
    }
    return null;
  },
};
