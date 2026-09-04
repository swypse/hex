import { describe, it, expect } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { hexNeighbors } from '../src/game/hex';
import { GameMap, MapTile } from '../src/game/mapGen';

function foggyFreeVillageMap(): { map: GameMap; free: MapTile } {
  const map = makeTestMap(6);
  for (const t of map.tiles) t.exploredBy = [];
  const capital = tileAt(map, 0, 0)!;
  capital.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
  capital.ownedBy = 1;
  capital.exploredBy = [1];
  capital.unit = makeUnit('p1', 1, 'warrior', 0, 0);
  for (const n of hexNeighbors({ q: 0, r: 0 })) {
    const t = tileAt(map, n.q, n.r);
    if (t) {
      t.ownedBy = 1;
      t.exploredBy = [1];
    }
  }
  const free = tileAt(map, 5, 0)!;
  free.settlement = { owner: null, level: 1, captureReady: false };
  return { map, free };
}

describe('AI captures free villages', () => {
  it('captures a foggy free village a few tiles from spawn within a bounded number of rounds', () => {
    const { map, free } = foggyFreeVillageMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    for (let i = 0; i < 10; i++) sim.applyCommand({ type: 'endTurn' });
    expect(free.settlement!.owner).toBe(1);
  });
});
