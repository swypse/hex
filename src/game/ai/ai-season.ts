import { type GameMap, type MapTile } from '../map/map-gen';
import { willFreeze } from '../map/ice';
import { TileType, isWaterType } from '../map/tile-types';
import { SEASON_LENGTH, seasonForTurn, seasonTurn } from '../season';
import { reachableTargets } from '../units/selection';
import { hasSkill } from '../skills';
import { type Player } from '../players';
import { type Unit } from '../units/units';
import { type AiAction, type AiPlannerState } from './ai-types';
import { type AiPattern, key } from './ai-pattern-helpers';
import { AiActionType, Season, SkillId } from '@enums';

/** Whether `turn` is the last turn of `season` (the season flips right after it). */
function lastTurnOf(turn: number, season: Season): boolean {
  return turn > 0 && seasonForTurn(turn) === season && seasonTurn(turn) === SEASON_LENGTH;
}

/** A tile that turns deadly for `unit` when the current turn ends:
 *  - last winter turn: ice melts and kills whoever stands on it;
 *  - last autumn turn: coast water freezes and turns ships into land units. */
export function seasonUnsafe(map: GameMap, turn: number, tile: MapTile, unit: Unit): boolean {
  if (lastTurnOf(turn, Season.WINTER)) return tile.terrain === TileType.Ice;
  if (lastTurnOf(turn, Season.AUTUMN) && unit.shipLevel !== undefined) {
    return tile.terrain === TileType.Water && willFreeze(map, tile);
  }
  return false;
}

/** Rejects a step that moves a unit onto a tile that is unsafe at season end. */
export function seasonVetoed(map: GameMap, turn: number, step: AiAction[]): boolean {
  for (const a of step) {
    if (a.type !== AiActionType.MOVE) continue;
    const from = map.tiles.find((t) => t.unit?.id === a.unitId);
    const dest = map.tiles.find((t) => t.q === a.q && t.r === a.r);
    if (from?.unit && dest && seasonUnsafe(map, turn, dest, from.unit)) return true;
  }
  return false;
}

/** Moves own units off ice on the last winter turn and ships off coast water
 *  on the last autumn turn. */
export const SEASON_SAFETY_PATTERN: AiPattern = {
  id: 'season-safety',
  priority: 600,
  evaluate({ map, player, state, turn = 0 }): AiAction[] | null {
    if (!lastTurnOf(turn, Season.WINTER) && !lastTurnOf(turn, Season.AUTUMN)) return null;
    for (const t of map.tiles) {
      const unit = t.unit;
      if (!unit || unit.owner !== player.index) continue;
      if (state.moved.has(unit.id) || state.acted.has(unit.id)) continue;
      if (!seasonUnsafe(map, turn, t, unit)) continue;
      const dest = safeStep(map, player, turn, t, unit, state);
      if (dest) return [{ type: AiActionType.MOVE, unitId: unit.id, q: dest.q, r: dest.r }];
    }
    return null;
  },
};

function safeStep(map: GameMap, player: Player, turn: number, from: MapTile, unit: Unit, state: AiPlannerState): MapTile | null {
  const canClimb = hasSkill(player, SkillId.CLIMBING);
  let best: MapTile | null = null;
  let bestDist = Infinity;
  for (const c of reachableTargets(map, unit, undefined, canClimb, true, player.index)) {
    if (state.occupied.has(key(c.q, c.r))) continue;
    if (unit.shipLevel !== undefined && !isWaterType(c.terrain)) continue;
    if (seasonUnsafe(map, turn, c, unit)) continue;
    // Prefer the nearest safe tile: it keeps the unit where it was useful.
    const d = Math.abs(c.q - from.q) + Math.abs(c.r - from.r);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
