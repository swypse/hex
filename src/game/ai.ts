import { networkBuildingIncome, canBuildFarm, canBuildGranary, canBurnBuilding, canBurnRoad, canBuildSawmill, canBuildForestTemple, canBuildMine, canBuildPort, canBuildTemple, BUILDING_COSTS } from './buildings';
import { hexDistance, hexNeighbors } from './hex';
import { canBuildBridge, bridgeCoastOffsets, bridgeDirFor, BRIDGE_COST } from './bridges';
import { canBuildRoad, roadCutSplits, villageConnectedNodes, ROAD_COST } from './roads';
import { GameMap, MapTile } from './map-gen';
import { Player } from './players';
import { moneyCost, villageUpgradeCost, type Resources } from './resources';
import { canAffordAt, networkStock, payerVillage, totalStock } from './stock';
import { canOpenSkill, hasSkill, skillCost, SkillId } from './skills';
import { reachableTargets, tileAt } from './selection';
import { foodNetworkStates, networkStateOfTile, foodPressure, canSustainUnit, eatsFarmMaterials } from './food';
import { planFoodFixes } from './ai-food';
import { canHeal, unitSpawnCost, UNIT_TYPES, Unit } from './units';
import { SeededRandom } from '../util/random';
import { buildingsInVillage, villageBuildingLimit } from './village';
import { isMountainType } from './tile-types';
import { TRIBES } from './tribes';
import { AI_PATTERNS, AI_TUNING, AiPatternContext, bestSpawnableUnitType, enemyCanAttackNext, enemyCanReach, guardGarrisonAttack, incomingForceAt, isFrontierTile, isLikelyLethal, isSupportUnit, INCOMING_FORCE_WEIGHT, landEnemyCanReach, LETHAL_PENALTY, nearestEnemyDistanceFrom, nearestFreeVillageDistanceFrom, nearestOwnUnitDistanceFrom, nearestVillageDistanceFrom } from './ai-patterns';
import { AiAction, AiDirectives, AiPlannerState } from './ai-types';
import { attackableTargets, chooseBestAttack, tradeIsFavorable } from './combat';
import { isExploredFor } from './explore';
import { GameMode } from './game-mode';
import { AiSituation, analyzeSituation, coastExposedTile, isNavalEnemy } from './ai-situation';
import { AiDifficultyProfile, profileFor } from './ai-difficulty';
import { isShip } from './ship';
import { updateStrategy, deriveDirectives } from './ai-strategy';
import { flagsFor } from './ai-flags';
import { OPERATION_PATTERN, updateOperation } from './ai-operations';

const MAX_PLAN_STEPS = 200;

/** Pattern list with the squad operation slotted in after the lone-hunter and
 *  naval patterns, right before frontier exploration: a unit that can kill or
 *  chase down an enemy on its own this turn still does so (hunt-idle-enemy
 *  claims it first), and only units with nothing better to do join the squad's
 *  gather/assault march. Benchmarked: placing it *before* hunt-idle-enemy
 *  regressed the AI (44% win rate, fewer enemy villages captured) because it
 *  pulled units away from easy solo kills to wait for the group instead. */
function buildPatterns() {
  return AI_PATTERNS.flatMap((p) => (p.id === 'explore-frontier' ? [OPERATION_PATTERN, p] : [p]));
}

/** Strong penalty for idle land units standing where a naval enemy can hit. */
const NAVAL_EXPOSURE_PENALTY = 400;

/** Hexes from a naval enemy within which an own village prefers shield spawns. */
const NAVAL_VILLAGE_GUARD_RADIUS = 6;

/** When true, planAiActions logs each AI's situation and every decision. */
let AI_DEBUG_LOGGING = false;

export function aiLoggingEnabled(): boolean {
  return AI_DEBUG_LOGGING;
}

/** Toggles AI decision logging; returns the new state. */
export function setAiLogging(enabled: boolean): boolean {
  AI_DEBUG_LOGGING = enabled;
  return AI_DEBUG_LOGGING;
}

function aiLog(...parts: unknown[]): void {
  if (AI_DEBUG_LOGGING) console.log('[AI]', ...parts);
}

function tribeName(player: Player): string {
  return TRIBES.find((x) => x.id === player.tribe)?.name ?? String(player.tribe);
}

/** Debug header printed at the start of an AI turn. */
export function logAiTurnStart(player: Player, turn: number): void {
  if (!AI_DEBUG_LOGGING) return;
  aiLog(`${tribeName(player)} "${player.name}" — turn ${turn} START`);
}

