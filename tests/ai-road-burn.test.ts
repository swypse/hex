import { describe, expect, it } from 'vitest';
import { planAiActions } from '../src/game/ai';
import { roadCutSplits } from '../src/game/roads';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import type { GameMap } from '../src/game/map-gen';

function makeAI(): ReturnType<typeof buildPlayers>[number] {
  return buildPlayers(Tribe.Villagers, 1, new SeededRandom(11), 'normal')[1]!;
}

/** Player 0 owns villages at (0,0) and (3,0) joined by roads (1,0),(2,0);
 *  AI player 1 has a warrior standing on (1,0). */
function scene(extraRoute: boolean): GameMap {
  const map = makeTestMap(6);
  for (const [q, r] of [[0, 0], [3, 0]] as const) {
    const v = tileAt(map, q, r)!;
    v.settlement = { owner: 0, level: 1, captureReady: false };
    v.ownedBy = 0;
  }
  const roads: [number, number][] = [[1, 0], [2, 0]];
  if (extraRoute) roads.push([0, 1], [1, 1], [2, 1]); // parallel link: neither road is the only one
  for (const [q, r] of roads) {
    const t = tileAt(map, q, r)!;
    t.roadOwner = 0;
    t.ownedBy = 0;
  }
  for (const t of map.tiles) t.exploredBy = [0, 1];
  tileAt(map, 1, 0)!.unit = makeUnit('raider', 1, 'warrior', 1, 0);
  return map;
}

describe('roadCutSplits', () => {
  it('counts a road that is the only link between two villages', () => {
    const map = scene(false);
    const road = tileAt(map, 1, 0)!;
    expect(roadCutSplits(map, road)).toBe(1);
    // the map is left untouched
    expect(road.roadOwner).toBe(0);
  });

  it('is 0 when another route keeps the villages connected', () => {
    const map = scene(true);
    expect(roadCutSplits(map, tileAt(map, 1, 0)!)).toBe(0);
  });

  it('is 0 for a tile without a road', () => {
    const map = scene(false);
    expect(roadCutSplits(map, tileAt(map, 0, 2)!)).toBe(0);
  });
});

describe('AI destroys enemy roads', () => {
  it('cuts the only road between two enemy villages with the unit standing on it', () => {
    const map = scene(false);
    const actions = planAiActions(map, makeAI(), new SeededRandom(5));
    expect(actions).toContainEqual({ type: 'burnRoad', unitId: 'raider' });
  });

  it('does not destroy its own road', () => {
    const map = scene(false);
    for (const t of map.tiles) if (t.roadOwner === 0) t.roadOwner = 1;
    const actions = planAiActions(map, makeAI(), new SeededRandom(5));
    expect(actions.some((a) => a.type === 'burnRoad')).toBe(false);
  });
});
