/**
 * Scripted adversarial opponent for the AI benchmark: spends everything on fast
 * melee units and sends them at the nearest enemy village, preferring empty
 * ones, ignoring its own defense. Unlike the symmetric AI it punishes empty or
 * under-garrisoned villages, so village-defense and economy changes can be
 * measured against it (`RAIDER=1 npx vite-node tools/ai-bench.ts`).
 */
import { CommandType, UnitType } from '@enums';
import type { Simulator } from '../src/game/simulator';
import type { MapTile } from '../src/game/map/map-gen';
import { hexDistance } from '../src/game/map/hex';
import { reachableTargets } from '../src/game/units/selection';
import { villageCapacity } from '../src/game/economy/village';
import { canSpawnType } from '../src/game/units/spawn';
import { walkDistances, walkDistance } from '../src/game/ai/ai-walk';
import { hasSkill } from '../src/game/skills';
import { SkillId } from '@enums';

/** Units the raider gathers before it marches out. */
const RAID_SQUAD = 4;
const SPAWN_ORDER = [UnitType.KNIGHT, UnitType.RIDER, UnitType.SWORDSMAN, UnitType.WARRIOR];

interface SimInternals {
  markCaptureReadyFor(i: number): void;
  decrementStunsFor(i: number): void;
}

export function runRaiderTurn(sim: Simulator, playerIndex: number): void {
  const { map, players } = sim;
  const me = players[playerIndex]!;
  const internals = sim as unknown as SimInternals;
  internals.markCaptureReadyFor(playerIndex);
  internals.decrementStunsFor(playerIndex);
  sim.currentPlayerIndex = playerIndex;

  const targets = (): MapTile[] => map.tiles.filter((t) => t.settlement && t.settlement.owner !== playerIndex);
  // Mass first: the squad advances once it has RAID_SQUAD units, so single raiders are not thrown away.
  const army = map.tiles.filter((t) => t.unit?.owner === playerIndex).length;
  const advance = army >= Math.min(RAID_SQUAD, villageCapacity(Math.max(1, ...map.tiles.filter((t) => t.settlement?.owner === playerIndex).map((t) => t.settlement!.level))));
  for (const unit of map.tiles.flatMap((t) => (t.unit && t.unit.owner === playerIndex ? [t.unit] : []))) {
    if (unit.hasMoved && unit.hasAttacked) continue;
    const here = map.tiles.find((t) => t.unit === unit)!;
    if (here.settlement && here.settlement.owner !== playerIndex && sim.applyCommand({ type: CommandType.CAPTURE, q: here.q, r: here.r, unitId: unit.id })) continue;
    const goals = targets();
    if (goals.length === 0) continue;
    if (!advance) {
      // Gathering: step off the village so it can spawn the next unit.
      if (here.settlement?.owner === playerIndex) {
        const step = reachableTargets(map, unit, undefined, false, false, playerIndex).find((t) => !t.unit && hexDistance(t, here) <= 2);
        if (step) sim.applyCommand({ type: CommandType.MOVE, unitId: unit.id, q: step.q, r: step.r });
      }
      continue;
    }
    // Empty villages first; among equals the nearest by hex distance.
    const empty = goals.filter((g) => !g.unit);
    const pool = empty.length > 0 ? empty : goals;
    const nearest = pool.reduce((a, b) => (hexDistance(here, b) < hexDistance(here, a) ? b : a));
    const field = walkDistances(map, me, [nearest]);
    const reach = reachableTargets(map, unit, undefined, hasSkill(me, SkillId.CLIMBING), false, playerIndex).filter((t) => !t.unit);
    // Walk distance through explored land; unexplored ground falls back to straight-line distance.
    const cost = (t: MapTile): number => (walkDistance(field, t) === Infinity ? 1000 + hexDistance(t, nearest) : walkDistance(field, t));
    const best = reach.reduce<MapTile | null>((a, b) => (a === null || cost(b) < cost(a) ? b : a), null);
    if (best && cost(best) < cost(here)) sim.applyCommand({ type: CommandType.MOVE, unitId: unit.id, q: best.q, r: best.r });
    // Hit a defender standing next to the village when the strike is free.
    const moved = map.tiles.find((t) => t.unit === unit);
    const foe = moved && map.tiles.find((t) => t.unit && t.unit.owner !== playerIndex && t.unit.owner >= 0 && hexDistance(moved, t) <= (unit.attackDistance ?? 1));
    if (foe && !unit.hasAttacked) sim.applyCommand({ type: CommandType.ATTACK, unitId: unit.id, q: foe.q, r: foe.r });
    const after = map.tiles.find((t) => t.unit === unit);
    if (after?.settlement && after.settlement.owner !== playerIndex) sim.applyCommand({ type: CommandType.CAPTURE, q: after.q, r: after.r, unitId: unit.id });
  }

  const spawnVillages = map.tiles.filter((t) => t.settlement?.owner === playerIndex);
  // Cash that cannot buy a unit (village full) goes into upgrades, which raise the unit cap.
  for (const v of spawnVillages) sim.applyCommand({ type: CommandType.UPGRADE_VILLAGE, q: v.q, r: v.r });
  for (const v of spawnVillages) {
    const type = SPAWN_ORDER.find((u) => canSpawnType(map, v, u, me));
    if (type) sim.applyCommand({ type: CommandType.SPAWN, q: v.q, r: v.r, unitType: type });
  }
}
