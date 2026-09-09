import { canBuildSawmill, canBuildForestTemple, canBuildMine, canBuildPort, canBuildTemple, BUILDING_COSTS } from './buildings';
import { hexDistance, hexNeighbors } from './hex';
import { canBuildBridge, bridgeCoastOffsets, bridgeDirFor, BRIDGE_COST } from './bridges';
import { canBuildRoad } from './roads';
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford, pay, villageUpgradeCost } from './resources';
import { canOpenSkill, hasSkill, SkillId } from './skills';
import { reachableTargets, tileAt } from './selection';
import { canHeal, UNIT_TYPES, Unit } from './units';
import { SeededRandom } from '../util/random';
import { buildingsInVillage, villageBuildingLimit } from './village';
import { isMountainType } from './tileTypes';
import { TRIBES } from './tribes';
import { AI_PATTERNS, AiPatternContext, bestSpawnableUnitType, enemyCanAttackNext, enemyCanReach, isFrontierTile, landEnemyCanReach, nearestEnemyDistanceFrom, nearestFreeVillageDistanceFrom, nearestOwnUnitDistanceFrom, nearestVillageDistanceFrom } from './aiPatterns';
import { AiAction, AiPlannerState } from './aiTypes';
import { attackableTargets, chooseBestAttack, tradeIsFavorable } from './combat';
import { isExploredFor } from './explore';
import { GameMode } from './gameMode';
import { AiSituation, analyzeSituation, coastExposedTile, isNavalEnemy, navalCanStrikeTile } from './aiSituation';
import { AiDifficultyProfile, profileFor } from './aiDifficulty';
import { isShip } from './ship';

const MAX_PLAN_STEPS = 200;

/** Strong penalty for idle land units standing where a naval enemy can hit. */
const NAVAL_EXPOSURE_PENALTY = 400;

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
  }
}

function key(q: number, r: number): string {
  return `${q},${r}`;
}

/** Skill-open order the AI prefers: economy/production first so it can build
 *  mines (stone/ore) and sawmills early instead of opening random leaves. */