function situationSummary(situation: AiSituation): string {
  const naval = situation.navalThreat
    ? ` navalThreat=true x${situation.navalEnemies.length} d=${situation.nearestNaval?.distance ?? '?'}`
    : ' navalThreat=false';
  const front = situation.frontTarget ? ` front=(${situation.frontTarget.q},${situation.frontTarget.r})` : '';
  return (
    `stance=${situation.stance} endangered=${situation.endangered} dangers=${situation.dangers.length}` +
    ` enemies=${situation.enemies.length} freeVillages=${situation.freeVillages.length}` +
    ` ownPower=${situation.ownPower} enemyPower=${situation.enemyPower}` +
    naval + front
  );
}

/** Debug tag describing how one planned action was produced. */
export interface AiActionMarker {
  label: string;
  note: string;
}

export function formatAiAction(a: AiAction): string {
  switch (a.type) {
    case 'move':
      return `move ${a.unitId} (${a.q},${a.r})`;
    case 'attack':
      return `attack ${a.unitId} -> (${a.q},${a.r})`;
    case 'heal':
      return `heal ${a.unitId}`;
    case 'capture':
      return `capture ${a.unitId} (${a.q},${a.r})`;
    case 'spawn':
      return `spawn ${a.unitType} (${a.q},${a.r})`;
    case 'upgrade':
      return `upgrade village (${a.q},${a.r})`;
    case 'upgradeShip':
      return `upgradeShip ${a.unitId}`;
    case 'build':
      return `build ${a.kind} (${a.q},${a.r})`;
    case 'buildRoad':
      return `buildRoad (${a.q},${a.r})`;
    case 'buildBridge':
      return `buildBridge (${a.q},${a.r})`;
    case 'openSkill':
      return `openSkill ${a.skill}`;
    case 'stun':
      return `stun ${a.unitId} -> (${a.q},${a.r})`;
    case 'enableStealth':
      return `enableStealth ${a.unitId}`;
    case 'storm':
      return `storm ${a.unitId}`;
    case 'trap':
      return `trap ${a.unitId} -> (${a.q},${a.r})`;
    case 'burn':
      return `burn ${a.unitId}`;
    case 'burnRoad':
      return `burnRoad ${a.unitId}`;
    case 'builderBuild':
      return `builderBuild ${a.unitId} ${a.kind} (${a.q},${a.r})`;
  }
}

/** Score of destroying the only road linking two enemy villages (above a normal attack, below burning a food building). */
const ROAD_CUT_SCORE = 4200;
/** Score of destroying any other enemy road: only when nothing better is available. */
const ROAD_BURN_IDLE_SCORE = 120;

function axialKeyOf(t: { q: number; r: number }): string {
  return key(t.q, t.r);
}

function key(q: number, r: number): string {
  return `${q},${r}`;
}

/** Skill-open order the AI prefers: economy/production first so it can build
 *  mines (stone/ore) and sawmills early instead of opening random leaves. */
const MILITARY_SKILL_ORDER: SkillId[] = [
  'forestry',
  'agriculture',
  'climbing',
  'smithery',
  'swordsman',
  'riding',
  'knights',
  'shields',
  'science',
  'geology',
  'roads',
  'water',
  'waterTemples',
  'navigation',
  'catapult',
  'forestTemple',
  'bridges',
  'granary',
];

const AI_SKILL_ORDER: SkillId[] = [
  'forestry',
  'agriculture',
  'climbing',
  'smithery',
  'science',
  'geology',
  'roads',
  'shields',
  'swordsman',
  'water',
  'riding',
  'waterTemples',
  'navigation',
  'catapult',
  'forestTemple',
  'bridges',
  'knights',
  'granary',
];

/** Whether a village's building slots are full but it still claims an unbuilt
 *  mountain (a would-be mine) — upgrading it unlocks that slot. */
function hasPendingMineSlot(map: GameMap, player: Player, v: MapTile): boolean {
  if (!v.settlement || !hasSkill(player, 'smithery')) return false;
  if (buildingsInVillage(map, v) < villageBuildingLimit(v.settlement.level)) return false;
  return claimsUnbuiltMountain(map, player, v);
}

function claimsUnbuiltMountain(map: GameMap, player: Player, v: MapTile): boolean {
  const vk = key(v.q, v.r);
  for (const t of map.tiles) {
    if (t.ownedBy !== player.index) continue;
    if (t.building || t.settlement) continue;
    if (!isMountainType(t.terrain)) continue;
    if (t.claimedByVillage && key(t.claimedByVillage.q, t.claimedByVillage.r) === vk) return true;
  }
  return false;
}

