import { canBuildSawmill, canBuildForestTemple, canBuildMine, canBuildPort, canBuildTemple, BUILDING_COSTS } from './buildings';
import { hexDistance, hexNeighbors } from './hex';
import { BRIDGE_COST, canBuildBridge } from './bridges';
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford, pay, villageUpgradeCost } from './resources';
import { canOpenSkill, hasSkill, SKILLS, SkillId } from './skills';
import { reachableTargets, tileAt } from './selection';
import { canHeal, UNIT_TYPES, Unit } from './units';
import { SeededRandom } from '../util/random';
import { AI_PATTERNS, AiPatternContext, bestSpawnableUnitType, enemyCanAttackNext, enemyCanReach, isFrontierTile, nearestEnemyDistanceFrom, nearestFreeVillageDistanceFrom, nearestOwnUnitDistanceFrom, nearestVillageDistanceFrom } from './aiPatterns';
import { AiAction, AiPlannerState } from './aiTypes';
import { chooseBestAttack, tradeIsFavorable } from './combat';
import { isExploredFor } from './explore';
import { GameMode } from './gameMode';
import { AiSituation, analyzeSituation } from './aiSituation';
import { AiDifficultyProfile, profileFor } from './aiDifficulty';

const MAX_PLAN_STEPS = 200;

function key(q: number, r: number): string {
  return `${q},${r}`;
}

function bestAvailableAction(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  state: AiPlannerState,
  situation: AiSituation | undefined,
  difficulty: AiDifficultyProfile | undefined,
): AiAction[] | null {
  const jitter = (): number => rng.next() * 60;
  const candidates: { score: number; action: AiAction | AiAction[] }[] = [];

  for (const v of map.tiles) {
    if (!v.settlement || v.settlement.owner !== player.index) continue;
    const k = key(v.q, v.r);
    if (!state.upgraded.has(k) && canAfford(player.resources, villageUpgradeCost(v.settlement.level))) {
      const front = nearestEnemyDistanceFrom(map, player.index, v) <= 4;
      candidates.push({ score: (front ? 700 : 350) + jitter(), action: { type: 'upgrade', q: v.q, r: v.r } });
    }
    if (!state.spawned.has(k) && !v.unit) {
      const threatened = enemyCanReach(map, v, player.index);
      const freeVillageToGrab = map.tiles.some(
        (t) =>
          t.settlement &&
          t.settlement.owner === null &&
          isExploredFor(t, player.index) &&
          !state.occupied.has(key(t.q, t.r)),
      );
      const prefer =
        situation?.stance === 'defend' || threatened
          ? 'defense'
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
      const a = chooseBestAttack(map, ghost, unit.owner);
      if (a && (!difficulty || !difficulty.checkTrades || tradeIsFavorable(ghost, a))) {
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
      if (s > bestMoveScore) {
        bestMoveScore = s;
        bestMove = c;
        bestAttackAfter = null;
      }
    }
    if (bestMove && bestAttackAfter) {
      candidates.push({
        score: bestMoveScore + jitter(),
        action: [
          { type: 'move', unitId: unit.id, q: bestMove.q, r: bestMove.r },
          { type: 'attack', unitId: unit.id, q: bestAttackAfter.q, r: bestAttackAfter.r },
        ],
      });
    } else if (bestMove) {
      candidates.push({ score: bestMoveScore + jitter(), action: { type: 'move', unitId: unit.id, q: bestMove.q, r: bestMove.r } });
    }
  }

  for (const tile of map.tiles) {
    if (tile.ownedBy !== player.index) continue;
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (canBuildSawmill(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.sawmill)) {
      candidates.push({ score: 400 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'sawmill' } });
    }
    if (canBuildMine(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.mine)) {
      candidates.push({ score: 400 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'mine' } });
    }
    if (canBuildPort(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.port)) {
      candidates.push({ score: 200 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'port' } });
    }
    if (canBuildTemple(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.temple)) {
      candidates.push({ score: 200 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'temple' } });
    }
    if (canBuildForestTemple(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.forestTemple)) {
      candidates.push({ score: 200 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'forestTemple' } });
    }
  }

  for (const tile of map.tiles) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildBridge(map, tile, player)) continue;
    if (!canAfford(player.resources, BRIDGE_COST)) continue;
    const touchesOwnNetwork = hexNeighbors(tile).some((n) => {
      const t = tileAt(map, n.q, n.r);
      return t !== undefined && (t.ownedBy === player.index || t.roadOwner === player.index);
    });
    if (!touchesOwnNetwork) continue;
    candidates.push({ score: 250 + jitter(), action: { type: 'buildBridge', q: tile.q, r: tile.r } });
  }

  for (const id of Object.keys(SKILLS) as SkillId[]) {
    if (state.opened.has(id)) continue;
    if (canOpenSkill(player, id)) {
      candidates.push({ score: 150 + jitter(), action: { type: 'openSkill', skill: id } });
    }
  }

  if (difficulty && difficulty.mistakeChance > 0 && rng.next() < difficulty.mistakeChance) {
    const pick = candidates[Math.floor(rng.next() * candidates.length)]!;
    return Array.isArray(pick.action) ? pick.action : [pick.action];
  }

  if (candidates.length === 0) return null;
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
    case 'buildBridge':
      state.built.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
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
): AiAction[] {
  const difficulty = profileFor(player);
  const situation = analyzeSituation(map, player, mode, difficulty);
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
  for (let i = 0; i < MAX_PLAN_STEPS; i++) {
    const ctx: AiPatternContext = { map, player, rng, state, situation, difficulty };
    let next: AiAction[] | null = null;
    for (const pattern of AI_PATTERNS) {
      next = pattern.evaluate(ctx);
      if (next) break;
    }
    if (!next) next = bestAvailableAction(map, player, rng, state, situation, difficulty);
    if (!next) break;
    for (const a of next) {
      actions.push(a);
      markUsed(state, a);
    }
  }
  return actions;
}
