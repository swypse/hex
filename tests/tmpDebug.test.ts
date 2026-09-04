import { describe, it, expect } from 'vitest';
import { generateMap } from '../src/game/mapGen';
import { buildMultiplayerPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { SeededRandom } from '../src/util/random';
import { initialExplorationFor } from '../src/game/explore';
import { Tribe } from '../src/game/tribes';
import { TileType } from '../src/game/tileTypes';

function build(seedMap: number, seedPlayers: number): { sim: Simulator; mapSeed: number; plSeed: number } {
  const players = buildMultiplayerPlayers(
    [
      { name: 'Host', tribe: Tribe.Cats },
      { name: 'Guest', tribe: Tribe.Aqua },
    ],
    0,
    new SeededRandom(seedPlayers),
  );
  const map = generateMap(players.length, seedMap);
  for (const p of players) initialExplorationFor(map, p.index);
  return { sim: new Simulator(map, players, 'turns30', { rng: () => 0.5 }), mapSeed: seedMap, plSeed: seedPlayers };
}

describe('debug', () => {
  it('dump starting units', () => {
    for (const seedMap of [1, 2, 42, 99, 12345]) {
      const { sim } = build(seedMap, 11);
      for (let p = 0; p < sim.players.length; p++) {
        const s = sim.map.spawns[p]!;
        const t = sim.map.tiles.find((x) => x.q === s.start.q && x.r === s.start.r)!;
        console.log(`seedMap=${seedMap} player=${p} tribe=${Tribe[sim.players[p]!.tribe]} terrain=${TileType[t.terrain]} unitType=${t.unit?.type} shipLevel=${t.unit?.shipLevel}`);
      }
    }
    expect(true).toBe(true);
  });
});