/** Whether the tile's claiming village should keep its last free building slot
 *  for a mine (rather than a sawmill/temple) so it never stone-locks itself. */
function reserveLastSlotForMine(map: GameMap, player: Player, tile: MapTile): boolean {
  const c = tile.claimedByVillage;
  if (!c) return false;
  const v = map.tiles.find((t) => t.q === c.q && t.r === c.r && t.settlement);
  if (!v?.settlement || v.settlement.owner !== player.index) return false;
  if (buildingsInVillage(map, v) + 1 < villageBuildingLimit(v.settlement.level)) return false;
  return claimsUnbuiltMountain(map, player, v);
}

/** A bridge pays off only when its far shore leads to something worth
 *  crossing for: unexplored ground, a foreign/free settlement, or foreign
 *  territory. */
function bridgeLeadsSomewhere(map: GameMap, tile: MapTile, player: Player): boolean {
  const dir = bridgeDirFor(map, tile);
  if (!dir) return false;
  for (const o of bridgeCoastOffsets(dir)) {
    const shore = tileAt(map, tile.q + o.q, tile.r + o.r);
    if (!shore) continue;
    if (!isExploredFor(shore, player.index)) return true;
    if (shore.settlement && shore.settlement.owner !== player.index) return true;
    if (shore.ownedBy !== null && shore.ownedBy !== player.index) return true;
  }
  return false;
}

/** Money kept before the AI spends on a spawn: the strategy reserve when a
 *  plan is active, otherwise the difficulty profile's default. */
function directivesReserve(directives: AiDirectives | undefined, difficulty: AiDifficultyProfile | undefined): number {
  if (directives) return directives.moneyReserve;
  return difficulty?.spawnReserve ?? UNIT_TYPES.warrior.price;
}

/** True while a strategy goal is mustering the army (units hold back from
 *  suicidal solo trades until the massed strike is ready). */
function mustering(directives: AiDirectives | undefined): boolean {
  return directives?.muster !== undefined && directives?.muster !== null;
}

