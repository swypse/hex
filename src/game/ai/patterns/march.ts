import { AiActionType,SkillId,UnitType } from '@enums';
import { isExploredFor } from '../../map/explore';
import { hexDistance } from '../../map/hex';
import type { GameMap,MapTile } from '../../map/map-gen';
import { isMountainType,isWaterType } from '../../map/tile-types';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { isShip } from '../../units/ship';
import { unitMaxHp } from '../../units/units';
import { flagsFor } from '../config/flags';
import { enemyCanReach,incomingForceAt,isLikelyLethal } from '../situation/enemy-reach';
import { isFrontierTile } from '../situation/frontier';
import { coastExposedTile } from '../situation/naval-threats';
import { reachableCells } from '../situation/reachable-cells';
import { type WalkField,walkDistance,walkDistances } from '../situation/walk-distances';
import type { AiAction } from '../types/action';
import { isSupportUnit } from '../unit-roles/is-support-unit';
import { key } from '../util/tile-key';
import type { AiPatternContext } from './pattern-types';

/** Idle land units below this share of their max hp heal instead of marching. */
const MIN_MARCH_HP = 0.5;

/** A unit with nothing to do this turn: fit land fighter that is not the last
 *  defender of a village an enemy could reach, not already claiming a village. */
function marcher(map: GameMap, player: Player, tile: MapTile, ctx: AiPatternContext): boolean {
  const unit = tile.unit;
  if (!unit || unit.owner !== player.index) return false;
  if (ctx.state.acted.has(unit.id) || ctx.state.moved.has(unit.id)) return false;
  if (isSupportUnit(unit) || unit.type === UnitType.STALKER || unit.type === UnitType.PIRATE || isShip(unit)) return false;
  if (unit.hp < unitMaxHp(unit) * MIN_MARCH_HP) return false;
  if (tile.settlement && tile.settlement.owner !== player.index) return false;
  if (tile.settlement && enemyCanReach(map, tile, player.index)) return false;
  return true;
}

function passableLand(tile: MapTile, canClimb: boolean): boolean {
  if (isWaterType(tile.terrain) && !tile.bridge) return false;
  return canClimb || !isMountainType(tile.terrain);
}

/** Long-range objectives for units the other patterns left idle: walk toward the
 *  nearest unexplored frontier or the nearest village that is not yours (free or
 *  enemy), however many turns away. Without this a unit with nothing reachable
 *  this turn just hovers near its own villages for the whole game. */
export const MARCH_PATTERN = {
  id: 'march-to-objective',
  priority: 69,
  evaluate(ctx: AiPatternContext): AiAction[] | null {
    const { map, player, state, situation } = ctx;
    if (!flagsFor(player).march) return null;
    const idle = map.tiles.filter((t) => marcher(map, player, t, ctx));
    if (idle.length === 0) return null;

    const canClimb = hasSkill(player, SkillId.CLIMBING);
    const frontier = map.tiles.filter((t) => passableLand(t, canClimb) && isFrontierTile(map, t, player.index));
    const targets = map.tiles.filter(
      (t) => t.settlement && t.settlement.owner !== player.index && isExploredFor(t, player.index),
    );
    const frontierField: WalkField | null = frontier.length > 0 ? walkDistances(map, player, frontier) : null;
    const villageField: WalkField | null = targets.length > 0 ? walkDistances(map, player, targets) : null;
    if (!frontierField && !villageField) return null;

    let best: { unitId: string; to: MapTile; gain: number } | null = null;
    for (const t of idle) {
      const unit = t.unit!;
      const fd = frontierField ? walkDistance(frontierField, t) : Infinity;
      const vd = villageField ? walkDistance(villageField, t) : Infinity;
      // Nearest objective wins; a tie goes to the village (capture over scouting).
      const field = vd <= fd ? villageField : frontierField;
      const here = Math.min(vd, fd);
      if (!field || here === Infinity || here === 0) continue;
      for (const c of reachableCells(map, player, unit)) {
        if (state.occupied.has(key(c.q, c.r))) continue;
        if (c.settlement && c.settlement.owner === player.index) continue;
        const there = walkDistance(field, c);
        const gain = here - there;
        if (gain <= 0) continue;
        if (isLikelyLethal(map, c, player.index, unit)) continue;
        if (situation?.navalThreat && unit.type !== UnitType.CATAPULT && coastExposedTile(map, c, situation.navalEnemies)) continue;
        // Most progress first; among equals prefer the quieter tile.
        const score = gain * 10 - incomingForceAt(map, c, player.index) - hexDistance(t, c) * 0.01;
        if (!best || score > best.gain) best = { unitId: unit.id, to: c, gain: score };
      }
    }
    if (!best) return null;
    return [{ type: AiActionType.MOVE, unitId: best.unitId, q: best.to.q, r: best.to.r }];
  },
};
