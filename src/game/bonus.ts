import { axialKey, hexDistance, hexNeighbors } from './hex';
import { GameMap, MapTile } from './mapGen';
import { isLandType, isWaterType } from './tileTypes';
import { SeededRandom } from '../util/random';
import { exploreUnitPath, isExploredFor } from './explore';
import { makeUnit, Unit } from './units';
import { tileAt } from './selection';

export type BonusKind = 'money' | 'resources' | 'villageUpgrade' | 'explorer' | 'skill';

export interface Bonus {
  kind: BonusKind;
  claimer: number | null;
  arrivalTurn: number;
}

export const EXPLORER_MOVES = 25;

export const BONUS_MIN_DIST = 4;
export const START_AREA_DIST = 3;

export function randomBonusKind(rng: () => number): BonusKind {
  const kinds: BonusKind[] = ['money', 'resources', 'villageUpgrade', 'explorer', 'skill'];
  return kinds[Math.floor(rng() * kinds.length)]!;
}

export function placeBonuses(map: GameMap, rng: () => number): void {
  const count = map.spawns.length + 1;
  const placed: { q: number; r: number }[] = [];
  const excluded = new Set<string>();
  for (const spawn of map.spawns) {
    for (const t of map.tiles) {
      if (hexDistance(t, spawn.start) <= START_AREA_DIST) excluded.add(axialKey(t));
    }
  }
  const pool = map.tiles.filter((t) => {
    if (excluded.has(axialKey(t))) return false;
    if (!isLandType(t.terrain)) return false;
    if (t.settlement || t.building || t.bonus) return false;
    return true;
  });
  let guard = 0;
  while (placed.length < count && pool.length > 0 && guard++ < 1000) {
    const candidates = pool.filter((t) =>
      placed.every((p) => hexDistance(t, p) >= BONUS_MIN_DIST),
    );
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(rng() * candidates.length)]!;
    pick.bonus = { kind: randomBonusKind(rng), claimer: null, arrivalTurn: 0 };
    placed.push({ q: pick.q, r: pick.r });
  }
}

export function bonusEligibleFor(map: GameMap, playerIndex: number, turn: number): MapTile[] {
  const out: MapTile[] = [];
  for (const t of map.tiles) {
    const b = t.bonus;
    if (!b) continue;
    if (b.claimer !== playerIndex || b.arrivalTurn >= turn) continue;
    if (!t.unit || t.unit.owner !== playerIndex) continue;
    out.push(t);
  }
  return out;
}

export function findClosestVillage(map: GameMap, from: MapTile, playerIndex: number): MapTile | null {
  let best: MapTile | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== playerIndex) continue;
    const d = hexDistance(t, from);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

export function explorerPath(
  map: GameMap,
  start: MapTile,
  rng: () => number,
  playerIndex = 0,
): { q: number; r: number }[] {
  const path: { q: number; r: number }[] = [];
  const visited = new Set<string>([axialKey(start)]);
  let pos = { q: start.q, r: start.r };
  const DIRS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  for (let i = 0; i < EXPLORER_MOVES; i++) {
    const reachable: MapTile[] = [];
    for (const d of DIRS) {
      const next = tileAt(map, pos.q + d.q, pos.r + d.r);
      if (!next || isWaterType(next.terrain) || next.unit) continue;
      reachable.push(next);
    }
    if (reachable.length === 0) break;
    const fresh = reachable.filter((t) => !visited.has(axialKey(t)));
    let pool: MapTile[];
    if (fresh.length > 0) {
      const unexplored = fresh.filter((t) => !isExploredFor(t, playerIndex));
      pool = unexplored.length > 0 ? unexplored : fresh;
    } else {
      pool = reachable;
    }
    const pick = pool[Math.floor(rng() * pool.length)]!;
    pos = { q: pick.q, r: pick.r };
    visited.add(axialKey(pos));
    path.push(pos);
  }
  return path;
}

export function revealExplorerPath(map: GameMap, start: MapTile, path: { q: number; r: number }[], playerIndex: number): void {
  const unit: Unit = makeUnit(playerIndex, 'warrior', start.q, start.r, { id: '__explorer__' });
  exploreUnitPath(map, [{ q: start.q, r: start.r }, ...path], unit, playerIndex);
}
