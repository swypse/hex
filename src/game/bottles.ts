import { GameMap, MapTile } from './mapGen';
import { isWaterType } from './tileTypes';
import { hasBridge } from './bridges';
import { isShip } from './ship';
import { canMove, canAttack } from './units';

export const BOTTLE_SPAWN_TURNS = 2;
export const BOTTLE_SPAWN_PROBABILITY = 0.2;
export const BOTTLE_LIFETIME_TURNS = 5;
export const BOTTLE_MONEY = 50;
export const BOTTLE_HEAL = 20;

/** What a collected bottle turns out to hold. */
export type BottleEffect = 'money' | 'skill' | 'heal';

/** Picks a random bottle effect with equal chances. */
export function randomBottleEffectKind(rng: () => number): BottleEffect {
  const d = rng();
  if (d < 1 / 3) return 'money';
  if (d < 2 / 3) return 'skill';
  return 'heal';
}

/** Free non-owned water hexes where a bottle may float: water terrain, not
 *  owned, no construction, bridge, unit, or another bottle. */
export function spawnCandidates(map: GameMap): MapTile[] {
  return map.tiles.filter((t) => {
    if (!isWaterType(t.terrain)) return false;
    if (t.ownedBy !== null && t.ownedBy !== undefined) return false;
    if (t.settlement || t.building) return false;
    if (hasBridge(t)) return false;
    if (t.unit) return false;
    if (t.bottle) return false;
    return true;
  });
}

/** Each turn a multiple of `BOTTLE_SPAWN_TURNS`, a bottle may float in with
 *  probability `BOTTLE_SPAWN_PROBABILITY` on a random free non-owned water
 *  hex. Several bottles can coexist. */
export function trySpawnBottle(map: GameMap, turn: number, rng: () => number): boolean {
  if (turn % BOTTLE_SPAWN_TURNS !== 0) return false;
  if (rng() >= BOTTLE_SPAWN_PROBABILITY) return false;
  const candidates = spawnCandidates(map);
  if (candidates.length === 0) return false;
  const spot = candidates[Math.floor(rng() * candidates.length)]!;
  spot.bottle = { bornTurn: turn, arrivalTurn: 0 };
  return true;
}

/** Removes bottles that have lived longer than `BOTTLE_LIFETIME_TURNS` and
 *  returns the tiles they floated away from. */
export function collectExpiredBottles(map: GameMap, turn: number): MapTile[] {
  const gone: MapTile[] = [];
  for (const t of map.tiles) {
    if (!t.bottle) continue;
    if (turn - t.bottle.bornTurn <= BOTTLE_LIFETIME_TURNS) continue;
    gone.push(t);
    delete (t as Partial<MapTile>).bottle;
  }
  return gone;
}

/** Marks that a ship has reached the bottle on this turn. */
export function touchBottle(tile: MapTile, turn: number): void {
  if (tile.bottle) tile.bottle.arrivalTurn = turn;
}

/** Bottles the given player may collect: a ship of theirs stands on the tile,
 *  it is the turn after the ship arrived, and the ship still has an action. */
export function bottleCollectableFor(map: GameMap, playerIndex: number, turn: number): MapTile[] {
  const out: MapTile[] = [];
  for (const t of map.tiles) {
    const bottle = t.bottle;
    if (!bottle) continue;
    const unit = t.unit;
    if (!unit || unit.owner !== playerIndex || !isShip(unit)) continue;
    if (turn <= bottle.arrivalTurn) continue;
    if (!canMove(unit) && !canAttack(unit)) continue;
    out.push(t);
  }
  return out;
}
