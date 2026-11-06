import { AiActionType, AiStance, SpawnPreference } from '@enums';
import { canSustainUnit } from '../../../economy/food';
import { canAffordAt } from '../../../economy/stock';
import { isExploredFor } from '../../../map/explore';
import { hexDistance } from '../../../map/hex';
import type { MapTile } from '../../../map/map-gen';
import { UNIT_TYPES, unitSpawnCost } from '../../../units/units';
import type { AiDifficultyProfile } from '../../config/difficulty';
import { landEnemyCanReach } from '../../situation/enemy-reach';
import { bestSpawnableUnitType } from '../../spawn/best-spawnable-unit-type';
import { spawnWouldBeKilled } from '../../spawn/spawn-would-be-killed';
import type { AiDirectives } from '../../types/directives';
import { key } from '../../util/tile-key';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Hexes from a naval enemy within which an own village prefers shield spawns. */
const NAVAL_VILLAGE_GUARD_RADIUS = 6;

/** Money kept before the AI spends on a spawn: the strategy reserve when a
 *  plan is active, otherwise the difficulty profile's default. */
function directivesReserve(directives: AiDirectives | undefined, difficulty: AiDifficultyProfile | undefined): number {
  if (directives) return directives.moneyReserve;
  return difficulty?.spawnReserve ?? UNIT_TYPES.warrior.price;
}

/** Offers to raise a unit in an empty own village (urgent when an enemy can reach it). */
export function spawnCandidate(ctx: CandidateContext, v: MapTile, candidates: Candidate[]): void {
  const { map, player, state, situation, difficulty, directives, jitter } = ctx;
  const k = key(v.q, v.r);
  if (!state.spawned.has(k) && !v.unit) {
    const threatened = landEnemyCanReach(map, v, player.index);
    const threatenedByNaval =
      situation?.navalEnemies.some((e) => hexDistance(v, e.tile) <= NAVAL_VILLAGE_GUARD_RADIUS) ?? false;
    const urgent = threatened || threatenedByNaval;
    const freeVillageToGrab = map.tiles.some(
      (t) =>
        t.settlement &&
        t.settlement.owner === null &&
        isExploredFor(t, player.index) &&
        !state.occupied.has(key(t.q, t.r)),
    );
    const planFor = directives?.spawnPlan.find((p) => p.villageKey === k);
    const prefer =
      planFor
        ? planFor.prefer
        : urgent || situation?.stance === AiStance.DEFEND
          ? SpawnPreference.DEFENSE
          : situation?.navalThreat
            ? SpawnPreference.NAVAL
            : situation?.stance === AiStance.SETTLE && freeVillageToGrab
              ? SpawnPreference.SCOUT
              : SpawnPreference.OFFENSE;
    // Never raise a unit the enemies in reach would kill before it acts.
    const type = bestSpawnableUnitType(player, prefer, map, v, (ty) => !spawnWouldBeKilled(map, v, player.index, ty));
    if (type) {
      const cost = unitSpawnCost(type);
      if (canAffordAt(map, player, v, cost)) {
        const afterMoney = player.resources.money - cost.money;
        // An economy goal keeps money in reserve for mines/skills, but a
        // free-village grab is expansion income and always worth the spend.
        const reserveOk = urgent || freeVillageToGrab || afterMoney >= directivesReserve(directives, difficulty);
        // A unit the food stock cannot carry would only starve: hold back
        // unless the village itself is in danger.
        const foodOk = urgent || canSustainUnit(map, player, type, 6, v);
        if (reserveOk && foodOk) {
          candidates.push({ score: (urgent ? 500 : 250) + jitter(), action: { type: AiActionType.SPAWN, q: v.q, r: v.r, unitType: type } });
        }
      }
    }
  }
}
