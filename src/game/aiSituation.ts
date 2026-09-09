import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { GameMode } from './gameMode';
import { AiDifficultyProfile } from './aiDifficulty';
import { isExploredFor } from './explore';
import { hexDistance, hexNeighbors } from './hex';
import { isShip, shipAttackDistance, shipMovement } from './ship';
import { UNIT_ATTACK_DISTANCE, UNIT_MOVEMENT, Unit, UnitType } from './units';
import { isWaterType } from './tileTypes';
import { attackDamage } from './combat';

export type AiStance = 'settle' | 'defend' | 'war';

export interface EnemyUnit {
  tile: MapTile;
  unit: Unit;
}

export interface VillageDanger {
  village: MapTile;
  /** Smallest number of enemy turns before an enemy can occupy the village. */
  enemyTurns: number;
}

export interface FreeVillageTarget {
  village: MapTile;
  distance: number;
}

export interface NavalEnemy {
  tile: MapTile;
  unit: Unit;
  distance: number;
}

/** A unit that fights from water: a pirate or any unit currently on a ship. */
export function isNavalEnemy(unit: Unit): boolean {
  return unit.type === 'pirate' || unit.shipLevel !== undefined;
}

/** Farthest range from which a naval enemy can hit a tile this turn. */
function navalStrikeRange(unit: Unit): number {
  return isShip(unit) ? shipAttackDistance(unit) : UNIT_ATTACK_DISTANCE[unit.type];
}

/** True when a tile lies within the attack range of any listed naval enemy
 *  (terrain-ignoring). Used to keep fresh spawns and land units out of a
 *  pirate's reach. */
export function navalCanStrikeTile(tile: MapTile, navalEnemies: NavalEnemy[]): boolean {
  return navalEnemies.some((e) => hexDistance(tile, e.tile) <= navalStrikeRange(e.unit));
}

/** True when `tile` is a land tile bordering water that a naval enemy in
 *  `navalEnemies` can currently hit with an attack. */
export function coastExposedTile(map: GameMap, tile: MapTile, navalEnemies: NavalEnemy[]): boolean {
  if (isWaterType(tile.terrain)) return false;
  const isCoast = hexNeighbors(tile).some((n) => {
    const nt = map.tiles.find((t) => t.q === n.q && t.r === n.r);
    return nt !== undefined && isWaterType(nt.terrain);
  });
  if (!isCoast) return false;
  return navalCanStrikeTile(tile, navalEnemies);
}

function nearestOwnNavalTarget(map: GameMap, playerIndex: number, from: MapTile): number {
  let best = Infinity;
  for (const t of map.tiles) {
    const ownUnit = t.unit !== null && t.unit.owner === playerIndex;
    const ownSettlement = t.settlement !== null && t.settlement.owner === playerIndex;
    const ownPort = t.building !== null && t.building.kind === 'port' && t.ownedBy === playerIndex;
    if (ownUnit || ownSettlement || ownPort) {
      const d = hexDistance(from, t);
      if (d < best) best = d;
    }
  }
  return best;
}

function collectNavalThreats(map: GameMap, playerIndex: number, enemies: EnemyUnit[], radius: number): NavalEnemy[] {
  const out: NavalEnemy[] = [];
  for (const e of enemies) {
    if (!isNavalEnemy(e.unit)) continue;
    const distance = nearestOwnNavalTarget(map, playerIndex, e.tile);
    if (distance <= radius) out.push({ tile: e.tile, unit: e.unit, distance });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

export interface AiSituation {
  stance: AiStance;
  enemies: EnemyUnit[];
  /** Empty own villages reachable within the guard window. */
  dangers: VillageDanger[];
  endangered: boolean;
  frontTarget: MapTile | null;
  freeVillages: FreeVillageTarget[];
  huntTarget: MapTile | null;
  ownPower: number;
  enemyPower: number;
  navalThreat: boolean;
  navalEnemies: NavalEnemy[];
  nearestNaval: NavalEnemy | null;
}

const MELEE_TYPES = new Set<UnitType>(['warrior', 'rider', 'swordsman', 'shield', 'knight']);

export function isMelee(unit: Unit): boolean {
  return MELEE_TYPES.has(unit.type);
}

export function movementOf(unit: Unit): number {
  return unit.shipLevel !== undefined ? shipMovement(unit) : UNIT_MOVEMENT[unit.type];
}

export function turnsToOccupy(from: MapTile, to: MapTile, mover: Unit): number {
  return Math.max(1, Math.ceil(hexDistance(from, to) / movementOf(mover)));
}

export function visibleEnemies(map: GameMap, playerIndex: number): EnemyUnit[] {
  const out: EnemyUnit[] = [];
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === playerIndex) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    out.push({ tile: t, unit: t.unit });
  }
  return out;
}

