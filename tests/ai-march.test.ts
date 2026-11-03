import { describe, it, expect } from 'vitest';
import { type GameMap, type MapTile, type Settlement } from '../src/game/map/map-gen';
import { TileType } from '../src/game/map/tile-types';
import { Tribe } from '../src/game/tribes';
import { type Player } from '../src/game/players';
import { type Unit } from '../src/game/units/units';
import { SeededRandom } from '../src/util/random';
import { migrateLegacyResources } from '../src/game/economy/stock';
import { MARCH_PATTERN } from '../src/game/ai/ai-march';
import { type AiPlannerState } from '../src/game/ai/ai-types';
import { type AiPatternContext } from '../src/game/ai/ai-patterns';
import { AiActionType, UnitType } from '@enums';

function tile(q: number, r: number, settlement: Settlement | null = null, unit: Unit | null = null): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy: null, claimedByVillage: null, building: null, exploredBy: [0, 1] };
}

function warrior(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: UnitType.WARRIOR, q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 50, attack: 20, attackDistance: 1, defense: 10, spawnVillage: null };
}

function ai(flags?: Player['aiFlags']): Player {
  return {
    index: 1, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 5, stone: 5, money: 100, ore: 5, food: 20 },
    score: 0, kills: 0, skills: [], isActive: true, aiFlags: flags,
  };
}

function ctx(map: GameMap, player: Player): AiPatternContext {
  migrateLegacyResources(map, [player]);
  const state: AiPlannerState = {
    moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(),
    built: new Set(), opened: new Set(), occupied: new Set(),
  };
  return { map, player, rng: new SeededRandom(1), state };
}

/** A fully explored strip of grassland with an enemy village at the far end. */
function stripMap(length: number, unitAt = 0): GameMap {
  const map: GameMap = { radius: length, tiles: [], spawns: [] };
  for (let q = 0; q <= length; q++) {
    const village: Settlement | null = q === length ? { owner: 0, level: 1, captureReady: false } : null;
    map.tiles.push(tile(q, 0, village, q === unitAt ? warrior('w', 1, q, 0) : null));
  }
  return map;
}

describe('march-to-objective', () => {
  it('walks an idle unit toward a distant enemy village', () => {
    const actions = MARCH_PATTERN.evaluate(ctx(stripMap(8), ai()));
    expect(actions).not.toBeNull();
    const move = actions![0]!;
    expect(move.type).toBe(AiActionType.MOVE);
    if (move.type === AiActionType.MOVE) expect(move.q).toBeGreaterThan(0);
  });

  it('does nothing when the march flag is off', () => {
    expect(MARCH_PATTERN.evaluate(ctx(stripMap(8), ai({ march: false })))).toBeNull();
  });

  it('does not move a unit that is already standing on the objective village', () => {
    const map = stripMap(4, 4);
    map.tiles[4]!.settlement = { owner: 0, level: 1, captureReady: false };
    expect(MARCH_PATTERN.evaluate(ctx(map, ai()))).toBeNull();
  });

  it('skips units that already moved this turn', () => {
    const c = ctx(stripMap(8), ai());
    c.state.moved.add('w');
    expect(MARCH_PATTERN.evaluate(c)).toBeNull();
  });
});
