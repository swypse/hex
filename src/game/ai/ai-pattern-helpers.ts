import { type GameMap, type MapTile } from '../map/map-gen';
import { type Player } from '../players';
import { canAffordAt } from '../economy/stock';
import { isMountainType } from '../map/tile-types';
import { hasSkill } from '../skills';
import { reachableTargets } from '../units/selection';
import { makeUnit, movePoints, unitMaxHp, unitSpawnCost, UNIT_ATTACK_DISTANCE, type Unit } from '../units/units';
import { SeededRandom } from '../../util/random';
import { hexDistance, hexNeighbors } from '../map/hex';
import { attackableTargets, attackDamage, counterDamageTo as counterDamageToFromCombat, isPoorTrapperTarget, resolveCombat } from '../units/combat';
import { unitsInVillage, villageCapacity, buildingsInVillage, villageBuildingLimit } from '../economy/village';
import { isExploredFor } from '../map/explore';
import { type AiAction, type AiDirectives, type AiOperation, type AiPlannerState } from './ai-types';
import { type AiDifficultyProfile } from './ai-difficulty';
import { type AiSituation } from './ai-situation';
import { isShip, shipAttackDistance, shipMovePoints } from '../units/ship';
import { TRIBE_SPECIAL_UNIT } from '../tribes';
import { flagsFor } from './ai-flags';
import { personalityFor } from './ai-personality';
import { berserkerRage } from '../units/abilities';
import { counterScore, effectiveCost } from '../balance/balance';
import { AiActionType, AiStance, GarrisonGuardKind, SkillId, SpawnPreference, UnitType } from '@enums';
import { tileAt } from '../map/tile-index';

export interface AiPatternContext {
  map: GameMap;
  player: Player;
  rng: SeededRandom;
  state: AiPlannerState;
  situation?: AiSituation;
  difficulty?: AiDifficultyProfile;
  directives?: AiDirectives;
  operation?: AiOperation | null;
  /** The game turn being planned (0 when the caller did not pass it). */
  turn?: number;
}

export interface AiPattern {
  id: string;
  priority: number;
  evaluate(ctx: AiPatternContext): AiAction[] | null;
}

export function key(q: number, r: number): string {
  return `${q},${r}`;
}

/** A visible stalker within this many hexes of an enemy re-hides instead of
 *  staying exposed (stealth costs a whole turn, so far-from-danger stalkers
 *  keep scouting instead of hiding pointlessly). */
export const STALKER_STEALTH_RADIUS = 6;

/** Minimum attack force of an enemy worth walking the stunner up to. */
export const STUN_MIN_DAMAGE = 15;

/** Movement and attack reach of a unit in hexes, honoring ship stat tables.
 *  Ships keep their land-unit `.type`, so the raw MOVE_POINTS/ATTACK_DISTANCE
 *  tables drastically underestimate a levelled enemy ship's strike zone.
 *  Move points are converted to flat-land hexes via the standard 10-point
 *  tile cost. */
function enemyReach(unit: Unit): { move: number; attack: number } {
  if (isShip(unit)) return { move: shipMovePoints(unit) / 10, attack: shipAttackDistance(unit) };
  return { move: movePoints(unit) / 10, attack: UNIT_ATTACK_DISTANCE[unit.type] };
}

function enemyReachSum(unit: Unit): number {
  const r = enemyReach(unit);
  return r.move + r.attack;
}

/** Turns of enemy movement the garrison logic looks ahead. Taking a village
 *  needs an arrival turn plus a hold turn, so a defender who leaves when the
 *  enemy is two moves away can no longer get back in time. */
export const AI_TUNING = { garrisonHorizonTurns: 2, gradedThreat: true };

export function enemyCanReach(map: GameMap, tile: MapTile, playerIndex: number, turns: number = AI_TUNING.garrisonHorizonTurns): boolean {
  return map.tiles.some(
    (t) =>
      t.unit &&
      t.unit.owner !== playerIndex &&
      t.unit.isStealthed !== true &&
      isExploredFor(t, playerIndex) &&
      hexDistance(tile, t) <= enemyReach(t.unit).move * turns,
  );
}

/** Like `enemyCanReach` but ignoring pirates (owner -1): pirates never
 *  capture or occupy villages, so garrison/spawn decisions ignore them. */