function enemyPower(map: GameMap, playerIndex: number): number {
  let total = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === playerIndex || !isExploredFor(t, playerIndex)) continue;
    total += attackDamage(t.unit);
  }
  return total;
}

function ownPower(map: GameMap, playerIndex: number): number {
  let total = 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner !== playerIndex) continue;
    total += attackDamage(t.unit);
  }
  return total;
}

function ownUnitCount(map: GameMap, playerIndex: number): number {
  let n = 0;
  for (const t of map.tiles) if (t.unit && t.unit.owner === playerIndex) n += 1;
  return n;
}

function ownVillageDangers(map: GameMap, playerIndex: number, enemies: EnemyUnit[], guardWindow: number): VillageDanger[] {
  const dangers: VillageDanger[] = [];
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== playerIndex) continue;
    if (t.unit && t.unit.owner === playerIndex) continue;
    let minTurns = Infinity;
    for (const e of enemies) {
      if (e.unit.owner < 0) continue; // pirates do not capture villages
      const turns = turnsToOccupy(e.tile, t, e.unit);
      if (turns < minTurns) minTurns = turns;
    }
    if (minTurns <= guardWindow) dangers.push({ village: t, enemyTurns: minTurns });
  }
  return dangers;
}

function nearestEnemyVillage(map: GameMap, playerIndex: number): MapTile | null {
  let best: MapTile | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === playerIndex || t.settlement.owner === null) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    let dist = hexDistance({ q: 0, r: 0 }, t);
    for (const u of map.tiles) {
      if (u.unit && u.unit.owner === playerIndex) {
        const d = hexDistance(u, t);
        if (d < dist) dist = d;
      }
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

function freeVillages(map: GameMap, playerIndex: number): FreeVillageTarget[] {
  const out: FreeVillageTarget[] = [];
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== null) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    let minDist = Infinity;
    for (const u of map.tiles) {
      if (!u.unit || u.unit.owner !== playerIndex) continue;
      const d = hexDistance(u, t);
      if (d < minDist) minDist = d;
    }
    out.push({ village: t, distance: minDist });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

export function analyzeSituation(
  map: GameMap,
  player: Player,
  mode: GameMode,
  profile: AiDifficultyProfile,
): AiSituation {
  const enemies = visibleEnemies(map, player.index);
  const dangers = ownVillageDangers(map, player.index, enemies, profile.guardWindow);
  const endangered = dangers.length > 0;
  const enemyOnOwnVillage = enemies.some(
    (e) => e.tile.settlement && e.tile.settlement.owner === player.index,
  );

  const pow = ownPower(map, player.index);
  const epow = enemyPower(map, player.index);
  const enemyVillage = nearestEnemyVillage(map, player.index);
  const units = ownUnitCount(map, player.index);

  let stance: AiStance = 'settle';
  if (enemyOnOwnVillage || endangered) {
    stance = 'defend';
  } else if (mode === 'capture' && enemyVillage && units >= 3 && pow >= epow * profile.warRatio) {
    stance = 'war';
  }

  let huntTarget: MapTile | null = null;
  let bestHuntDist = Infinity;
  for (const u of map.tiles) {
    if (!u.unit || u.unit.owner !== player.index) continue;
    for (const e of enemies) {
      const d = hexDistance(u, e.tile);
      if (d < bestHuntDist) {
        bestHuntDist = d;
        huntTarget = e.tile;
      }
    }
  }

  const navalEnemies = collectNavalThreats(map, player.index, enemies, profile.navalThreatRadius);
  const navalThreat = navalEnemies.length > 0;
  const nearestNaval = navalEnemies[0] ?? null;

  return {
    stance,
    enemies,
    dangers,
    endangered,
    frontTarget: stance === 'war' ? enemyVillage : null,
    freeVillages: freeVillages(map, player.index),
    huntTarget,
    ownPower: pow,
    enemyPower: epow,
    navalThreat,
    navalEnemies,
    nearestNaval,
  };
}
