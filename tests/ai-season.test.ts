import { describe, expect, it } from 'vitest';
import { AiActionType, UnitType } from '@enums';
import { SEASON_SAFETY_PATTERN, seasonUnsafe, seasonVetoed } from '../src/game/ai/ai-season';
import { type AiPlannerState } from '../src/game/ai/ai-types';
import { type Player } from '../src/game/players';
import { TileType } from '../src/game/map/tile-types';
import { Tribe } from '../src/game/tribes';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

const AI = 1;
const LAST_AUTUMN = 18;
const LAST_WINTER = 24;

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

function plan(map: ReturnType<typeof makeTestMap>, turn: number) {
  return SEASON_SAFETY_PATTERN.evaluate({ map, player: aiPlayer(), rng: undefined as never, state: freshState(), turn });
}

describe('season safety', () => {
  it('moves a unit off ice on the last winter turn', () => {
    const map = makeTestMap(4);
    tileAt(map, 1, 0)!.terrain = TileType.Ice;
    const w = makeUnit('w', AI, UnitType.WARRIOR, 1, 0);
    tileAt(map, 1, 0)!.unit = w;
    const step = plan(map, LAST_WINTER);
    expect(step).toHaveLength(1);
    const a = step![0] as { q: number; r: number };
    expect(tileAt(map, a.q, a.r)!.terrain).not.toBe(TileType.Ice);
    expect(plan(map, LAST_WINTER - 1)).toBeNull();
  });

  it('vetoes stepping onto ice only on the last winter turn', () => {
    const map = makeTestMap(4);
    tileAt(map, 1, 0)!.terrain = TileType.Ice;
    const w = makeUnit('w', AI, UnitType.WARRIOR, 0, 0);
    tileAt(map, 0, 0)!.unit = w;
    const step = [{ type: AiActionType.MOVE, unitId: 'w', q: 1, r: 0 } as const];
    expect(seasonVetoed(map, LAST_WINTER, [...step])).toBe(true);
    expect(seasonVetoed(map, LAST_WINTER - 1, [...step])).toBe(false);
  });

  it('moves a ship off coast water on the last autumn turn, not land units', () => {
    const map = makeTestMap(5);
    for (const t of map.tiles) if (t.q >= 2) t.terrain = TileType.Water;
    const coast = tileAt(map, 2, 0)!;
    const ship = makeUnit('s', AI, UnitType.WARRIOR, 2, 0);
    ship.shipLevel = 1;
    coast.unit = ship;
    expect(seasonUnsafe(map, LAST_AUTUMN, coast, ship)).toBe(true);
    expect(seasonUnsafe(map, LAST_AUTUMN, tileAt(map, 4, 0)!, ship)).toBe(false);
    const step = plan(map, LAST_AUTUMN);
    const a = step![0] as { q: number; r: number };
    expect(seasonUnsafe(map, LAST_AUTUMN, tileAt(map, a.q, a.r)!, ship)).toBe(false);
    const walker = makeUnit('w', AI, UnitType.WARRIOR, 2, 0);
    expect(seasonUnsafe(map, LAST_AUTUMN, coast, walker)).toBe(false);
  });
});

describe('iceCracksAt', () => {
  it('is true only on the last winter turn', async () => {
    const { iceCracksAt } = await import('../src/game/season');
    expect(iceCracksAt(LAST_WINTER)).toBe(true);
    expect(iceCracksAt(LAST_WINTER - 1)).toBe(false);
    expect(iceCracksAt(LAST_AUTUMN)).toBe(false);
    expect(iceCracksAt(LAST_WINTER + 1)).toBe(false);
  });
});
