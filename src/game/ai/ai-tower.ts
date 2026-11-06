import { type GameMap, type MapTile } from '../map/map-gen';
import { hexDistance } from '../map/hex';
import { isExploredFor } from '../map/explore';
import { hasSkill } from '../skills';
import { canBuildTower, isTower } from '../economy/buildings';
import { isShip } from '../units/ship';
import type { Player } from '../players';
import type { AiPlannerState } from './ai-types';
import { flagsFor } from './ai-flags';
import { SkillId } from '@enums';

/** Enemy land units within `TOWER_THREAT_RADIUS` of a village that make the AI fortify it. */
export const TOWER_THREAT_UNITS = 3;
const TOWER_THREAT_RADIUS = 4;
/** A tower stands at most this far from the village it protects (its aura reaches one hex further). */
const TOWER_SITE_RADIUS = 2;

interface Threat {
  count: number;
  /** Mean position of the threatening units (fractional axial coordinates). */
  center: { q: number; r: number };
}

/** The visible enemy land units pressing on `village`, or null when too few. */
export function towerThreat(map: GameMap, player: Player, village: MapTile): Threat | null {
  let count = 0;
  let q = 0;
  let r = 0;
  for (const t of map.tiles) {
    const u = t.unit;
    if (!u || u.owner === player.index || u.isStealthed === true || isShip(u)) continue;
    if (!isExploredFor(t, player.index) || hexDistance(village, t) > TOWER_THREAT_RADIUS) continue;
    count++;
    q += t.q;
    r += t.r;
  }
  return count >= TOWER_THREAT_UNITS ? { count, center: { q: q / count, r: r / count } } : null;
}

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

/** The next skill on the way to Tower while some own village is under pressure, or null. */
export function towerSkillWanted(map: GameMap, player: Player): SkillId | null {
  if (!flagsFor(player).towers || hasSkill(player, SkillId.TOWER)) return null;
  const pressed = map.tiles.some((t) => t.settlement?.owner === player.index && towerThreat(map, player, t) !== null);
  if (!pressed) return null;
  if (hasSkill(player, SkillId.DEFENSE)) return SkillId.TOWER;
  return hasSkill(player, SkillId.SHIELDS) ? SkillId.DEFENSE : SkillId.SHIELDS;
}
