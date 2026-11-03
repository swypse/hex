import { isExploredFor } from '../map/explore';
import { hexNeighbors } from '../map/hex';
import { type GameMap } from '../map/map-gen';
import { type Player } from '../players';
import { hasSkill } from '../skills';
import { isMountainType, isWaterType } from '../map/tile-types';
import { tileAt } from '../map/tile-index';
import { SkillId } from '@enums';

export type WalkField = Map<string, number>;

function fieldKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Walking distance (in steps) from the nearest of `sources` to every land tile
 *  the player's units could ever walk to: explored land, bridges, and mountains
 *  once Climbing is known. Tiles cut off by water or mountains are absent, so
 *  greedy hex-distance dead ends are avoided. */
export function walkDistances(map: GameMap, player: Player, sources: { q: number; r: number }[]): WalkField {
  const canClimb = hasSkill(player, SkillId.CLIMBING);
  const field: WalkField = new Map(sources.map((s) => [fieldKey(s.q, s.r), 0] as const));
  let frontier = sources;
  for (let d = 1; frontier.length > 0; d++) {
    const next: { q: number; r: number }[] = [];
    for (const cur of frontier) {
      for (const n of hexNeighbors(cur)) {
        const nk = fieldKey(n.q, n.r);
        if (field.has(nk)) continue;
        const tile = tileAt(map, n.q, n.r);
        if (!tile || !isExploredFor(tile, player.index)) continue;
        if (isWaterType(tile.terrain) && !tile.bridge) continue;
        if (!canClimb && isMountainType(tile.terrain)) continue;
        field.set(nk, d);
        next.push({ q: n.q, r: n.r });
      }
    }
    frontier = next;
  }
  return field;
}

export function walkDistance(field: WalkField, t: { q: number; r: number }): number {
  return field.get(fieldKey(t.q, t.r)) ?? Infinity;
}
