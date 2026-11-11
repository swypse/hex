import { SkillId, SpawnPreference, UnitType } from '@enums';
import { counterScore, effectiveCost } from '../../balance/balance';
import { canAffordAt } from '../../economy/stock';
import { isExploredFor } from '../../map/explore';
import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { TRIBE_SPECIAL_UNIT } from '../../tribes';
import { resolveCombat } from '../../units/combat';
import { isShip } from '../../units/ship';
import { makeUnit, unitMaxHp, unitSpawnCost } from '../../units/units';
import { flagsFor } from '../config/flags';
import { personalityFor } from '../config/personality';
import { enemyReach, enemyReachSum } from '../situation/enemy-reach';
import { bestAssaultType } from './assault-type';
import { knightsWanted } from './knights-wanted';

const SPAWN_ORDER: Record<SpawnPreference, UnitType[]> = {
  offense: [UnitType.KNIGHT, UnitType.SWORDSMAN, UnitType.CATAPULT, UnitType.WARRIOR, UnitType.RIDER, UnitType.ARCHER, UnitType.SHIELD, UnitType.STALKER, UnitType.BUILDER, UnitType.BANNER, UnitType.BERSERKER, UnitType.TRAPPER, UnitType.STORMCALLER, UnitType.STUNNER],
  defense: [UnitType.SHIELD, UnitType.KNIGHT, UnitType.CATAPULT, UnitType.ARCHER, UnitType.SWORDSMAN, UnitType.WARRIOR, UnitType.RIDER, UnitType.STALKER, UnitType.BUILDER, UnitType.BANNER, UnitType.BERSERKER, UnitType.TRAPPER, UnitType.STORMCALLER, UnitType.STUNNER],
  scout: [UnitType.RIDER, UnitType.KNIGHT, UnitType.SWORDSMAN, UnitType.WARRIOR, UnitType.ARCHER, UnitType.SHIELD, UnitType.CATAPULT, UnitType.STALKER, UnitType.BUILDER, UnitType.BANNER, UnitType.BERSERKER, UnitType.TRAPPER, UnitType.STORMCALLER, UnitType.STUNNER],
  naval: [UnitType.CATAPULT, UnitType.ARCHER, UnitType.SHIELD, UnitType.WARRIOR, UnitType.RIDER, UnitType.SWORDSMAN, UnitType.KNIGHT, UnitType.STALKER, UnitType.BUILDER, UnitType.BANNER, UnitType.BERSERKER, UnitType.TRAPPER, UnitType.STORMCALLER, UnitType.STUNNER],
};

/** Spawn priority for `prefer`: for offense the player's play style puts its favourite types first. */
function spawnOrder(player: Player, prefer: SpawnPreference): UnitType[] {
  const base = SPAWN_ORDER[prefer];
  if (prefer !== SpawnPreference.OFFENSE) return base;
  const first = personalityFor(player).offenseTypes;
  return first.length === 0 ? base : [...first, ...base.filter((type) => !first.includes(type))];
}

/** Land units that can walk onto an emptied enemy village after the ranged
 *  units shot its garrison down (a capture needs a unit standing on the tile). */
const FINISHER_TYPES = new Set<UnitType>([UnitType.KNIGHT, UnitType.RIDER, UnitType.SWORDSMAN, UnitType.WARRIOR, UnitType.SHIELD, UnitType.BERSERKER]);

const RANGED_TYPES = new Set<UnitType>([UnitType.ARCHER, UnitType.CATAPULT, UnitType.STUNNER]);

/** Ranged units per finisher above which the army is out of balance. */
const MAX_RANGED_PER_FINISHER = 2;

/** True when the player's ranged units outnumber its finishers too heavily: they
 *  kill garrisons that nobody is left to step in behind, so the village just
 *  respawns a defender and the siege never ends. */
function armyNeedsFinisher(map: GameMap, player: Player): boolean {
  let ranged = 0;
  let finishers = 0;
  for (const t of map.tiles) {
    const u = t.unit;
    if (!u || u.owner !== player.index || u.shipLevel !== undefined) continue;
    if (RANGED_TYPES.has(u.type)) ranged += 1;
    else if (FINISHER_TYPES.has(u.type)) finishers += 1;
  }
  return ranged > finishers * MAX_RANGED_PER_FINISHER;
}

/** Count of each enemy unit type currently visible to `player`, for weighing
 *  a spawn choice against what the enemy is actually fielding. */
function visibleEnemyComposition(map: GameMap, playerIndex: number): Map<UnitType, number> {
  const counts = new Map<UnitType, number>();
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === playerIndex || t.unit.owner < 0) continue;
    if (t.unit.isStealthed === true || !isExploredFor(t, playerIndex)) continue;
    counts.set(t.unit.type, (counts.get(t.unit.type) ?? 0) + 1);
  }
  return counts;
}

/** Weight of the retaliation a defender deals relative to the hp it keeps. */
const DEFENDER_COUNTER_WEIGHT = 0.5;

/** Defense-spawn score of `type` on `village`: hp left after the enemy's turn
 *  plus the counter damage it would deal to the enemies that can reach it. */
