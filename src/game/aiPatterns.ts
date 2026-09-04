import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford, villageUpgradeCost } from './resources';
import { hasSkill } from './skills';
import { reachableTargets, tileAt } from './selection';
import { UNIT_ATTACK_DISTANCE, UNIT_MOVEMENT, UNIT_TYPES, Unit, UnitType } from './units';
import { SeededRandom } from '../util/random';
import { hexDistance, hexNeighbors } from './hex';
import { attackableTargets, attackDamage, tradeIsFavorable } from './combat';
import { canBuildSawmill, canBuildMine, BUILDING_COSTS } from './buildings';
import { isExploredFor } from './explore';
import { AiAction, AiPlannerState } from './aiTypes';
import { AiDifficultyProfile } from './aiDifficulty';
import { AiSituation, isMelee } from './aiSituation';

export interface AiPatternContext {
  map: GameMap;
  player: Player;
  rng: SeededRandom;
  state: AiPlannerState;
  situation?: AiSituation;
  difficulty?: AiDifficultyProfile;
}

export interface AiPattern {
  id: string;
  priority: number;
  evaluate(ctx: AiPatternContext): AiAction[] | null;
}

function key(q: number, r: number): string {
  return `${q},${r}`;
}

export function enemyCanReach(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  return map.tiles.some(
    (t) =>
      t.unit &&
      t.unit.owner !== playerIndex &&
      isExploredFor(t, playerIndex) &&
      hexDistance(tile, t) <= UNIT_MOVEMENT[t.unit.type],
  );
}

export function enemyCanAttackNext(map: GameMap, tile: MapTile, playerIndex: number): boolean {
  return map.tiles.some(
    (t) =>
      t.unit &&
      t.unit.owner !== playerIndex &&
      isExploredFor(t, playerIndex) &&
      hexDistance(tile, t) <= UNIT_MOVEMENT[t.unit.type] + UNIT_ATTACK_DISTANCE[t.unit.type],
  );
}

export type SpawnPreference = 'offense' | 'defense' | 'scout';

const SPAWN_ORDER: Record<SpawnPreference, UnitType[]> = {
  offense: ['knight', 'swordsman', 'catapult', 'warrior', 'rider', 'archer', 'shield'],
  defense: ['shield', 'knight', 'catapult', 'archer', 'swordsman', 'warrior', 'rider'],
  scout: ['rider', 'knight', 'swordsman', 'warrior', 'archer', 'shield', 'catapult'],
};

export function bestSpawnableUnitType(
  player: Player,
  prefer: SpawnPreference = 'offense',
): UnitType | null {
  for (const type of SPAWN_ORDER[prefer]) {
    if (type === 'rider' && !hasSkill(player, 'riding')) continue;
    if (type === 'knight' && !hasSkill(player, 'knights')) continue;
    if (type === 'swordsman' && !hasSkill(player, 'swordsman')) continue;
    if (type === 'catapult' && !hasSkill(player, 'catapult')) continue;
    const cost = { wood: UNIT_TYPES[type].priceWood, stone: 0, money: UNIT_TYPES[type].price, ore: UNIT_TYPES[type].priceOre };
    if (canAfford(player.resources, cost)) return type;
  }
  return null;
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
  const canClimb = hasSkill(player, 'climbing');
  const canDock = hasSkill(player, 'navigation');
  for (const t of map.tiles) {
    const unit = t.unit;
    if (!unit || unit.owner !== player.index) continue;
    if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
    if (attackableTargets(map, unit, player.index).some((a) => a.q === targetTile.q && a.r === targetTile.r)) {
      out.push({ unit, moveTo: null });
      continue;
    }
    for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
      if (state.occupied.has(key(c.q, c.r))) continue;
      const ghost: Unit = { ...unit, q: c.q, r: c.r };
      if (attackableTargets(map, ghost, player.index).some((a) => a.q === targetTile.q && a.r === targetTile.r)) {
        out.push({ unit, moveTo: c });
        break;
      }
    }
  }
  return out;
}

