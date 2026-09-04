import { describe, it, expect } from 'vitest';
import { generateMap } from '../src/game/mapGen';
import { buildMultiplayerPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { SeededRandom } from '../src/util/random';
import { initialExplorationFor } from '../src/game/explore';
import { Tribe } from '../src/game/tribes';

function buildSim(): Simulator {
  const players = buildMultiplayerPlayers(
    [
      { name: 'Host', tribe: Tribe.Cats },
      { name: 'Guest', tribe: Tribe.Warriors },
    ],
    1,
    new SeededRandom(11),
  );
  const map = generateMap(players.length, 42);
  for (const p of players) initialExplorationFor(map, p.index);
  return new Simulator(map, players, 'turns30', { rng: () => 0.5 });
}

describe('host/client state sync', () => {
  it('client mirror deep-equals host state after turn transitions', () => {
    const host = buildSim();
    host.startGame();
    host.drainEvents();

    host.applyCommand({ type: 'endTurn' }); // host (0) -> client (1)
    let snap = host.snapshot();
    expect(snap.currentPlayerIndex).toBe(1);
    expect(snap.turn).toBe(1);
    const client = Simulator.fromSnapshot(snap);
    expect(client.snapshot()).toEqual(snap);

    host.applyCommand({ type: 'endTurn' }); // client (1) -> AI (2) -> host (0), turn 2
    snap = host.snapshot();
    expect(snap.currentPlayerIndex).toBe(0);
    expect(snap.turn).toBe(2);
    expect(Simulator.fromSnapshot(snap).snapshot()).toEqual(snap);
  });

  it('a client action (upgrade village) reaches the mirror via snapshot', () => {
    const host = buildSim();
    host.startGame();
    host.drainEvents();
    const v = host.map.tiles.find((t) => t.settlement && t.settlement.owner === 0)!;
    host.players[0]!.resources.money = 100;

    const ok = host.applyCommand({ type: 'upgradeVillage', q: v.q, r: v.r });
    expect(ok).toBe(true);

    const client = Simulator.fromSnapshot(host.snapshot());
    const clientV = client.map.tiles.find((t) => t.q === v.q && t.r === v.r)!;
    expect(clientV.settlement!.level).toBe(2);
    expect(client.players[0]!.resources.money).toBe(98);
  });
});