function defenderScore(map: GameMap, village: MapTile, playerIndex: number, type: UnitType): number {
  const ghost = makeUnit(playerIndex, type, village.q, village.r);
  const tile: MapTile = { ...village, unit: ghost };
  let damage = 0;
  let counter = 0;
  for (const t of map.tiles) {
    const enemy = t.unit;
    if (!enemy || enemy.owner === playerIndex || enemy.owner < 0 || isShip(enemy)) continue;
    if (enemy.isStealthed === true || !isExploredFor(t, playerIndex)) continue;
    const reach = enemyReach(enemy);
    if (hexDistance(village, t) > reach.move + reach.attack) continue;
    const res = resolveCombat(map, enemy, tile);
    damage += res.attackerDamage;
    counter += res.counterDamage;
  }
  return unitMaxHp(ghost) - damage + counter * DEFENDER_COUNTER_WEIGHT;
}

/** Best affordable, unlocked unit type for `prefer`. Behind `AiFlags.composition`
 *  (off by default — see the flag's doc comment), and with `map` and a visible
 *  enemy army, offense/defense spawns are picked by open-terrain duel counter
 *  value against that army per unit of effective cost, instead of the fixed
 *  `SPAWN_ORDER`; the static order remains the fallback otherwise (nothing
 *  spotted yet, no map given, or a scout/naval preference). */
export function bestSpawnableUnitType(
  player: Player,
  prefer: SpawnPreference = SpawnPreference.OFFENSE,
  map?: GameMap,
  village?: MapTile,
  /** Optional filter: types it rejects are never chosen (e.g. would die at once). */
  allowed?: (type: UnitType) => boolean,
): UnitType | null {
  const candidates: UnitType[] = [];
  for (const type of spawnOrder(player, prefer)) {
    if (allowed && !allowed(type)) continue;
    if (TRIBE_SPECIAL_UNIT[player.tribe] !== type && Object.values(TRIBE_SPECIAL_UNIT).includes(type)) continue;
    if (type === UnitType.RIDER && !hasSkill(player, SkillId.RIDING)) continue;
    if (type === UnitType.KNIGHT && !hasSkill(player, SkillId.KNIGHTS)) continue;
    if (type === UnitType.SWORDSMAN && !hasSkill(player, SkillId.SWORDSMAN)) continue;
    if (type === UnitType.CATAPULT && !hasSkill(player, SkillId.CATAPULT)) continue;
    if (type === UnitType.SHIELD && !hasSkill(player, SkillId.SHIELDS)) continue;
    if (type === UnitType.ARCHER && !hasSkill(player, SkillId.ARCHER)) continue;
    const cost = unitSpawnCost(type);
    // The money is the player's; wood and ore come from the spawning village's
    // network (without a village only the money can be checked).
    const affordable = map && village ? canAffordAt(map, player, village, cost) : player.resources.money >= cost.money;
    if (affordable) candidates.push(type);
  }
  if (candidates.length === 0) return null;
  // A village an enemy can reach is held by the unit that survives and hits back
  // best, not by a fixed type order (an archer next to a knight just dies).
  if (map && village && prefer === SpawnPreference.DEFENSE) {
    const threatened = map.tiles.some((t) => t.unit && t.unit.owner !== player.index && t.unit.owner >= 0 && !isShip(t.unit) && t.unit.isStealthed !== true && isExploredFor(t, player.index) && hexDistance(village, t) <= enemyReachSum(t.unit));
    if (threatened) {
      let bestType = candidates[0]!;
      let bestScore = -Infinity;
      for (const type of candidates) {
        const score = defenderScore(map, village, player.index, type);
        if (score > bestScore) {
          bestScore = score;
          bestType = type;
        }
      }
      return bestType;
    }
  }
  if (map && (prefer === SpawnPreference.OFFENSE || prefer === SpawnPreference.DEFENSE) && candidates.includes(UnitType.KNIGHT) && knightsWanted(map, player)) {
    return UnitType.KNIGHT;
  }
  if (map && prefer === SpawnPreference.OFFENSE && flagsFor(player).finishers && armyNeedsFinisher(map, player)) {
    const finisher = candidates.find((type) => FINISHER_TYPES.has(type));
    if (finisher) return finisher;
  }
  if (map && prefer === SpawnPreference.OFFENSE && flagsFor(player).assaultType) {
    const pick = bestAssaultType(map, player.index, candidates);
    if (pick) return pick;
  }
  if (!map || (prefer !== SpawnPreference.OFFENSE && prefer !== SpawnPreference.DEFENSE) || !flagsFor(player).composition) return candidates[0]!;
  const enemies = visibleEnemyComposition(map, player.index);
  if (enemies.size === 0) return candidates[0]!;

  let best = candidates[0]!;
  let bestScore = -Infinity;
  candidates.forEach((type, rank) => {
    let raw = 0;
    for (const [enemyType, count] of enemies) raw += count * counterScore(type, enemyType);
    // Divide by cost so a cheap solid counter beats an expensive marginal one;
    // a tiny rank-based nudge keeps ties resolved toward the static priority.
    const score = raw / effectiveCost(type) - rank * 1e-6;
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  });
  return best;
}
