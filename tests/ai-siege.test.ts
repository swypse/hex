import { describe, expect, it } from 'vitest';
import { AiActionType, UnitType } from '@enums';
import { SIEGE_PATTERN } from '../src/game/ai/patterns/siege';
import { type AiPlannerState } from '../src/game/ai/ai-types';
import { type GameMap } from '../src/game/map/map-gen';
import { type Player } from '../src/game/players';
import { hexDistance } from '../src/game/map/hex';
import { Tribe } from '../src/game/tribes';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

const AI = 1;

function aiPlayer(): Player {
  return {
    index: AI, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 0, stone: 0, money: 0, ore: 0, food: 20 },
    score: 0, kills: 0, skills: [], isActive: true, aiFlags: { siege: true },
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
  const map = makeTestMap(8);
  const v = tileAt(map, 0, 0)!;
  v.settlement = { owner: 0, level: 1, captureReady: false };
  v.ownedBy = 0;
  for (const t of map.tiles) t.exploredBy = [0, AI];
  put(map, 0, UnitType.WARRIOR, 0, 0);
  return map;
}

function run(map: GameMap, state = freshState()) {
  return { state, step: SIEGE_PATTERN.evaluate({ map, player: aiPlayer(), rng: undefined as never, state, turn: 5 }) };
}

describe('siege-village', () => {
  it('gathers the group when the rest is far', () => {
    const map = scene();
    put(map, AI, UnitType.WARRIOR, 2, 0);
    put(map, AI, UnitType.WARRIOR, 5, 0);
    put(map, AI, UnitType.WARRIOR, 5, -1);
    const { step } = run(map);
    expect(step?.every((a) => a.type !== AiActionType.ATTACK)).toBe(true);
    const mv = step![0] as { q: number; r: number };
    expect(hexDistance(mv, { q: 0, r: 0 })).toBeLessThan(6);
  });

  it('strikes with everyone at once when the group is in reach', () => {
    const map = scene();
    put(map, AI, UnitType.WARRIOR, 1, 0);
    put(map, AI, UnitType.WARRIOR, 0, 1);
    put(map, AI, UnitType.WARRIOR, -1, 1);
    const { step } = run(map);
    expect(step?.filter((a) => a.type === AiActionType.ATTACK)).toHaveLength(3);
  });
});
