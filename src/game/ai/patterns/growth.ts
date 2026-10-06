import { type MapTile } from '../../map/map-gen';
import { villageUpgradeCost } from '../../economy/resources';
import { canAffordAt } from '../../economy/stock';
import { isMountainType } from '../../map/tile-types';
import { hasSkill } from '../../skills';
import { reachableTargets } from '../../units/selection';
import { unitSpawnCost, type Unit } from '../../units/units';
import { hexDistance, hexNeighbors } from '../../map/hex';
import { canBuildSawmill, canBuildMine, BUILDING_COSTS } from '../../economy/buildings';
import { isExploredFor } from '../../map/explore';
import { type AiAction } from '../ai-types';
import { coastExposedTile } from '../ai-situation';
import { isShip } from '../../units/ship';
import { TRIBE_SPECIAL_UNIT } from '../../tribes';
import { stormTargetShips } from '../../units/storm';
import { flagsFor } from '../ai-flags';
import { eatsFarmMaterials } from '../../economy/food';
import { AiActionType, BuildingKind, SkillId, UnitType } from '@enums';
import { tileAt } from '../../map/tile-index';

import { type AiPattern, enemyCanReach, friendlyUnitsWithin, isFrontierTile, isLikelyLethal, isSupportUnit, key, nearestEnemyDistanceFrom, specialUnitWanted } from '../ai-pattern-helpers';

export const GROWTH_PATTERNS: AiPattern[] = [
  {
    id: 'explore-frontier',
    priority: 70,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      let best: { unit: Unit; target: MapTile } | null = null;
      let bestScore = -Infinity;
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        // Support units stay on their jobs (build/trap/buff), not scouting.
        if (isSupportUnit(unit)) continue;
        if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
        for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          // Don't explore into a beach a naval enemy can hit with land units
          // that cannot fight back (catapults and ships are the naval answer).
          if (situation?.navalThreat && !isShip(unit) && unit.type !== UnitType.CATAPULT && coastExposedTile(map, c, situation.navalEnemies)) continue;
          // Don't walk a scout into a spot where the enemy's combined reach is
          // likely lethal: a stalled scout beats a dead one.
          if (isLikelyLethal(map, c, player.index, unit)) continue;
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
      if (best) return [{ type: AiActionType.MOVE, unitId: best.unit.id, q: best.target.q, r: best.target.r }];
      return null;
    },
  },
  {
    id: 'spawn-special-unit',
    priority: 65,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      // Each tribe fields its special unit when it is actually useful (naval
      // stormcaller, mine-locked builder, scout stalker, etc.); a second copy
      // is only spawned after the first one dies.
      const special = TRIBE_SPECIAL_UNIT[player.tribe];
      if (!special) return null;
      const fielded = map.tiles.filter((t) => t.unit && t.unit.owner === player.index && t.unit.type === special).length;
      const cap = flagsFor(player).multiSpecial && (special === UnitType.BERSERKER || special === UnitType.STUNNER)
        ? Math.max(1, Math.floor(map.tiles.filter((t) => t.unit && t.unit.owner === player.index && !isSupportUnit(t.unit)).length / 3))
        : 1;
      if (fielded >= cap) return null;
      if (!specialUnitWanted(map, player, situation)) return null;
      const cost = unitSpawnCost(special);
      // Pick the village that puts the special unit where it works: the banner
      // next to the army cluster, the builder beside an unbuilt mine, everyone
      // else on the front line.
      let best: MapTile | null = null;
      let bestScore = -Infinity;
      const mineDist = (v: MapTile): number => {
        let d = Infinity;
        for (const t of map.tiles) {
          if (t.ownedBy !== player.index || t.building || t.settlement) continue;
          if (!isMountainType(t.terrain)) continue;
          d = Math.min(d, hexDistance(v, t));
        }
        return d;
      };
        for (const v of map.tiles) {
          if (!v.settlement || v.settlement.owner !== player.index) continue;
          if (v.unit) continue;
          if (!canAffordAt(map, player, v, cost)) continue;
          const k = key(v.q, v.r);
          if (state.spawned.has(k) || state.occupied.has(k)) continue;
          const enemyDist = nearestEnemyDistanceFrom(map, player.index, v);
          const score =
            special === UnitType.BANNER
              ? friendlyUnitsWithin(map, player.index, v, 3) * 100
              : special === UnitType.BUILDER
                ? -mineDist(v)
                : Number.isFinite(enemyDist)
                  ? -enemyDist
                  : 0;
          if (score > bestScore) {
            bestScore = score;
            best = v;
          }
        }
      if (!best) return null;
      return [{ type: AiActionType.SPAWN, q: best.q, r: best.r, unitType: special }];
    },
  },
  {
    id: 'economy-opening',
    priority: 25,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      // Naval threats take priority: save the money for the naval response.
      if (situation?.navalThreat) return null;
      const ownUnits = map.tiles.filter((t) => t.unit && t.unit.owner === player.index).length;
      if (ownUnits > 4) return null;
      for (const t of map.tiles) {
        if (!t.settlement || t.settlement.owner !== player.index) continue;
        const k = key(t.q, t.r);
        if (state.upgraded.has(k)) continue;
        if (!canAffordAt(map, player, t, villageUpgradeCost(t.settlement.level))) continue;
        if (eatsFarmMaterials(map, player, villageUpgradeCost(t.settlement.level), t)) continue;
        const front = nearestEnemyDistanceFrom(map, player.index, t) <= 4;
        if (front || ownUnits <= 2) return [{ type: AiActionType.UPGRADE, q: t.q, r: t.r }];
      }
      for (const tile of map.tiles) {
        if (tile.ownedBy !== player.index) continue;
        if (state.built.has(key(tile.q, tile.r))) continue;
        if (canBuildMine(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.mine)) {
          return [{ type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.MINE }];
        }
        if (canBuildSawmill(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.sawmill)) {
          return [{ type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.SAWMILL }];
        }
      }
      return null;
    },
  },
  {
    id: 'special-unit-abilities',
    priority: 20,
    evaluate({ map, player }): AiAction[] | null {
      // Storm when enemy or pirate ships sit on a stormcaller's village waters.
      // Stalker stealth and stunner stun have their own higher-priority
      // patterns (stalker-restealth, stunner-prefer-stun).
      for (const t of map.tiles) {
        const u = t.unit;
        if (!u || u.owner !== player.index) continue;
        const idle = !u.hasMoved && !u.hasAttacked && !u.hasHealed;
        if (u.type === UnitType.STORMCALLER && idle && stormTargetShips(map, u).length > 0) {
          return [{ type: AiActionType.STORM, unitId: u.id }];
        }
      }
      return null;
    },
  },
];
