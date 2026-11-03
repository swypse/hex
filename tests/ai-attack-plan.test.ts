import { describe, expect, it } from 'vitest';
import { AiActionType, UnitType } from '@enums';
import { planGangAttack } from '../src/game/ai/ai-attack-plan';
import { ENTER_VILLAGE_PATTERN } from '../src/game/ai/ai-enter-village';
import { attackersForTile } from '../src/game/ai/ai-pattern-helpers';
import { type AiPlannerState } from '../src/game/ai/ai-types';
import { type GameMap } from '../src/game/map/map-gen';
import { type Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

const AI = 1;

function aiPlayer(): Player {
  return {
    index: AI, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 0, stone: 0, money: 0, ore: 0, food: 20 },
    score: 0, kills: 0, skills: [], isActive: true,
  } as Player;
}

function freshState(): AiPlannerState {
  return {
    moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(),
    built: new Set(), opened: new Set(), occupied: new Set(),
  };
}

function put(map: GameMap, owner: number, type: UnitType, q: number, r: number, hp?: number) {
  const u = makeUnit(`${type}-${owner}-${q},${r}`, owner, type, q, r);
  if (hp !== undefined) u.hp = hp;
  tileAt(map, q, r)!.unit = u;
  return u;
}

function scene(): GameMap {
  const map = makeTestMap(6);
  for (const t of map.tiles) t.exploredBy = [0, AI];
  return map;
}

function plan(map: GameMap, target = tileAt(map, 0, 0)!) {
  const state = freshState();
  const player = aiPlayer();
  const attackers = attackersForTile(map, player, target, state);
  return { state, actions: planGangAttack(map, player, target, attackers, state) };
}

describe('planGangAttack', () => {
  it('strikes with the archer before the melee unit', () => {
    const map = scene();
    put(map, 0, UnitType.WARRIOR, 0, 0);
    const warrior = put(map, AI, UnitType.WARRIOR, 1, 0);
    const archer = put(map, AI, UnitType.ARCHER, 0, 2);
    const { actions } = plan(map);
    const order = actions.filter((a) => a.type === AiActionType.ATTACK).map((a) => (a as { unitId: string }).unitId);
    expect(order.indexOf(archer.id)).toBeLessThan(order.indexOf(warrior.id));
  });

  it('leaves surplus units free once the kill is covered', () => {
    const map = scene();
    put(map, 0, UnitType.WARRIOR, 0, 0, 3);
    put(map, AI, UnitType.WARRIOR, 1, 0);
    put(map, AI, UnitType.WARRIOR, -1, 0);
    put(map, AI, UnitType.WARRIOR, 0, 1);
    const { actions } = plan(map);
    expect(actions.filter((a) => a.type === AiActionType.ATTACK)).toHaveLength(1);
  });

  it('holds one unit back to take an enemy village and moves it in after the kill', () => {
    const map = scene();
    const v = tileAt(map, 0, 0)!;
    v.settlement = { owner: 0, level: 1, captureReady: false };
    v.ownedBy = 0;
    put(map, 0, UnitType.WARRIOR, 0, 0, 3);
    put(map, AI, UnitType.WARRIOR, 1, 0);
    const spare = put(map, AI, UnitType.WARRIOR, 0, 1);
    put(map, AI, UnitType.WARRIOR, -1, 1);
    const { state, actions } = plan(map);
    const attackers = actions.filter((a) => a.type === AiActionType.ATTACK).map((a) => (a as { unitId: string }).unitId);
    expect(state.entry).toHaveLength(1);
    const entrant = state.entry![0]!.unitId;
    expect(attackers).not.toContain(entrant);
    expect(state.moved.has(entrant)).toBe(true);
    // The defender dies: the held unit steps onto the village.
    v.unit = null;
    const step = ENTER_VILLAGE_PATTERN.evaluate({ map, player: aiPlayer(), rng: undefined as never, state });
    expect(step).toEqual([{ type: AiActionType.MOVE, unitId: entrant, q: 0, r: 0 }]);
    expect(spare.id).toBeTruthy();
  });

  it('releases the held unit when the defender survives', () => {
    const map = scene();
    const v = tileAt(map, 0, 0)!;
    v.settlement = { owner: 0, level: 1, captureReady: false };
    put(map, 0, UnitType.WARRIOR, 0, 0, 3);
    put(map, AI, UnitType.WARRIOR, 1, 0);
    put(map, AI, UnitType.WARRIOR, 0, 1);
    put(map, AI, UnitType.WARRIOR, -1, 1);
    const { state } = plan(map);
    const entrant = state.entry![0]!.unitId;
    const step = ENTER_VILLAGE_PATTERN.evaluate({ map, player: aiPlayer(), rng: undefined as never, state });
    expect(step).toBeNull();
    expect(state.moved.has(entrant)).toBe(false);
  });
});