export function landEnemyCanReach(map: GameMap, tile: MapTile, playerIndex: number, turns: number = AI_TUNING.garrisonHorizonTurns): boolean {
  return map.tiles.some(
    (t) =>
      t.unit &&
      t.unit.owner >= 0 &&
      t.unit.owner !== playerIndex &&
      t.unit.isStealthed !== true &&
      isExploredFor(t, playerIndex) &&
      hexDistance(tile, t) <= enemyReach(t.unit).move * turns,
  );
}

export function enemyCanAttackNext(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  return map.tiles.some((t) => {
    if (!t.unit || t.unit.owner === playerIndex || !isExploredFor(t, playerIndex)) return false;
    if (t.unit.isStealthed === true) return false;
    const reach = enemyReach(t.unit);
    return hexDistance(tile, t) <= reach.move + reach.attack;
  });
}

/** Combined attack force of every enemy that could move and attack `tile` this
 *  turn — a graded measure of how exposed a tile is, for weighing risky
 *  positions instead of the flat `enemyCanAttackNext` yes/no flag. Doesn't
 *  model defense, order of attacks, or counters: it is a cheap proxy, not a
 *  combat simulation, but a tile several weak enemies can gang up on is
 *  correctly rated worse than one only a single enemy can reach. */
export function incomingForceAt(map: GameMap, tile: MapTile, playerIndex: number): number {
  let total = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === playerIndex || !isExploredFor(t, playerIndex)) continue;
    if (t.unit.isStealthed === true) continue;
    const reach = enemyReach(t.unit);
    if (hexDistance(tile, t) <= reach.move + reach.attack) total += attackDamage(t.unit);
  }
  return total;
}

/** A tile where the combined enemy force alone is likely to kill the unit,
 *  even ignoring its own defense — worth avoiding outright rather than just
 *  weighing down, unless it is the only option. */
export function isLikelyLethal(map: GameMap, tile: MapTile, playerIndex: number, unit: Unit): boolean {
  if (!AI_TUNING.gradedThreat) return false;
  return incomingForceAt(map, tile, playerIndex) >= unit.hp * LETHAL_FORCE_RATIO;
}

const LETHAL_FORCE_RATIO = 0.9;
/** Scoring weight so a single average attacker (~20-25 force) costs about as
 *  much as the old flat -200 threat penalty; a second attacker stacks on top
 *  instead of being invisible to the score. */
export const INCOMING_FORCE_WEIGHT = 8;
/** Penalty for a likely-lethal tile, so it only wins when every reachable
 *  option is rated just as bad. */
export const LETHAL_PENALTY = 100000;

/** Non-combat special units: the Villagers builder, the Forest trapper and the
 *  Warriors banner. They never attack and the AI keeps them out of fights —
 *  they build, plant traps and buff their neighbours instead. */
export function isSupportUnit(unit: Unit): boolean {
  return unit.type === UnitType.BUILDER || unit.type === UnitType.TRAPPER || unit.type === UnitType.BANNER;
}

/** A raging berserker (<=35% hp) takes no counter-damage when it attacks, so
 *  when it can strike now it presses on instead of retreating. */
export function berserkerShouldPress(map: GameMap, player: Player, unit: Unit): boolean {
  if (!flagsFor(player).berserkerHold) return false;
  if (berserkerRage(unit) <= 0) return false;
  return attackableTargets(map, unit, player.index).some((a) => a.unit !== null);
}

/** Number of the player's own units within `dist` hexes of `tile` (excluding a
 *  unit standing on it). Used to keep the banner inside its aura cluster. */
export function friendlyUnitsWithin(map: GameMap, owner: number, tile: MapTile, dist: number): number {
  let n = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner !== owner) continue;
    if (t.q === tile.q && t.r === tile.r) continue;
    if (hexDistance(tile, t) <= dist) n += 1;
  }
  return n;
}

/** Own unbuilt mountain the Villagers builder could turn into a mine (owned,
 *  claimed by an own settlement with a free slot). */
function builderHasMineToBuild(map: GameMap, player: Player): boolean {
  return map.tiles.some((t) => {
    if (t.ownedBy !== player.index || t.building || t.settlement) return false;
    if (!isMountainType(t.terrain)) return false;
    if (!t.claimedByVillage) return false;
    const village = map.tiles.find(
      (x) => x.q === t.claimedByVillage!.q && x.r === t.claimedByVillage!.r && x.settlement?.owner === player.index,
    );
    return village !== undefined && buildingsInVillage(map, village) < villageBuildingLimit(village.settlement!.level);
  });
}

/** The builder is summoned when a mine is wanted but no mining skill is open:
 *  only then does the builder, who builds without any skill, unlock it. */
