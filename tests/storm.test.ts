import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { TileType } from '../src/game/tile-types';
import { Unit } from '../src/game/units';
import { stormDamage } from '../src/game/storm';

function freshAquaSim() {
  const map = makeTestMap(3);
  const players = buildPlayers(Tribe.Aqua, 1, new SeededRandom(1));
  players[0]!.tribe = Tribe.Aqua;
  const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
  return { map, players, sim };
}

let sim: Simulator;
let map: ReturnType<typeof makeTestMap>;

beforeEach(() => {
  const s = freshAquaSim();
  sim = s.sim;
  map = s.map;
  sim.players[0]!.resources = { wood: 100, stone: 100, money: 100, ore: 100 };
  // Village A at (0,0), its claimed water (1,1); village B at (-1,0), its own water (0,1).
  tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
  tileAt(map, 0, 0)!.ownedBy = 0;
  tileAt(map, -1, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
  tileAt(map, -1, 0)!.ownedBy = 0;
  tileAt(map, 1, 1)!.terrain = TileType.Water;
  tileAt(map, 1, 1)!.ownedBy = 0;
  tileAt(map, 1, 1)!.claimedByVillage = { q: 0, r: 0 };
  tileAt(map, 0, 1)!.terrain = TileType.Water;
  tileAt(map, 0, 1)!.ownedBy = 0;
  tileAt(map, 0, 1)!.claimedByVillage = { q: -1, r: 0 };
  tileAt(map, 1, -1)!.terrain = TileType.Water;
  tileAt(map, 1, -1)!.ownedBy = 0;
  tileAt(map, 1, -1)!.claimedByVillage = { q: 0, r: 0 };
});

function place(owner: number, type: Unit['type'], q: number, r: number, opts: Partial<Unit> = {}): Unit {
  const u = makeUnit('a' + Math.random().toString(36).slice(2, 8), owner, type, q, r);
  Object.assign(u, opts);
  tileAt(map, q, r)!.unit = u;
  return u;
}

function findUnit(id: string): Unit {
  return sim.map.tiles.find((t) => t.unit?.id === id)!.unit!;
}

function ship(owner: number, q: number, r: number): Unit {
  return place(owner, 'warrior', q, r, { hp: 200, shipLevel: 1 });
}

describe('stormcaller storm', () => {
  it('is refused without a village, and refused on an unowned tile', () => {
    const stormcaller = place(0, 'stormcaller', 2, 0); // land, no village claims it
    expect(sim.applyCommand({ type: 'storm', unitId: stormcaller.id })).toBe(false);
  });

  it('strikes enemy and pirate ships on the village water tiles only, not own ships nor other village water', () => {
    const stormcaller = place(0, 'stormcaller', 1, 0);
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 1, 0)!.claimedByVillage = { q: 0, r: 0 };
    const villageA = { q: 0, r: 0 };
    // add a third village-A water tile for a pirate ship
    tileAt(map, 1, 2)!.terrain = TileType.Water;
    tileAt(map, 1, 2)!.ownedBy = 0;
    tileAt(map, 1, 2)!.claimedByVillage = villageA;
    void villageA;
    const enemyShip = ship(1, 1, 1);
    const ownShip = ship(0, 1, -1);
    const pirateShip = place(-1, 'pirate', 1, 2, { hp: 200, shipLevel: 1 });
    const otherShip = ship(1, 0, 1); // village B water (0,1) claimed by (-1,0)
    const ok = sim.applyCommand({ type: 'storm', unitId: stormcaller.id });
    expect(ok).toBe(true);
    expect(findUnit(enemyShip.id).hp).toBe(200 - stormDamage());
    expect(findUnit(ownShip.id).hp).toBe(200); // own ship untouched
    expect(findUnit(pirateShip.id).hp).toBe(200 - stormDamage()); // pirate reduced too
    expect(findUnit(otherShip.id).hp).toBe(200); // other village untouched
    expect(findUnit(stormcaller.id).hasMoved).toBe(true);
    expect(findUnit(stormcaller.id).hasAttacked).toBe(true);
  });

  it('is allowed from a ship standing on an owned village water tile', () => {
    const stormcaller = place(0, 'stormcaller', 1, 1, { shipLevel: 1 });
    const enemyShip = ship(1, 1, -1); // another village-A water tile
    expect(sim.applyCommand({ type: 'storm', unitId: stormcaller.id })).toBe(true);
    expect(findUnit(enemyShip.id).hp).toBe(110);
  });
});