function bestAvailableAction(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  state: AiPlannerState,
  situation: AiSituation | undefined,
  difficulty: AiDifficultyProfile | undefined,
  directives: AiDirectives | undefined,
  source?: { kind: 'best' | 'random' },
): AiAction[] | null {
  const jitter = (): number => rng.next() * 60;
  const candidates: { score: number; action: AiAction | AiAction[] }[] = [];

  const buildScale = directives?.pace === 'slow' ? 0.5 : directives?.pace === 'rushed' ? 0.6 : 1;

  for (const v of map.tiles) {
    if (!v.settlement || v.settlement.owner !== player.index) continue;
    const k = key(v.q, v.r);
    if (!state.upgraded.has(k) && canAffordAt(map, player, v, villageUpgradeCost(v.settlement.level))) {
      const front = nearestEnemyDistanceFrom(map, player.index, v) <= 4;
      const level = v.settlement!.level;
      const boost = hasPendingMineSlot(map, player, v) ? 260 : level <= 2 && !front ? 90 : 0;
      candidates.push({ score: (front ? 700 : 400) + boost + jitter(), action: { type: 'upgrade', q: v.q, r: v.r } });
    }
    if (!state.spawned.has(k) && !v.unit) {
      const threatened = landEnemyCanReach(map, v, player.index);
      const threatenedByNaval =
        situation?.navalEnemies.some((e) => hexDistance(v, e.tile) <= NAVAL_VILLAGE_GUARD_RADIUS) ?? false;
      const urgent = threatened || threatenedByNaval;
      const freeVillageToGrab = map.tiles.some(
        (t) =>
          t.settlement &&
          t.settlement.owner === null &&
          isExploredFor(t, player.index) &&
          !state.occupied.has(key(t.q, t.r)),
      );
      const planFor = directives?.spawnPlan.find((p) => p.villageKey === k);
      const prefer =
        planFor
          ? planFor.prefer
          : urgent || situation?.stance === 'defend'
            ? 'defense'
            : situation?.navalThreat
              ? 'naval'
              : situation?.stance === 'settle' && freeVillageToGrab
                ? 'scout'
                : 'offense';
      const type = bestSpawnableUnitType(player, prefer, map, v);
      if (type) {
        const cost = unitSpawnCost(type);
        if (canAffordAt(map, player, v, cost)) {
          const afterMoney = player.resources.money - cost.money;
          // An economy goal keeps money in reserve for mines/skills, but a
          // free-village grab is expansion income and always worth the spend.
          const reserveOk = urgent || freeVillageToGrab || afterMoney >= directivesReserve(directives, difficulty);
          // A unit the food stock cannot carry would only starve: hold back
          // unless the village itself is in danger.
          const foodOk = urgent || canSustainUnit(map, player, type, 6, v);
          if (reserveOk && foodOk) {
            candidates.push({ score: (urgent ? 500 : 250) + jitter(), action: { type: 'spawn', q: v.q, r: v.r, unitType: type } });
          }
        }
      }
    }
  }

  for (const t of map.tiles) {
    const unit = t.unit;
    if (!unit || unit.owner !== player.index) continue;
    if (state.acted.has(unit.id)) continue;
    if (t.settlement && t.settlement.owner !== unit.owner && t.settlement.captureReady) {
      candidates.push({ score: 5000 + jitter(), action: { type: 'capture', q: t.q, r: t.r, unitId: unit.id } });
      continue;
    }
    if (canBurnBuilding(t, unit)) {
      candidates.push({ score: 4500 + jitter(), action: { type: 'burn', unitId: unit.id } });
      continue;
    }
    if (canBurnRoad(t, unit)) {
      // A road that is the only link between two villages is worth cutting
      // ahead of a normal attack (it splits their food network); any other
      // enemy road only fills an otherwise idle turn.
      const splits = roadCutSplits(map, t);
      candidates.push({
        score: (splits > 0 ? ROAD_CUT_SCORE + 100 * Math.min(splits, 3) : ROAD_BURN_IDLE_SCORE) + jitter(),
        action: { type: 'burnRoad', unitId: unit.id },
      });
    }
    const attackTile = chooseBestAttack(map, unit, unit.owner);
    if (attackTile && !isSupportUnit(unit) && unit.type !== 'stalker' && (!difficulty || !difficulty.checkTrades || !mustering(directives) || tradeIsFavorable(unit, attackTile))) {
      const garrisonGuard = guardGarrisonAttack(map, player, unit, attackTile, state);
      if (garrisonGuard.kind !== 'hold') {
        const guardType = garrisonGuard.guardType;
        candidates.push({
          score: 4000 + jitter(),
          action: guardType
            ? [
                { type: 'attack', unitId: unit.id, q: attackTile.q, r: attackTile.r },
                { type: 'spawn', q: t.q, r: t.r, unitType: guardType },
              ]
            : { type: 'attack', unitId: unit.id, q: attackTile.q, r: attackTile.r },
        });
        continue;
      }
      // The village's last defender cannot be replaced: fall through to the
      // move/heal handling below instead of trading its life.
    }
    if (state.moved.has(unit.id)) continue;
    if (canHeal(unit) && unit.hp < UNIT_TYPES[unit.type].maxHp && !enemyCanAttackNext(map, t, player.index)) {
      candidates.push({ score: 600 + jitter(), action: { type: 'heal', unitId: unit.id, q: t.q, r: t.r } });
      continue;
    }
    // Support units and stalkers are handled by their own patterns: never let
    // the generic fallback send them into combat or wander with the army.
    if (isSupportUnit(unit) || unit.type === 'stalker') continue;
    const garrison = !!t.settlement && t.settlement.owner === unit.owner;
    if (garrison && enemyCanReach(map, t, player.index)) continue;
    const canClimb = hasSkill(player, 'climbing');
    const canDock = hasSkill(player, 'navigation');
    const targets = reachableTargets(map, unit, undefined, canClimb, canDock, unit.owner).filter(
      (c) => !state.occupied.has(key(c.q, c.r)) && !(c.settlement && c.settlement.owner === unit.owner),
    );
    let bestMove: MapTile | null = null;
    let bestMoveScore = -Infinity;
    let bestAttackAfter: MapTile | null = null;
    for (const c of targets) {
      const ghost: Unit = { ...unit, q: c.q, r: c.r };
      // Stepping onto a foreign village means claiming it for capture next turn
      // — never chain an attack after that move (a melee kill would advance the
      // unit off the village and forfeit the capture).
      const foreignVillage = c.settlement !== null && c.settlement.owner !== unit.owner;
      const a = chooseBestAttack(map, ghost, unit.owner);
      if (a && !foreignVillage && (!difficulty || !difficulty.checkTrades || !mustering(directives) || tradeIsFavorable(ghost, a))) {
        const s = 3000 - hexDistance(t, c);
        if (s > bestMoveScore) {
          bestMoveScore = s;
          bestMove = c;
          bestAttackAfter = a;
        }
        continue;
      }
      const distToVillage = nearestVillageDistanceFrom(map, unit.owner, c);
      const distToFree = nearestFreeVillageDistanceFrom(map, c);
      // Graded by how much force could actually hit here, not just whether any
      // enemy could: a tile three weak enemies can gang up on is worse than one
      // only a single enemy reaches, and a likely-lethal tile is rejected
      // outright unless every option is just as bad.
      const threatPenalty = !AI_TUNING.gradedThreat
        ? enemyCanAttackNext(map, c, player.index)
          ? 200
          : 0
        : isLikelyLethal(map, c, player.index, unit)
          ? LETHAL_PENALTY
          : incomingForceAt(map, c, player.index) * INCOMING_FORCE_WEIGHT;
      const ownBonus = c.settlement && c.settlement.owner === unit.owner ? 40 : 0;
      const frontier = isFrontierTile(map, c, player.index) ? 20 : 0;
      const freeBonus = Number.isFinite(distToFree) ? Math.max(0, 60 - distToFree * 10) : 0;
      const villageBonus = Number.isFinite(distToVillage) ? 100 - distToVillage : 0;
      // Keep the army clustered: favour tiles close to other friendly units.
      const ownDist = nearestOwnUnitDistanceFrom(map, player.index, c);
      const groupBonus = Number.isFinite(ownDist) ? Math.max(0, 26 - ownDist * 3) : 0;
      let s = villageBonus + freeBonus + frontier + groupBonus - threatPenalty + ownBonus;
      if (situation?.stance === 'war' && situation.frontTarget) {
        const df = hexDistance(c, situation.frontTarget);
        s += 500 - df * 10;
        const ownDist = nearestOwnUnitDistanceFrom(map, player.index, c);
        if (Number.isFinite(ownDist)) s += Math.max(0, 30 - ownDist * 4);
      }
      if (directives?.frontTarget) {
        const df = hexDistance(c, directives.frontTarget);
        s += 300 - df * 8;
        const ownDist = nearestOwnUnitDistanceFrom(map, player.index, c);
        if (Number.isFinite(ownDist)) s += Math.max(0, 30 - ownDist * 4);
      }
      if (directives?.muster && hexDistance(c, directives.muster.target) > hexDistance(t, directives.muster.target)) {
        s -= 150;
      }
      if (situation?.navalThreat && !isShip(unit) && unit.type !== 'catapult' && coastExposedTile(map, c, situation.navalEnemies)) {
        const canStrike = attackableTargets(map, ghost, unit.owner).some((a) => a.unit && isNavalEnemy(a.unit));
        if (!canStrike && !(c.settlement && c.settlement.owner === unit.owner)) s -= NAVAL_EXPOSURE_PENALTY;
      }
      if (s > bestMoveScore) {
        bestMoveScore = s;
        bestMove = c;
        bestAttackAfter = null;
      }
    }
    if (bestMove && bestMoveScore > 0 && bestAttackAfter) {
      candidates.push({
        score: bestMoveScore + jitter(),
        action: [
          { type: 'move', unitId: unit.id, q: bestMove.q, r: bestMove.r },
          { type: 'attack', unitId: unit.id, q: bestAttackAfter.q, r: bestAttackAfter.r },
        ],
      });
    } else if (bestMove && bestMoveScore > 0) {
      candidates.push({ score: bestMoveScore + jitter(), action: { type: 'move', unitId: unit.id, q: bestMove.q, r: bestMove.r } });
    }
  }

  // Food is planned per network of connected villages: each starving network
  // either gets a farm or a road to a network with a surplus, whichever is
  // cheaper per food gained.
  const foodStates = foodNetworkStates(map, player);
  const foodPlan = planFoodFixes(map, player, foodStates);
  for (const { tile, pressure } of foodPlan.roads) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildRoad(map, tile, player)) continue;
    candidates.push({ score: (pressure === 'urgent' ? 650 : 450) + jitter(), action: { type: 'buildRoad', q: tile.q, r: tile.r } });
  }
  for (const { tile, pressure } of foodPlan.ports) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildPort(map, tile, player) || !canAffordAt(map, player, tile, BUILDING_COSTS.port)) continue;
    candidates.push({ score: (pressure === 'urgent' ? 650 : 450) + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'port' } });
  }

  for (const tile of map.tiles) {
    if (tile.ownedBy !== player.index) continue;
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (canBuildSawmill(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.sawmill)) {
      if (!reserveLastSlotForMine(map, player, tile)) {
        candidates.push({ score: 360 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'sawmill' } });
      }
    }
    if (canBuildMine(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.mine)) {
      candidates.push({ score: 500 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'mine' } });
    }
    if (canBuildFarm(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.farm)) {
      const net = networkStateOfTile(foodStates, tile);
      const roadFirst = net !== undefined && foodPlan.linkFirst.has(axialKeyOf(net.villages[0]!));
      const pressure = net?.pressure ?? foodPressure(map, player);
      const farmScore = roadFirst ? 0 : pressure === 'urgent' ? 650 : pressure === 'low' ? 450 : (net?.balance ?? 0) < 2 ? 260 : 0;
      if (farmScore > 0) candidates.push({ score: farmScore + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'farm' } });
    }
    if (canBuildGranary(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.granary) && (networkStateOfTile(foodStates, tile)?.balance ?? 0) > 0) {
      candidates.push({ score: 120 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'granary' } });
    }
    if (canBuildPort(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.port)) {
      if (!reserveLastSlotForMine(map, player, tile) || situation?.navalThreat) {
        candidates.push({ score: (200 * buildScale) + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'port' } });
      }
    }
    if (canBuildTemple(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.temple)) {
      if (!reserveLastSlotForMine(map, player, tile)) {
        candidates.push({ score: (200 * buildScale) + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'temple' } });
      }
    }
    if (canBuildForestTemple(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.forestTemple)) {
      if (!reserveLastSlotForMine(map, player, tile)) {
        candidates.push({ score: (200 * buildScale) + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'forestTemple' } });
      }
    }
  }

  const roadConnected = villageConnectedNodes(map, player.index);
  for (const tile of map.tiles) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildRoad(map, tile, player, roadConnected)) continue;
    if (tile.unit && tile.unit.owner !== player.index) continue;
    // Only extend the road network where it pushes toward unexplored ground or
    // a foreign village (roads grant +1 movement, speeding up expansion).
    const pushesForward = hexNeighbors(tile).some((n) => {
      const nt = tileAt(map, n.q, n.r);
      if (!nt) return false;
      if (!isExploredFor(nt, player.index)) return true;
      return nt.settlement !== null && nt.settlement.owner !== player.index;
    });
    if (!pushesForward) continue;
    candidates.push({ score: 150 + jitter(), action: { type: 'buildRoad', q: tile.q, r: tile.r } });
  }

  for (const tile of map.tiles) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildBridge(map, tile, player)) continue;
    if (!canAffordAt(map, player, tile, BRIDGE_COST)) continue;
    // While a naval threat is active, spend on the naval response instead.
    if (situation?.navalThreat) continue;
    const touchesOwnNetwork = hexNeighbors(tile).some((n) => {
      const t = tileAt(map, n.q, n.r);
      return t !== undefined && (t.ownedBy === player.index || t.roadOwner === player.index);
    });
    if (!touchesOwnNetwork) continue;
    if (!bridgeLeadsSomewhere(map, tile, player)) continue;
    candidates.push({ score: (250 * buildScale) + jitter(), action: { type: 'buildBridge', q: tile.q, r: tile.r } });
  }

  // Without farms the army starves: learning Agriculture beats any skill plan
  // once the food stock is under pressure.
  if (!hasSkill(player, 'agriculture') && !state.opened.has('agriculture') && canOpenSkill(player, 'agriculture') && foodPressure(map, player) !== 'none') {
    candidates.push({ score: 550 + jitter(), action: { type: 'openSkill', skill: 'agriculture' } });
  }

  // Farms cost wood and stone: with food under pressure and no income of one of
  // them, head for the skill whose building produces it (Forestry -> sawmill,
  // Climbing + Smithery -> mine) so the first farm can be paid for.
  // Money the AI must keep to afford the food-path skill it is waiting for.
  let foodSkillReserve = 0;
  if (hasSkill(player, 'agriculture') && foodPressure(map, player) !== 'none') {
    const wanted: SkillId[] = [];
    // Roads (and granaries) need stone: a planned road link with no stone in
    // sight also heads for the mine skills.
    const stoneNeeded = foodPlan.roads.length > 0 ? ROAD_COST.stone : BUILDING_COSTS.farm.stone;
    // Judged per hungry network: its own wood/stone and the income of the
    // buildings feeding it.
    for (const net of foodStates.filter((n) => n.pressure !== 'none')) {
      const home = net.villages[0]!;
      const have = networkStock(map, home);
      const income = networkBuildingIncome(map, player, home);
      if (have.wood < BUILDING_COSTS.farm.wood && income.wood === 0 && !wanted.includes('forestry')) wanted.push('forestry');
      if (have.stone < stoneNeeded && income.stone === 0 && !wanted.includes('climbing')) wanted.push('climbing', 'smithery');
    }
    for (const id of wanted) {
      if (hasSkill(player, id) || state.opened.has(id)) continue;
      foodSkillReserve = skillCost(id, player.skills.length);
      if (canOpenSkill(player, id)) candidates.push({ score: 540 + jitter(), action: { type: 'openSkill', skill: id } });
      break;
    }
  }

  // A directive skill chain (economy/naval strategy) is opened before the
  // generic economy skill order so the AI commits to its plan's tech path.
  if (directives?.skillChain) {
    for (const id of directives.skillChain) {
      if (state.opened.has(id)) continue;
      if (canOpenSkill(player, id)) {
        candidates.push({ score: 300 + jitter(), action: { type: 'openSkill', skill: id } });
        break;
      }
    }
  } else if (!situation?.navalThreat) {
    const order = flagsFor(player).militarySkills ? MILITARY_SKILL_ORDER : AI_SKILL_ORDER;
    for (const id of order) {
      if (state.opened.has(id)) continue;
      if (canOpenSkill(player, id)) {
        const rank = order.indexOf(id);
        candidates.push({ score: 240 - rank * 8 + jitter(), action: { type: 'openSkill', skill: id } });
      }
    }
  }

  // While food is short and a farm site exists, keep what a farm needs: drop
  // discretionary spends of wood/stone, and of money once wood and stone are
  // ready, so the money for the farm is saved.
  const needFood = foodPressure(map, player) !== 'none' || !map.tiles.some((t) => t.ownedBy === player.index && t.building?.kind === 'farm');
  if (needFood && (!hasSkill(player, 'agriculture') || map.tiles.some((t) => canBuildFarm(map, t, player)))) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      const action = candidates[i]!.action;
      const first: AiAction = Array.isArray(action) ? action[0]! : action;
      const cost = discretionaryCost(map, player, first);
      if (!cost) continue;
      // Wood and stone trickle in slowly: never spend below one farm's worth.
      if (eatsFarmMaterials(map, player, cost, actionVillage(map, player, first))) {
        candidates.splice(i, 1);
        continue;
      }
      // When money is the only thing missing for the farm, save it too (an
      // urgent defensive spawn still goes ahead).
      const urgentSpawn = first.type === 'spawn' && candidates[i]!.score >= 500;
      const home = actionVillage(map, player, first);
      const have = home ? networkStock(map, home) : totalStock(map, player.index);
      const materialsReady = hasSkill(player, 'agriculture') && have.wood >= BUILDING_COSTS.farm.wood && have.stone >= BUILDING_COSTS.farm.stone;
      const reserve = foodSkillReserve > 0 ? foodSkillReserve : materialsReady ? BUILDING_COSTS.farm.money : 0;
      if (reserve > 0 && !urgentSpawn && player.resources.money - cost.money < reserve) candidates.splice(i, 1);
    }
  }

  if (difficulty && difficulty.mistakeChance > 0 && candidates.length > 0 && rng.next() < difficulty.mistakeChance) {
    if (source) source.kind = 'random';
    const pick = candidates[Math.floor(rng.next() * candidates.length)]!;
    return Array.isArray(pick.action) ? pick.action : [pick.action];
  }

  if (candidates.length === 0) return null;
  if (source) source.kind = 'best';
  let best = candidates[0]!;
  for (const c of candidates) if (c.score > best.score) best = c;
  return Array.isArray(best.action) ? best.action : [best.action];
}