function builderWanted(map: GameMap, player: Player): boolean {
  if (hasSkill(player, SkillId.SMITHERY)) return false;
  if (!builderHasMineToBuild(map, player)) {
    // No mine site yet, but a bare owned mountain claim list is enough to aim for.
    if (!map.tiles.some((t) => t.ownedBy === player.index && !t.building && !t.settlement && isMountainType(t.terrain))) return false;
  }
  return true;
}

/** A trap is only useful where someone walks: on the border of our territory
 *  or adjacent to unexplored ground / an already trapped route. */
export function frontierTile(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  if (!isExploredFor(tile, playerIndex)) return false;
  return hexNeighbors(tile).some((n) => {
    const nt = tileAt(map, n.q, n.r);
    if (!nt) return false;
    if (!isExploredFor(nt, playerIndex)) return true;
    return nt.ownedBy !== null && nt.ownedBy !== playerIndex;
  });
}

/** Whether the tribe's special unit is worth fielding right now. */
export function specialUnitWanted(
  map: GameMap,
  player: Player,
  situation: AiSituation | undefined,
): boolean {
  const special = TRIBE_SPECIAL_UNIT[player.tribe];
  switch (special) {
    case UnitType.STORMCALLER:
      return !!situation?.navalThreat;
    case UnitType.BANNER:
      return map.tiles.filter((t) => t.unit && t.unit.owner === player.index).length >= 3;
    case UnitType.STALKER:
      return map.tiles.some((t) => !isExploredFor(t, player.index)) || map.tiles.some((t) => t.settlement && t.settlement.owner !== player.index);
    case UnitType.TRAPPER:
      return map.tiles.some((t) => t.ownedBy === player.index && frontierTile(map, t, player.index));
    case UnitType.BUILDER:
      return builderWanted(map, player);
    case UnitType.STUNNER:
    case UnitType.BERSERKER:
      return (situation?.enemies.length ?? 0) > 0 || situation?.stance === AiStance.WAR;
    default:
      return false;
  }
}

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

/** Whether a fresh unit of `type` raised on `village` would be killed during
 *  the enemy's next turn: the damage of every visible enemy land unit that can
 *  reach the tile (adjacent units, archers, riders, knights, catapults...
 *  anything whose move + attack range covers it) is summed against the unit at
 *  full hp, with the village's defense bonus. Order, misses and counters are
 *  ignored. Ships and pirates are left out: the naval-threat spawns (catapult,
 *  shield) are made on purpose against them. */
export function spawnWouldBeKilled(map: GameMap, village: MapTile, playerIndex: number, type: UnitType): boolean {
  const ghost = makeUnit(playerIndex, type, village.q, village.r);
  return incomingDamage(map, village, playerIndex, ghost, true) >= unitMaxHp(ghost);
}

/** Summed damage the visible enemy land units that can reach `village` would
 *  deal to `unit` standing there (village defense bonus included; order,
 *  misses and counters ignored). With `stopAtDeath` the sum ends as soon as it
 *  reaches the unit's hp. */
function incomingDamage(map: GameMap, village: MapTile, playerIndex: number, unit: Unit, stopAtDeath = false): number {
  const tile: MapTile = { ...village, unit };
  let damage = 0;
  for (const t of map.tiles) {
    const enemy = t.unit;
    if (!enemy || enemy.owner === playerIndex || enemy.owner < 0 || isShip(enemy)) continue;
    if (enemy.isStealthed === true || !isExploredFor(t, playerIndex)) continue;
    const reach = enemyReach(enemy);
    if (hexDistance(village, t) > reach.move + reach.attack) continue;
    damage += resolveCombat(map, enemy, tile).attackerDamage;
    if (stopAtDeath && damage >= unit.hp) break;
  }
  return damage;
}

/** Hp `unit` would have left standing on `village` after the enemy's next
 *  turn (<= 0: it dies). A real unit counts at its current hp, so a 1-hp unit
 *  never "holds" a village an enemy can reach. */
export function holdMargin(map: GameMap, village: MapTile, playerIndex: number, unit: Unit): number {
  return unit.hp - incomingDamage(map, village, playerIndex, unit);
}

