import { isExploredFor } from '../../map/explore';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { enemyForceNear } from '../situation/enemy-force-near';
import { walkDistance, walkDistances } from '../situation/walk-distances';

/** Hexes around a village in which visible enemy units count as its garrison. */
const TARGET_GARRISON_RADIUS = 2;

/** Score penalty per point of attack force defending a candidate target. */
const TARGET_GARRISON_WEIGHT = 0.15;

/** Score bonus per village level (higher level pays more). */
const TARGET_LEVEL_BONUS = 2;

/** Score bonus for a free (unowned) village: no garrison, no retaliation. */
const TARGET_FREE_BONUS = 4;

/** The next village to go for: reachable on foot from the player's units and
 *  villages, cheap to walk to, weakly held and valuable (free villages and high
 *  levels preferred). Returns null when nothing explored is reachable. */
export function chooseArmyTarget(map: GameMap, player: Player): { q: number; r: number } | null {
  const sources = map.tiles.filter((t) => (t.unit?.owner === player.index) || (t.settlement?.owner === player.index));
  if (sources.length === 0) return null;
  const field = walkDistances(map, player, sources);
  let best: { q: number; r: number } | null = null;
  let bestScore = -Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === player.index) continue;
    if (t.settlement.owner === null && !isExploredFor(t, player.index)) continue;
    const dist = walkDistance(field, t);
    if (dist === Infinity) continue;
    const score = -dist - enemyForceNear(map, player, t, TARGET_GARRISON_RADIUS) * TARGET_GARRISON_WEIGHT + t.settlement.level * TARGET_LEVEL_BONUS + (t.settlement.owner === null ? TARGET_FREE_BONUS : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { q: t.q, r: t.r };
    }
  }
  return best;
}