/** Resources a discretionary action spends (null for actions that never
 *  compete with the first farm: mines, food buildings, food skills, moves). */
/** The village whose network pays for a planned action (undefined when the
 *  action is not tied to a tile). */
function actionVillage(map: GameMap, player: Player, a: AiAction): MapTile | undefined {
  if ('q' in a && 'r' in a && typeof a.q === 'number' && typeof a.r === 'number') {
    const tile = tileAt(map, a.q, a.r);
    return (tile && payerVillage(map, player.index, tile)) ?? undefined;
  }
  return undefined;
}

function discretionaryCost(map: GameMap, player: Player, a: AiAction): Resources | null {
  switch (a.type) {
    case 'upgrade': {
      const level = tileAt(map, a.q, a.r)?.settlement?.level;
      return level === undefined ? null : villageUpgradeCost(level);
    }
    case 'build':
      return a.kind === 'mine' || a.kind === 'farm' || a.kind === 'granary' ? null : BUILDING_COSTS[a.kind];
    case 'spawn':
      return unitSpawnCost(a.unitType);
    case 'buildRoad':
      return ROAD_COST;
    case 'buildBridge':
      return BRIDGE_COST;
    case 'openSkill': {
      if (a.skill === 'agriculture' || a.skill === 'forestry' || a.skill === 'climbing' || a.skill === 'smithery' || a.skill === 'granary') return null;
      return moneyCost(skillCost(a.skill, player.skills.length));
    }
    default:
      return null;
  }
}