/** Whether `unit` would survive the enemy's next turn on its own `village`. */
export function unitHoldsVillage(map: GameMap, village: MapTile, playerIndex: number, unit: Unit): boolean {
  return holdMargin(map, village, playerIndex, unit) > 0;
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

/** Counter damage an attack on `target` would draw back onto `attacker` (0
 *  when the target dies, is out of range, or cannot counter), mirroring
 *  performAttack's exact formula: the target's defense force shares the
 *  incoming attack force, so its retaliation is the defense result. */
function counterDamageTo(
  map: GameMap,
  attacker: Unit,
  attackerTile: MapTile,
  targetTile: MapTile,
): number {
  return counterDamageToFromCombat(map, attacker, targetTile);
}

/** Units that step onto the tile of an enemy they kill (see `performAttack`). */
function isMeleeAdvancer(unit: Unit): boolean {
  return unit.type !== UnitType.ARCHER && unit.type !== UnitType.CATAPULT && unit.type !== UnitType.PIRATE && !isShip(unit);
}

export type GarrisonGuardResult = { kind: GarrisonGuardKind.ATTACK; guardType?: UnitType } | { kind: GarrisonGuardKind.HOLD };

/** A unit standing on its own village must never trade its life for a kill if
 *  that would leave the village with no garrison and no way to replace one.
 *  - `{ kind: 'hold' }`: the enemy counter would kill the garrison and no
 *    fresh defender can be spawned on the village right after — hold instead.
 *  - `{ kind: 'attack', guardType }`: the attack may proceed, but the caller
 *    must *also* plan a spawn so the village is covered if the garrison dies.
 *  - `{ kind: 'attack' }`: either the attack cannot kill the garrison, or the
 *    unit is not on its own village — no guard required. */
export function guardGarrisonAttack(
  map: GameMap,
  player: Player,
  unit: Unit,
  targetTile: MapTile,
  state?: AiPlannerState,
): GarrisonGuardResult {
  const tile = map.tiles.find((t) => t.unit === unit);
  if (!tile?.settlement || tile.settlement.owner !== player.index) return { kind: GarrisonGuardKind.ATTACK };
  // A catapult siege of a structure tile draws no counter at all.
  if (!targetTile.unit) return { kind: GarrisonGuardKind.ATTACK };
  // A melee kill also vacates the village: the winner advances onto the dead enemy's tile.
  const advances = isMeleeAdvancer(unit) && targetTile.unit.owner >= 0 && attackDamage(unit) >= targetTile.unit.hp;
  const vacates = advances && landEnemyCanReach(map, tile, player.index);
  if (!vacates && counterDamageTo(map, unit, tile, targetTile) < unit.hp) return { kind: GarrisonGuardKind.ATTACK };

  const vk = key(tile.q, tile.r);
  if (state?.occupied.has(vk)) return { kind: GarrisonGuardKind.HOLD };
  // A dying garrison frees a spawn slot (an advancing one keeps its own): a guard fits as long as the
  // village is not already at capacity with its other spawns.
  const garrisonHome = unit.spawnVillage !== null && key(unit.spawnVillage.q, unit.spawnVillage.r) === vk;
  const stayed = unitsInVillage(map, tile) - (garrisonHome && !vacates ? 1 : 0);
  if (stayed >= villageCapacity(tile.settlement.level)) return { kind: GarrisonGuardKind.HOLD };
  const guardType = bestSpawnableUnitType(player, SpawnPreference.DEFENSE, map, tile);
  if (!guardType) return { kind: GarrisonGuardKind.HOLD };
  return { kind: GarrisonGuardKind.ATTACK, guardType };
}

export function nearestEnemyDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === owner || !isExploredFor(t, owner)) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

export function nearestOwnUnitDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner !== owner) continue;
    if (t.q === tile.q && t.r === tile.r) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

export function nearestVillageDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === owner || !isExploredFor(t, owner)) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

export function nearestFreeVillageDistanceFrom(map: GameMap, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== null) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

export function isFrontierTile(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  if (!isExploredFor(tile, playerIndex)) return false;
  return hexNeighbors(tile).some((n) => {
    const nt = tileAt(map, n.q, n.r);
    return nt !== undefined && !isExploredFor(nt, playerIndex);
  });
}