const AI_SKILL_ORDER: SkillId[] = [
  'forestry',
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

function bestAvailableAction(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  state: AiPlannerState,
  situation: AiSituation | undefined,
  difficulty: AiDifficultyProfile | undefined,
  source?: { kind: 'best' | 'random' },
): AiAction[] | null {
  const jitter = (): number => rng.next() * 60;
  const candidates: { score: number; action: AiAction | AiAction[] }[] = [];

  for (const v of map.tiles) {
    if (!v.settlement || v.settlement.owner !== player.index) continue;
    const k = key(v.q, v.r);
    if (!state.upgraded.has(k) && canAfford(player.resources, villageUpgradeCost(v.settlement.level))) {
      const front = nearestEnemyDistanceFrom(map, player.index, v) <= 4;
      const level = v.settlement!.level;
      const boost = hasPendingMineSlot(map, player, v) ? 260 : level <= 2 && !front ? 90 : 0;
      candidates.push({ score: (front ? 700 : 400) + boost + jitter(), action: { type: 'upgrade', q: v.q, r: v.r } });
    }
    if (!state.spawned.has(k) && !v.unit) {
      const threatened = landEnemyCanReach(map, v, player.index);
      // A fresh spawn cannot act this turn, so never drop one into a village a
      // naval enemy can already hit — it would just feed the pirate.
      if (situation?.navalThreat && !threatened && navalCanStrikeTile(v, situation.navalEnemies)) continue;
      const freeVillageToGrab = map.tiles.some(
        (t) =>
          t.settlement &&
          t.settlement.owner === null &&
          isExploredFor(t, player.index) &&
          !state.occupied.has(key(t.q, t.r)),
      );
      const prefer =
        threatened || situation?.stance === 'defend'
          ? 'defense'
          : situation?.navalThreat
            ? 'naval'
            : situation?.stance === 'settle' && freeVillageToGrab
              ? 'scout'
              : 'offense';
      const type = bestSpawnableUnitType(player, prefer);
      if (type) {
        const cost = { wood: UNIT_TYPES[type].priceWood, stone: 0, money: UNIT_TYPES[type].price, ore: UNIT_TYPES[type].priceOre };
        if (canAfford(player.resources, cost)) {
          const after = pay(player.resources, cost);
          const reserveOk = threatened || after.money >= (difficulty?.spawnReserve ?? UNIT_TYPES.warrior.price);
          if (reserveOk) {
            candidates.push({ score: (threatened ? 500 : 250) + jitter(), action: { type: 'spawn', q: v.q, r: v.r, unitType: type } });
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
    const attackTile = chooseBestAttack(map, unit, unit.owner);
    if (attackTile && (!difficulty || !difficulty.checkTrades || tradeIsFavorable(unit, attackTile))) {
      candidates.push({ score: 4000 + jitter(), action: { type: 'attack', unitId: unit.id, q: attackTile.q, r: attackTile.r } });
      continue;
    }
    if (state.moved.has(unit.id)) continue;
    if (canHeal(unit) && unit.hp < UNIT_TYPES[unit.type].maxHp && !enemyCanAttackNext(map, t, player.index)) {
      candidates.push({ score: 600 + jitter(), action: { type: 'heal', unitId: unit.id, q: t.q, r: t.r } });
      continue;
    }
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
      if (a && !foreignVillage && (!difficulty || !difficulty.checkTrades || tradeIsFavorable(ghost, a))) {
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
      const inThreat = enemyCanAttackNext(map, c, player.index);
      const ownBonus = c.settlement && c.settlement.owner === unit.owner ? 40 : 0;
      const frontier = isFrontierTile(map, c, player.index) ? 20 : 0;
      const freeBonus = Number.isFinite(distToFree) ? Math.max(0, 60 - distToFree * 10) : 0;
      const villageBonus = Number.isFinite(distToVillage) ? 100 - distToVillage : 0;
      // Keep the army clustered: favour tiles close to other friendly units.
      const ownDist = nearestOwnUnitDistanceFrom(map, player.index, c);
      const groupBonus = Number.isFinite(ownDist) ? Math.max(0, 26 - ownDist * 3) : 0;
      let s = villageBonus + freeBonus + frontier + groupBonus - (inThreat ? 200 : 0) + ownBonus;
      if (situation?.stance === 'war' && situation.frontTarget) {
        const df = hexDistance(c, situation.frontTarget);
        s += 500 - df * 10;
        const ownDist = nearestOwnUnitDistanceFrom(map, player.index, c);
        if (Number.isFinite(ownDist)) s += Math.max(0, 30 - ownDist * 4);
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

  for (const tile of map.tiles) {
    if (tile.ownedBy !== player.index) continue;
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (canBuildSawmill(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.sawmill)) {
      if (!reserveLastSlotForMine(map, player, tile)) {
        candidates.push({ score: 360 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'sawmill' } });
      }
    }
    if (canBuildMine(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.mine)) {
      candidates.push({ score: 500 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'mine' } });
    }
    if (canBuildPort(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.port)) {
      if (!reserveLastSlotForMine(map, player, tile) || situation?.navalThreat) {
        candidates.push({ score: 200 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'port' } });
      }
    }
    if (canBuildTemple(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.temple)) {
      if (!reserveLastSlotForMine(map, player, tile)) {
        candidates.push({ score: 200 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'temple' } });
      }
    }
    if (canBuildForestTemple(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.forestTemple)) {
      if (!reserveLastSlotForMine(map, player, tile)) {
        candidates.push({ score: 200 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'forestTemple' } });
      }
    }
  }

  for (const tile of map.tiles) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildRoad(map, tile, player)) continue;
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
    if (!canAfford(player.resources, BRIDGE_COST)) continue;
    // While a naval threat is active, spend on the naval response instead.
    if (situation?.navalThreat) continue;
    const touchesOwnNetwork = hexNeighbors(tile).some((n) => {
      const t = tileAt(map, n.q, n.r);
      return t !== undefined && (t.ownedBy === player.index || t.roadOwner === player.index);
    });
    if (!touchesOwnNetwork) continue;
    if (!bridgeLeadsSomewhere(map, tile, player)) continue;
    candidates.push({ score: 250 + jitter(), action: { type: 'buildBridge', q: tile.q, r: tile.r } });
  }

  for (const id of AI_SKILL_ORDER) {
    if (state.opened.has(id)) continue;
    if (canOpenSkill(player, id)) {
      const rank = AI_SKILL_ORDER.indexOf(id);
      candidates.push({ score: 240 - rank * 8 + jitter(), action: { type: 'openSkill', skill: id } });
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
    case 'openSkill':
      state.opened.add(action.skill);
      break;
  }
}

export function planAiActions(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  mode: GameMode = 'capture',
  markers?: AiActionMarker[],
): AiAction[] {
  const difficulty = profileFor(player);
  const situation = analyzeSituation(map, player, mode, difficulty);
  if (AI_DEBUG_LOGGING) aiLog(`  situation: ${situationSummary(situation)}`);
  const state: AiPlannerState = {
    moved: new Set(),
    acted: new Set(),
    upgraded: new Set(),
    spawned: new Set(),
    built: new Set(),
    opened: new Set(),
    occupied: new Set(),
  };
  const actions: AiAction[] = [];
  let stepNo = 0;
  for (let i = 0; i < MAX_PLAN_STEPS; i++) {
    const ctx: AiPatternContext = { map, player, rng, state, situation, difficulty };
    let next: AiAction[] | null = null;
    let label = 'fallback(best-score)';
    let note = '';
    for (const pattern of AI_PATTERNS) {
      next = pattern.evaluate(ctx);
      if (next) {
        label = `pattern=${pattern.id}`;
        if (pattern.id.startsWith('naval-')) note = ` (navalThreat=${situation.navalThreat})`;
        break;
      }
    }
    if (!next) {
      const source: { kind: 'best' | 'random' } = { kind: 'best' };
      next = bestAvailableAction(map, player, rng, state, situation, difficulty, source);
      if (next && source.kind === 'random') label = 'fallback(RANDOM mistake)';
    }
    if (!next) break;
    stepNo += 1;
    aiLog(`  step ${stepNo}. ${label} -> ${next.map(formatAiAction).join(' | ')}${note}`);
    for (const a of next) {
      actions.push(a);
      if (markers) markers.push({ label, note });
      markUsed(state, a);
    }
  }
  return actions;
}
