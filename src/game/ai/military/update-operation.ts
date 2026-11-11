import { AiGoalId, AiOperationPhase, AiStance, SkillId } from '@enums';
import { isExploredFor } from '../../map/explore';
import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import { isMountainType, isWaterType } from '../../map/tile-types';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { attackDamage } from '../../units/combat';
import { flagsFor } from '../config/flags';
import { enemyForceNear } from '../situation/enemy-force-near';
import { enemyCanAttackNext } from '../situation/enemy-reach';
import { enemyVillageAt } from '../situation/enemy-village-at';
import type { AiSituation } from '../situation/situation';
import { type WalkField, walkDistance, walkDistances } from '../situation/walk-distances';
import type { AiOperation } from '../types/operation';
import { squadTiles } from './squad-members';

/** Fewest idle units for which the AI bothers running a squad operation. */
/** Enemy units within this many hexes of the target count as its defenders. */
const NEAR_TARGET_RADIUS = 4;
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
    const dt = walkDistance(targetField, t);
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
  const targetField = walkDistances(map, player, [goal]);
  const squad = squadTiles(map, player, targetField);
  const nearPower = enemyForceNear(map, player, goal, NEAR_TARGET_RADIUS);
  const minSquad = flagsFor(player).smallSquads ? (nearPower === 0 ? 1 : 2) : MIN_SQUAD;
  if (squad.length < minSquad) return clear();

  const squadPower = squad.reduce((s, t) => s + attackDamage(t.unit!), 0);
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
    const rallyField = walkDistances(map, player, [op.rally]);
    const atRally = squad.filter((t) => walkDistance(rallyField, t) <= 3).length;
    const allClose = squad.every((t) => walkDistance(targetField, t) <= 6);
    const ready = !contested || atRally >= Math.ceil(squad.length * RALLY_QUORUM) || allClose || turn - op.startTurn > LEASH_TURNS;
    if (ready && squadPower >= nearPower * ABORT_POWER_RATIO) op.phase = AiOperationPhase.ASSAULT;
  } else if (squadPower < nearPower * ABORT_POWER_RATIO) {
    op = { ...op, phase: AiOperationPhase.GATHER, rally: chooseRally(map, player, targetTile, squad, targetField), startTurn: turn, leash: true };
  }
  player.operation = op;
  return op;
}