export function attackersForTile(
  map: GameMap,
  player: Player,
  targetTile: MapTile,
  state: AiPlannerState,
): { unit: Unit; moveTo: MapTile | null }[] {
  const out: { unit: Unit; moveTo: MapTile | null }[] = [];
  const canClimb = hasSkill(player, SkillId.CLIMBING);
  const canDock = hasSkill(player, SkillId.NAVIGATION);
  for (const t of map.tiles) {
    const unit = t.unit;
    if (!unit || unit.owner !== player.index) continue;
    if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
    // Support units and stalkers never join a gang-up: the builder/trapper/
    // banner have jobs to do and the stalker only strikes to free a village.
    if (isSupportUnit(unit) || unit.type === UnitType.STALKER) continue;
    const endangeredGarrison =
      !!t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index);
    if (attackableTargets(map, unit, player.index).some((a) => a.q === targetTile.q && a.r === targetTile.r)) {
      out.push({ unit, moveTo: null });
      continue;
    }
    // A garrison in an endangered village may defend in place, but it must
    // never march away to join a distant fight (that would leave the village
    // empty for an enemy that can reach it next turn).
    if (endangeredGarrison) continue;
    for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
      if (state.occupied.has(key(c.q, c.r))) continue;
      const ghost: Unit = { ...unit, q: c.q, r: c.r };
      if (attackableTargets(map, ghost, player.index).some((a) => a.q === targetTile.q && a.r === targetTile.r)) {
        out.push({ unit, moveTo: c });
        break;
      }
    }
  }
  const target = targetTile.unit;
  if (!target || target.type !== UnitType.TRAPPER) return out;
  // A trapper is worn down by ranged units; a melee unit joins only when it
  // finishes the job (so it takes no counter).
  const poor = (a: { unit: Unit }): boolean => isPoorTrapperTarget(a.unit, target);
  const rangedDamage = out.filter((a) => !poor(a) && a.unit.attackDistance > 1).reduce((s, a) => s + attackDamage(a.unit), 0);
  return out
    .filter((a) => !poor(a) || rangedDamage + attackDamage(a.unit) >= target.hp)
    .sort((a, b) => Number(a.unit.attackDistance <= 1) - Number(b.unit.attackDistance <= 1));
}


/** Attack steps for a gang-up on `target`: each attacker moves into range if
 *  needed and strikes. A garrison joining from its own village without moving
 *  may take a lethal counter: it holds, or a spawn covers the village. */
export function gangAttackActions(
  map: GameMap,
  player: Player,
  target: MapTile,
  attackers: { unit: Unit; moveTo: MapTile | null }[],
  state: AiPlannerState,
): AiAction[] {
  const actions: AiAction[] = [];
  for (const a of attackers) {
    const garrisonGuard = a.moveTo ? null : guardGarrisonAttack(map, player, a.unit, target, state);
    if (garrisonGuard?.kind === GarrisonGuardKind.HOLD) continue;
    if (a.moveTo) actions.push({ type: AiActionType.MOVE, unitId: a.unit.id, q: a.moveTo.q, r: a.moveTo.r });
    actions.push({ type: AiActionType.ATTACK, unitId: a.unit.id, q: target.q, r: target.r });
    if (garrisonGuard?.guardType) {
      const home = map.tiles.find((x) => x.unit === a.unit);
      if (home) actions.push({ type: AiActionType.SPAWN, q: home.q, r: home.r, unitType: garrisonGuard.guardType });
    }
  }
  return actions;
}

/** Score bonus for the enemy village the AI hit recently, so attacks and hunts
 *  keep converging on it instead of wandering to other targets. */
export const HIT_VILLAGE_BONUS = 80;
/** Turns after which a hit village is forgotten. */
const HIT_VILLAGE_MEMORY = 3;

export function isHitVillage(player: Player, tile: { q: number; r: number }, turn: number): boolean {
  const h = player.hitVillage;
  return flagsFor(player).attackPlan && !!h && h.q === tile.q && h.r === tile.r && turn - h.turn <= HIT_VILLAGE_MEMORY;
}

/** Enemy land catapults in sight: a knight kills one per hit and chains to the next. */
export function visibleEnemyCatapults(map: GameMap, playerIndex: number): number {
  let n = 0;
  for (const t of map.tiles) {
    const u = t.unit;
    if (!u || u.owner === playerIndex || u.owner < 0 || u.type !== UnitType.CATAPULT || u.shipLevel !== undefined) continue;
    if (u.isStealthed !== true && isExploredFor(t, playerIndex)) n += 1;
  }
  return n;
}

/** Knights are raised against visible enemy catapults, up to two per catapult. */
export function knightsWanted(map: GameMap, player: Player): boolean {
  const catapults = visibleEnemyCatapults(map, player.index);
  if (catapults === 0) return false;
  let knights = 0;
  for (const t of map.tiles) if (t.unit?.owner === player.index && t.unit.type === UnitType.KNIGHT) knights += 1;
  return knights < Math.max(2, catapults * 2);
}