export const AI_PATTERNS: AiPattern[] = [
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
          return [{ type: 'capture', q: t.q, r: t.r, unitId: unit.id }];
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
        if (
          attackableTargets(map, unit, unit.owner).some(
            (a) => a.q === enemyInVillage.q && a.r === enemyInVillage.r,
          )
        ) {
          actions.push({ type: 'attack', unitId: unit.id, q: enemyInVillage.q, r: enemyInVillage.r });
          continue;
        }
        if (state.moved.has(unit.id)) continue;
        const moveTarget = reachableTargets(map, unit, undefined, undefined, undefined, unit.owner).find(
          (c) =>
            !state.occupied.has(key(c.q, c.r)) &&
            hexDistance(c, enemyInVillage) <= unit.attackDistance,
        );
        if (moveTarget) {
          actions.push(
            { type: 'move', unitId: unit.id, q: moveTarget.q, r: moveTarget.r },
            { type: 'attack', unitId: unit.id, q: enemyInVillage.q, r: enemyInVillage.r },
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
        if (a.moveTo) actions.push({ type: 'move', unitId: a.unit.id, q: a.moveTo.q, r: a.moveTo.r });
        actions.push({ type: 'attack', unitId: a.unit.id, q: best.t.q, r: best.t.r });
      }
      return actions;
    },
  },
  {
    id: 'capture-free-village',
    priority: 130,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
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
      if (best) return [{ type: 'move', unitId: best.unit.id, q: best.target.q, r: best.target.r }];
      return null;
    },
  },
  {
    id: 'collect-bonus',
    priority: 125,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
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
      return [{ type: 'move', unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  },
  {
    id: 'reinforce-endangered-village',
    priority: 120,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || situation.stance !== 'defend') return null;
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
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
          if (t.settlement && t.settlement.owner === player.index) continue;
          if (hexDistance(t, v) > d.enemyTurns * UNIT_MOVEMENT[unit.type]) continue;
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
      return [{ type: 'move', unitId: best.unit.id, q: best.step.q, r: best.step.r }];
    },
  },
  {
    id: 'capture-push',
    priority: 110,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
      for (const t of map.tiles) {
        if (!t.settlement || t.settlement.owner === player.index) continue;
        if (!isExploredFor(t, player.index)) continue;
        if (t.settlement.captureReady) continue;
        if (t.unit && t.unit.owner === player.index) continue;
        for (const src of map.tiles) {
          const unit = src.unit;
          if (!unit || unit.owner !== player.index) continue;
          if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
          if (state.occupied.has(key(t.q, t.r))) continue;
          const canReach = reachableTargets(map, unit, undefined, canClimb, canDock, player.index).some(
            (c) => c.q === t.q && c.r === t.r,
          );
          if (!canReach) continue;
          return [{ type: 'move', unitId: unit.id, q: t.q, r: t.r }];
        }
      }
      return null;
    },
  },
  {
    id: 'secure-free-village',
    priority: 105,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
      let best: { unit: Unit; target: MapTile; villageKey: string } | null = null;
      let bestScore = Infinity;
      for (const v of map.tiles) {
        if (!v.settlement || v.settlement.owner !== null) continue;
        const vk = key(v.q, v.r);
        if (state.occupied.has(vk)) continue;
        if (v.unit && v.unit.owner === player.index) continue;
        for (const t of map.tiles) {
          const unit = t.unit;
          if (!unit || unit.owner !== player.index) continue;
          if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
          if (enemyCanAttackNext(map, t, player.index)) continue;
          if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
          const reach = reachableTargets(map, unit, undefined, canClimb, canDock, player.index).filter(
            (c) => !state.occupied.has(key(c.q, c.r)) && !(c.settlement && c.settlement.owner === player.index),
          );
          let bestStep: MapTile | null = null;
          let bestStepDist = Infinity;
          for (const c of reach) {
            const d = hexDistance(c, v);
            if (d < bestStepDist) {
              bestStepDist = d;
              bestStep = c;
            }
          }
          if (!bestStep) continue;
          const score = hexDistance(t, v);
          if (score < bestScore) {
            bestScore = score;
            best = { unit, target: bestStep, villageKey: vk };
          }
        }
      }
      if (best) {
        state.occupied.add(best.villageKey);
        return [{ type: 'move', unitId: best.unit.id, q: best.target.q, r: best.target.r }];
      }
      return null;
    },
  },
  {
    id: 'defend-empty-village',
    priority: 100,
    evaluate({ map, player, state }): AiAction[] | null {
      const villages = map.tiles.filter((t) => t.settlement && t.settlement.owner === player.index);
      for (const v of villages) {
        const k = key(v.q, v.r);
        if (state.spawned.has(k)) continue;
        if (v.unit) continue;
        if (!enemyCanReach(map, v, player.index)) continue;
        const type = bestSpawnableUnitType(player, 'defense');
        if (!type) continue;
        return [{ type: 'spawn', q: v.q, r: v.r, unitType: type }];
      }
      return null;
    },
  },
  {
    id: 'counter-threat',
    priority: 95,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        for (const e of map.tiles) {
          const enemy = e.unit;
          if (!enemy || enemy.owner === player.index) continue;
          if (!isExploredFor(e, player.index)) continue;
          if (hexDistance(t, e) > enemy.attackDistance) continue;
          if (attackDamage(enemy) < unit.hp) continue;
          const canKill = attackableTargets(map, unit, player.index).some((a) => a.q === e.q && a.r === e.r) && attackDamage(unit) >= enemy.hp;
          if (canKill) return [{ type: 'attack', unitId: unit.id, q: e.q, r: e.r }];
          let best: MapTile | null = null;
          let bestDist = -Infinity;
          for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === unit.owner) {
              best = c;
              break;
            }
            const d = nearestEnemyDistanceFrom(map, player.index, c);
            if (d > bestDist) {
              bestDist = d;
              best = c;
            }
          }
          if (best) return [{ type: 'move', unitId: unit.id, q: best.q, r: best.r }];
        }
      }
      return null;
    },
  },
  {
    id: 'garrison-empty-village',
    priority: 92,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
      for (const v of map.tiles) {
        if (!v.settlement || v.settlement.owner !== player.index) continue;
        if (v.unit) continue;
        const vk = key(v.q, v.r);
        if (state.occupied.has(vk)) continue;
        if (!enemyCanReach(map, v, player.index)) continue;
        let best: { unit: Unit; dist: number } | null = null;
        for (const t of map.tiles) {
          const unit = t.unit;
          if (!unit || unit.owner !== player.index) continue;
          if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
          if (t.settlement && t.settlement.owner === player.index) continue;
          const reach = reachableTargets(map, unit, undefined, canClimb, canDock, player.index);
          if (!reach.some((c) => c.q === v.q && c.r === v.r)) continue;
          const dist = hexDistance(unit, v);
          if (!best || dist < best.dist) best = { unit, dist };
        }
        if (!best) continue;
        return [{ type: 'move', unitId: best.unit.id, q: v.q, r: v.r }];
      }
      return null;
    },
  },
  {
    id: 'defend-hurt-unit',
    priority: 90,
    evaluate({ map, player, rng, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (!t.settlement || t.settlement.owner !== player.index) continue;
        if (unit.hp > UNIT_TYPES[unit.type].maxHp / 2) continue;
        if (!enemyCanAttackNext(map, t, player.index)) continue;
        if (rng.next() < 0.5) {
          return [{ type: 'heal', unitId: unit.id, q: t.q, r: t.r }];
        }
        const targets = reachableTargets(map, unit, undefined, undefined, hasSkill(player, 'navigation'), unit.owner).filter(
          (c) =>
            !state.occupied.has(key(c.q, c.r)) &&
            !(c.settlement && c.settlement.owner === player.index),
        );
        if (targets.length === 0) {
          return [{ type: 'heal', unitId: unit.id, q: t.q, r: t.r }];
        }
        const target = targets[Math.floor(rng.next() * targets.length)]!;
        const spawnType = bestSpawnableUnitType(player, 'defense');
        if (!spawnType) return [{ type: 'heal', unitId: unit.id, q: t.q, r: t.r }];
        return [
          { type: 'move', unitId: unit.id, q: target.q, r: target.r },
          { type: 'spawn', q: t.q, r: t.r, unitType: spawnType },
        ];
      }
      return null;
    },
  },
  {
    id: 'retreat-heal',
    priority: 85,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (unit.hp > UNIT_TYPES[unit.type].maxHp / 2) continue;
        if (t.settlement && t.settlement.owner === player.index) continue;
        if (!enemyCanAttackNext(map, t, player.index)) continue;
        let best: MapTile | null = null;
        let bestDist = -Infinity;
        for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement && c.settlement.owner === unit.owner) {
            best = c;
            break;
          }
          const d = nearestEnemyDistanceFrom(map, player.index, c);
          if (d > bestDist) {
            bestDist = d;
            best = c;
          }
        }
        if (best) return [{ type: 'move', unitId: unit.id, q: best.q, r: best.r }];
      }
      return null;
    },
  },
  {
    id: 'archer-kite',
    priority: 80,
    evaluate({ map, player, rng, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (unit.type !== 'archer') continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement) continue;
        const enemy = map.tiles.find(
          (e) => e.unit && e.unit.owner !== player.index && hexDistance(t, e) === 1,
        );
        if (!enemy) continue;
        const targets = reachableTargets(map, unit, undefined, undefined, hasSkill(player, 'navigation'), unit.owner).filter(
          (c) => hexDistance(enemy, c) === 2 && !state.occupied.has(key(c.q, c.r)),
        );
        if (targets.length === 0) continue;
        const target = targets[Math.floor(rng.next() * targets.length)]!;
        return [
          { type: 'move', unitId: unit.id, q: target.q, r: target.r },
          { type: 'attack', unitId: unit.id, q: enemy.q, r: enemy.r },
        ];
      }
      return null;
    },
  },
  {
    id: 'hunt-idle-enemy',
    priority: 78,
    evaluate({ map, player, state, situation, difficulty }): AiAction[] | null {
      if (!situation || situation.enemies.length === 0) return null;
      if (situation.endangered && situation.stance === 'defend') return null;
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
      let best: { action: AiAction[]; score: number } | null = null;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner === player.index) continue;
        const melee = isMelee(unit);
        for (const e of situation.enemies) {
          const enemyTile = e.tile;
          if (!enemyTile.unit || enemyTile.unit.owner === player.index) continue;
          const strikes = (tile: MapTile): boolean =>
            attackableTargets(map, { ...unit, q: tile.q, r: tile.r }, player.index).some(
              (a) => a.q === enemyTile.q && a.r === enemyTile.r,
            );
          const isGood = (tile: MapTile): boolean => {
            const enemy = enemyTile.unit!;
            if (attackDamage(unit) >= enemy.hp) return true;
            if (!difficulty || !difficulty.checkTrades) return true;
            return tradeIsFavorable({ ...unit, q: tile.q, r: tile.r }, enemyTile);
          };
          if (strikes(t)) {
            const kills = attackDamage(unit) >= enemyTile.unit.hp;
            if (!kills && difficulty?.checkTrades && !tradeIsFavorable(unit, enemyTile)) continue;
            const score = (kills ? 500 : 300) - hexDistance(t, enemyTile);
            if (!best || score > best.score) {
              best = { action: [{ type: 'attack', unitId: unit.id, q: enemyTile.q, r: enemyTile.r }], score };
            }
            continue;
          }
          if (!melee) continue;
          const canKill = attackDamage(unit) >= enemyTile.unit.hp;
          const notTougher = UNIT_TYPES[enemyTile.unit.type].maxHp <= UNIT_TYPES[unit.type].maxHp;
          if (!canKill && !notTougher) continue;
          const startDist = hexDistance(t, enemyTile);
          for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === player.index) continue;
            const nd = hexDistance(c, enemyTile);
            if (nd >= startDist) continue;
            const moveDist = hexDistance(t, c);
            if (strikes(c) && isGood(c)) {
              const score = (canKill ? 500 : 300) - nd * 10 - moveDist;
              if (!best || score > best.score) {
                best = {
                  action: [
                    { type: 'move', unitId: unit.id, q: c.q, r: c.r },
                    { type: 'attack', unitId: unit.id, q: enemyTile.q, r: enemyTile.r },
                  ],
                  score,
                };
              }
            } else {
              const score = 200 - nd * 10 - moveDist;
              if (!best || score > best.score) {
                best = { action: [{ type: 'move', unitId: unit.id, q: c.q, r: c.r }], score };
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
    id: 'explore-frontier',
    priority: 75,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
      let best: { unit: Unit; target: MapTile } | null = null;
      let bestScore = -Infinity;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (!isFrontierTile(map, c, player.index)) continue;
          const unexplored = hexNeighbors(c).filter((n) => {
            const nt = tileAt(map, n.q, n.r);
            return nt !== undefined && !isExploredFor(nt, player.index);
          }).length;
          const score = unexplored * 5 - hexDistance(t, c);
          if (score > bestScore) {
            bestScore = score;
            best = { unit, target: c };
          }
        }
      }
      if (best) return [{ type: 'move', unitId: best.unit.id, q: best.target.q, r: best.target.r }];
      return null;
    },
  },
  {
    id: 'economy-opening',
    priority: 25,
    evaluate({ map, player, state }): AiAction[] | null {
      const ownUnits = map.tiles.filter((t) => t.unit && t.unit.owner === player.index).length;
      if (ownUnits > 4) return null;
      for (const t of map.tiles) {
        if (!t.settlement || t.settlement.owner !== player.index) continue;
        const k = key(t.q, t.r);
        if (state.upgraded.has(k)) continue;
        if (!canAfford(player.resources, villageUpgradeCost(t.settlement.level))) continue;
        const front = nearestEnemyDistanceFrom(map, player.index, t) <= 4;
        if (front || ownUnits <= 2) return [{ type: 'upgrade', q: t.q, r: t.r }];
      }
      for (const tile of map.tiles) {
        if (tile.ownedBy !== player.index) continue;
        if (state.built.has(key(tile.q, tile.r))) continue;
        if (canBuildMine(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.mine)) {
          return [{ type: 'build', q: tile.q, r: tile.r, kind: 'mine' }];
        }
        if (canBuildSawmill(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.sawmill)) {
          return [{ type: 'build', q: tile.q, r: tile.r, kind: 'sawmill' }];
        }
      }
      return null;
    },
  },
];