function markUsed(state: AiPlannerState, action: AiAction): void {
  switch (action.type) {
    case 'move':
      state.moved.add(action.unitId);
      state.occupied.add(key(action.q, action.r));
      break;
    case 'attack':
    case 'heal':
    case 'capture':
      state.acted.add(action.unitId);
      break;
    case 'spawn':
      state.spawned.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
      break;
    case 'upgrade':
      state.upgraded.add(key(action.q, action.r));
      break;
    case 'build':
      state.built.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
      break;
    case 'buildRoad':
      state.built.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
      break;
    case 'buildBridge':
      state.built.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
      break;
    case 'upgradeShip':
      state.acted.add(action.unitId);
      break;
    case 'stun':
    case 'enableStealth':
    case 'storm':
    case 'trap':
    case 'burn':
    case 'burnRoad':
      state.acted.add(action.unitId);
      break;
    case 'builderBuild':
      state.acted.add(action.unitId);
      state.built.add(key(action.q, action.r));
      break;
    case 'openSkill':
      state.opened.add(action.skill);
      break;
  }
}

/** Executes one planned action on the live game and reports whether it took
 *  effect. Supplying it switches the planner to live mode: every step is
 *  applied before the next is chosen, so patterns always see the real board
 *  (kills, misses, counter damage, spent money) instead of a frozen snapshot. */
