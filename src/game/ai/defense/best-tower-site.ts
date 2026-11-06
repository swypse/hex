import { canBuildTower, isTower } from '../../economy/buildings';
import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { flagsFor } from '../config/flags';
import type { AiPlannerState } from '../types/planner-state';
import { type Threat, towerThreat } from './tower-threat';

/** A tower stands at most this far from the village it protects (its aura reaches one hex further). */
const TOWER_SITE_RADIUS = 2;

/** An own tower already guards the village. */
function hasTowerNear(map: GameMap, player: Player, village: MapTile): boolean {
  return map.tiles.some((t) => isTower(t.building) && t.ownedBy === player.index && hexDistance(village, t) <= TOWER_SITE_RADIUS + 1);
}

/** The tower site between the enemies and the village, closer to the enemies, or null. */
export function bestTowerSite(map: GameMap, player: Player, village: MapTile, state: AiPlannerState): { tile: MapTile; threat: Threat } | null {
  if (!flagsFor(player).towers || hasTowerNear(map, player, village)) return null;
  const threat = towerThreat(map, player, village);
  if (!threat) return null;
  const villageDist = hexDistance(village, threat.center);
  let best: MapTile | null = null;
  let bestScore = Infinity;
  for (const t of map.tiles) {
    const d = hexDistance(village, t);
    if (d < 1 || d > TOWER_SITE_RADIUS) continue;
    if (state.built.has(`${t.q},${t.r}`) || (t.unit && t.unit.owner !== player.index)) continue;
    if (!canBuildTower(map, t, player)) continue;
    const enemyDist = hexDistance(t, threat.center);
    if (enemyDist >= villageDist) continue;
    // Closest to the enemies, then nearest the village so its aura still covers it.
    const score = enemyDist * 10 + d;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best ? { tile: best, threat } : null;
}
