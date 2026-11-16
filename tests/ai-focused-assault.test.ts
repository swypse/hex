import { AiActionType, AiOperationPhase, UnitType } from '@enums';
import { describe, expect, it } from 'vitest';
import { assaultFailing, assaultFeasible, needsReinforcement } from '../src/game/ai/military/assault-outlook';
import { FOCUSED_ASSAULT_PATTERN } from '../src/game/ai/patterns/offense/focused-assault';
import type { AiOperation } from '../src/game/ai/types/operation';
import type { AiPlannerState } from '../src/game/ai/types/planner-state';
import type { Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

const AI = 1;

function aiPlayer(): Player {
  return { index: AI, tribe: Tribe.Villagers, isHuman: false, name: 'AI', resources: { wood: 0, stone: 0, money: 0, ore: 0, food: 20 }, score: 0, kills: 0, skills: [], isActive: true, aiFlags: { focusAssault: true } } as Player;
}

function freshState(): AiPlannerState {
  return { moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(), built: new Set(), opened: new Set(), occupied: new Set() };
}

describe('assault outlook', () => {
  it('aborts only when defenders exceed 1.5x the squad', () => {
    expect(assaultFailing(100, 150)).toBe(false);
    expect(assaultFailing(100, 151)).toBe(true);
  });
  it('is feasible when the squad outguns the defenders', () => {
    expect(assaultFeasible(100, 100)).toBe(true);
    expect(assaultFeasible(100, 101)).toBe(false);
  });
  it('wants reinforcements without a 2x advantage over a defended target', () => {
    expect(needsReinforcement(150, 100)).toBe(true);
    expect(needsReinforcement(200, 100)).toBe(false);
    expect(needsReinforcement(10, 0)).toBe(false);
  });
});

describe('focused-assault pattern', () => {
  function scene(committed: boolean) {
    const map = makeTestMap(6);
    for (const t of map.tiles) t.exploredBy = [0, AI];
    const v = tileAt(map, 0, 0)!;
    v.settlement = { owner: 0, level: 1, captureReady: false };
    v.ownedBy = 0;
    v.unit = makeUnit('def', 0, UnitType.WARRIOR, 0, 0);
    for (const [i, [q, r]] of [[1, 0], [0, 1], [-1, 1]].entries()) tileAt(map, q!, r!)!.unit = makeUnit(`a${i}`, AI, UnitType.WARRIOR, q!, r!);
    const op: AiOperation = { target: { q: 0, r: 0 }, rally: { q: 2, r: 0 }, phase: AiOperationPhase.ASSAULT, startTurn: 0, leash: false, committed, reinforce: false };
    return { map, op };
  }

  it('focus-fires the village defender when committed', () => {
    const { map, op } = scene(true);
    const actions = FOCUSED_ASSAULT_PATTERN.evaluate({ map, player: aiPlayer(), rng: undefined as never, state: freshState(), operation: op });
    expect(actions?.some((a) => a.type === AiActionType.ATTACK && a.q === 0 && a.r === 0)).toBe(true);
  });

  it('does nothing when not committed', () => {
    const { map, op } = scene(false);
    expect(FOCUSED_ASSAULT_PATTERN.evaluate({ map, player: aiPlayer(), rng: undefined as never, state: freshState(), operation: op })).toBeNull();
  });
});
