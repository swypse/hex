import { describe, expect, it } from 'vitest';
import { planAiActions } from '../src/game/ai';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { TileType } from '../src/game/tileTypes';

function makeAI(): ReturnType<typeof buildPlayers>[number] {
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(11), 'normal');
  return players[1]!;
}

describe('AI keeps villages defended', () => {
  it('does not march the only defender out of a village an enemy can reach next turn', () => {
    const map = makeTestMap(6);
    const ai = makeAI();
    // Own village (0,0) with its only guard.
    const home = tileAt(map, 0, 0)!;
    home.settlement = { owner: 1, level: 1, captureReady: false };
    home.ownedBy = 1;
    home.exploredBy = [1];
    const guard = makeUnit('guard', 1, 'warrior', 0, 0);
    home.unit = guard;
    // A fast enemy rider three hexes east: can reach the village next turn.
    const riderTile = tileAt(map, 3, 0)!;
    riderTile.unit = makeUnit('rider', 0, 'rider', 3, 0);
    riderTile.exploredBy = [1];
    // An enemy village adjacent to our guard that it could 'push' into.
    const enemyVillage = tileAt(map, 0, -1)!;
    enemyVillage.settlement = { owner: 0, level: 1, captureReady: false };
    enemyVillage.ownedBy = 0;
    enemyVillage.exploredBy = [1];

    const actions = planAiActions(map, ai, new SeededRandom(5));
    expect(actions.some((a) => a.type === 'move' && a.unitId === 'guard')).toBe(false);
  });
});

describe('AI builds a mine instead of wasting its last slot on a sawmill', () => {
  it('opens the economy chain and puts a mine before any sawmill', () => {
    const map = makeTestMap(6);
    const ai = makeAI();
    ai.skills = ['forestry', 'smithery'];
    ai.resources = { wood: 3, stone: 2, money: 40, ore: 0 };
    // Level-1 village (one building slot) claiming both a forest and a mountain.
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 1, level: 1, captureReady: false };
    village.ownedBy = 1;
    const mountain = tileAt(map, 0, 1)!;
    mountain.terrain = TileType.GrasslandMountain;
    mountain.ownedBy = 1;
    mountain.claimedByVillage = { q: 0, r: 0 };
    const forest = tileAt(map, 0, -1)!;
    forest.terrain = TileType.GrasslandForest;
    forest.ownedBy = 1;
    forest.claimedByVillage = { q: 0, r: 0 };

    const actions = planAiActions(map, ai, new SeededRandom(9));
    const mineIdx = actions.findIndex((a) => a.type === 'build' && a.kind === 'mine');
    const sawmillIdx = actions.findIndex((a) => a.type === 'build' && a.kind === 'sawmill');
    expect(mineIdx).toBeGreaterThanOrEqual(0);
    // The mountain must be mined before the village spends its slots on sawmills.
    if (sawmillIdx >= 0) expect(mineIdx).toBeLessThan(sawmillIdx);
  });
});
