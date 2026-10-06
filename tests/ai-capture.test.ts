import { CommandType, GameMode, UnitType } from '@enums';
import { describe, expect, it } from 'vitest';
import { hexNeighbors } from '../src/game/map/hex';
import { type GameMap, type MapTile } from '../src/game/map/map-gen';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

function foggyFreeVillageMap(): { map: GameMap; free: MapTile } {
  const map = makeTestMap(6);
  for (const t of map.tiles) t.exploredBy = [];
  const capital = tileAt(map, 0, 0)!;
  capital.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
  capital.ownedBy = 1;
  capital.exploredBy = [1];
  capital.unit = makeUnit('p1', 1, UnitType.WARRIOR, 0, 0);
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
    const sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    for (let i = 0; i < 10; i++) sim.applyCommand({ type: CommandType.END_TURN });
    expect(free.settlement!.owner).toBe(1);
  });
});
