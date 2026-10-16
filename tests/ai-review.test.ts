import { describe, expect, it } from 'vitest';
import { AiActionType, UnitType } from '@enums';
import { stepVetoed } from '../src/game/ai/ai-review';
import { AI_DIFFICULTY_PROFILES } from '../src/game/ai/ai-difficulty';
import { type AiPlannerState } from '../src/game/ai/ai-types';
import { type GameMap } from '../src/game/map/map-gen';
import { type Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

const AI = 1;

function aiPlayer(): Player {
  return {
    index: AI, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 20, stone: 20, money: 100, ore: 10, food: 20 },
    score: 0, kills: 0, skills: [], isActive: true,
  } as Player;
}

function freshState(): AiPlannerState {
  return {
    moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(),
    built: new Set(), opened: new Set(), occupied: new Set(),
  };
}

function put(map: GameMap, owner: number, type: UnitType, q: number, r: number) {
  const u = makeUnit(`${type}-${owner}-${q},${r}`, owner, type, q, r);
  tileAt(map, q, r)!.unit = u;
  return u;
}

function scene(): GameMap {
  const map = makeTestMap(6);
  const v = tileAt(map, 0, 0)!;
  v.settlement = { owner: AI, level: 1, captureReady: false, capital: true };
  v.ownedBy = AI;
  for (const t of map.tiles) t.exploredBy = [0, AI];
  return map;
}

describe('stepVetoed', () => {
  it('rejects a garrison leaving its village while an enemy can reach it', () => {
    const map = scene();
    const w = put(map, AI, UnitType.WARRIOR, 0, 0);
    put(map, 0, UnitType.KNIGHT, 3, 0);
    const step = [{ type: AiActionType.MOVE, unitId: w.id, q: -1, r: 0 } as const];
    expect(stepVetoed(map, aiPlayer(), [...step], freshState())).toBe(true);
  });

  it('allows leaving when the same step raises a new defender', () => {
    const map = scene();
    const w = put(map, AI, UnitType.WARRIOR, 0, 0);
    put(map, 0, UnitType.KNIGHT, 3, 0);
    const step = [
      { type: AiActionType.MOVE, unitId: w.id, q: -1, r: 0 },
      { type: AiActionType.SPAWN, q: 0, r: 0, unitType: UnitType.SHIELD },
    ] as const;
    expect(stepVetoed(map, aiPlayer(), [...step], freshState())).toBe(false);
  });

  it('allows leaving a village no enemy can reach', () => {
    const map = scene();
    const w = put(map, AI, UnitType.WARRIOR, 0, 0);
    expect(stepVetoed(map, aiPlayer(), [{ type: AiActionType.MOVE, unitId: w.id, q: -1, r: 0 }], freshState())).toBe(false);
  });

  it('rejects a plain move from a safe tile onto a lethal one', () => {
    const map = scene();
    const w = put(map, AI, UnitType.WARRIOR, -3, 0);
    for (const [q, r] of [[0, -1], [1, -1], [1, 0]] as const) put(map, 0, UnitType.KNIGHT, q + 2, r);
    const lethal = { type: AiActionType.MOVE, unitId: w.id, q: -1, r: 0 } as const;
    expect(stepVetoed(map, aiPlayer(), [lethal], freshState())).toBe(true);
    // The same destination is fine when the unit attacks from there.
    expect(stepVetoed(map, aiPlayer(), [lethal, { type: AiActionType.ATTACK, unitId: w.id, q: 1, r: 0 }], freshState())).toBe(false);
  });

  it('only hard difficulty reviews steps', () => {
    expect(AI_DIFFICULTY_PROFILES.hard.lookahead).toBe(true);
    expect(AI_DIFFICULTY_PROFILES.normal.lookahead).toBe(false);
    expect(AI_DIFFICULTY_PROFILES.easy.lookahead).toBe(false);
  });
});
