import { afterEach, describe, expect, it } from 'vitest';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { makeTestMap } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';

const originalSim = (gameController as unknown as { sim: unknown }).sim;

afterEach(() => {
  (gameController as unknown as { sim: unknown }).sim = originalSim;
  useGameStore.getState().setWatching(false);
  useGameStore.getState().setOverlay(null);
});

describe('spectate reveal', () => {
  it('revealMapForLocal explores every tile and all tribes', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1));
    players[0]!.knownTribes = [];
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    useGameStore.setState({ netMode: 'single', localPlayerIndex: 0 });
    (gameController as unknown as { revealMapForLocal(): void }).revealMapForLocal();
    const anyTile = map.tiles.find((t) => !(t.exploredBy ?? []).includes(0));
    expect(anyTile).toBeUndefined();
    expect(players[0]!.knownTribes).toContain(players[1]!.tribe);
  });
});