export type AiActionExecutor = (action: AiAction, marker: AiActionMarker) => boolean;

export function planAiActions(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  mode: GameMode = 'capture',
  markers?: AiActionMarker[],
  turn: number = 0,
  execute?: AiActionExecutor,
): AiAction[] {
  const difficulty = profileFor(player);
  let situation = analyzeSituation(map, player, mode, difficulty);
  const strategy = updateStrategy(map, player, situation, mode, difficulty, turn, rng);
  let directives = deriveDirectives(map, player, situation, difficulty, strategy);
  if (AI_DEBUG_LOGGING) aiLog(`  situation: ${situationSummary(situation)}`);
  if (AI_DEBUG_LOGGING) aiLog(`  strategy: ${strategy.goals.map((g) => `${g.id}:${g.phase}`).join(',')} directives: {front=${directives.frontTarget ? key(directives.frontTarget.q, directives.frontTarget.r) : '-'}, reserve=${directives.moneyReserve}, pace=${directives.pace}}`);
  const state: AiPlannerState = {
    moved: new Set(),
    acted: new Set(),
    upgraded: new Set(),
    spawned: new Set(),
    built: new Set(),
    opened: new Set(),
    occupied: new Set(),
  };
  const patterns = buildPatterns();
  const operation = updateOperation(map, player, situation, turn);
  const actions: AiAction[] = [];
  let stepNo = 0;
  for (let i = 0; i < MAX_PLAN_STEPS; i++) {
    if (execute && i > 0) {
      situation = analyzeSituation(map, player, mode, difficulty);
      directives = deriveDirectives(map, player, situation, difficulty, strategy);
    }
    const ctx: AiPatternContext = { map, player, rng, state, situation, difficulty, directives, operation };
    let next: AiAction[] | null = null;
    let label = 'fallback(best-score)';
    let note = '';
    for (const pattern of patterns) {
      next = pattern.evaluate(ctx);
      if (next) {
        label = `pattern=${pattern.id}`;
        if (pattern.id.startsWith('naval-')) note = ` (navalThreat=${situation.navalThreat})`;
        break;
      }
    }
    if (!next) {
      const source: { kind: 'best' | 'random' } = { kind: 'best' };
      next = bestAvailableAction(map, player, rng, state, situation, difficulty, directives, source);
      if (next && source.kind === 'random') label = 'fallback(RANDOM mistake)';
    }
    if (!next) break;
    stepNo += 1;
    aiLog(`  step ${stepNo}. ${label} -> ${next.map(formatAiAction).join(' | ')}${note}`);
    // A failed action cancels the rest of its step (e.g. the attack after a
    // failed move), but every action is still marked used so the planner
    // cannot pick the same doomed step again.
    let failed = false;
    for (const a of next) {
      actions.push(a);
      const marker = { label, note };
      if (markers) markers.push(marker);
      markUsed(state, a);
      if (execute && !failed && !execute(a, marker)) failed = true;
    }
  }
  return actions;
}
