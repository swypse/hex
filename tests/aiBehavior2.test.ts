import { describe, it, expect } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { planAiActions } from '../src/game/ai';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { TileType } from '../src/game/tileTypes';
import { PIRATE_OWNER, type Unit } from '../src/game/units';

function aiUnit(id: string, q: number, r: number, hp = 50): Unit {
  const u = makeUnit(id, 1, 'warrior', q, r);
  u.hp = hp;
  return u;
}

function makePirate(id: string, q: number, r: number): Unit {
  return {
    id,
    owner: PIRATE_OWNER,
    type: 'pirate',
    q,
    r,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 150,
    attack: 30,
    attackDistance: 3,
    defense: 10,
    spawnVillage: null,
  };
}

function makeShip(id: string, owner: number, q: number, r: number): Unit {
  const ship = makeUnit(id, owner, 'warrior', q, r);
  ship.shipLevel = 1;
  return ship;
}

describe('AI grind and capture behaviour', () => {
  it('presses an adjacent engaged enemy instead of recalling the only unit home', () => {
    const map = makeTestMap(6);
    const aiCap = tileAt(map, 0, 0)!;
    aiCap.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    aiCap.ownedBy = 1;
    const ai = aiUnit('ai1', 1, 0, 36);
    tileAt(map, 1, 0)!.unit = ai;
    const humanCap = tileAt(map, 2, 0)!;
    humanCap.settlement = { owner: 0, level: 1, captureReady: false, capital: true };
    humanCap.ownedBy = 0;
    const human = makeUnit('hum1', 0, 'warrior', 2, 0);
    human.hp = 35;
    humanCap.unit = human;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'normal');
    const actions = planAiActions(map, players[1]!, new SeededRandom(2), 'capture');
    expect(actions[0]).toEqual({ type: 'attack', unitId: 'ai1', q: 2, r: 0 });
    expect(actions.some((a) => a.type === 'move' && a.unitId === 'ai1' && a.q === 0 && a.r === 0)).toBe(false);
  });

  it('never chains an attack right after stepping onto a foreign village', () => {
    const map = makeTestMap(6);
    const aiCap = tileAt(map, 0, 0)!;
    aiCap.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    aiCap.ownedBy = 1;
    const ai = aiUnit('ai1', 1, 0);
    tileAt(map, 1, 0)!.unit = ai;
    const enemyVillage = tileAt(map, 2, 0)!;
    enemyVillage.settlement = { owner: 0, level: 1, captureReady: false };
    enemyVillage.ownedBy = 0;
    const enemy = makeUnit('hum1', 0, 'warrior', 3, 0);
    tileAt(map, 3, 0)!.unit = enemy;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'normal');
    const actions = planAiActions(map, players[1]!, new SeededRandom(2), 'capture');
    const moveOntoVillage = actions.some((a) => a.type === 'move' && a.unitId === 'ai1' && a.q === 2 && a.r === 0);
    const attackFromThere = actions.some((a) => a.type === 'attack' && a.unitId === 'ai1' && a.q === 3 && a.r === 0);
    expect(moveOntoVillage && attackFromThere).toBe(false);
  });

  it('builds roads to push its network toward unexplored or foreign ground', () => {
    const map = makeTestMap(6);
    const aiCap = tileAt(map, 0, 0)!;
    aiCap.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    aiCap.ownedBy = 1;
    const freeVillage = tileAt(map, 2, 0)!;
    freeVillage.settlement = { owner: null, level: 1, captureReady: false };

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'normal');
    const p = players[1]!;
    p.skills = ['roads'];
    p.resources = { wood: 50, stone: 50, money: 100, ore: 0 };
    const actions = planAiActions(map, p, new SeededRandom(2), 'capture');
    expect(actions.some((a) => a.type === 'buildRoad' && a.q === 1 && a.r === 0)).toBe(true);
  });
});

describe('AI vs AI shuttle regression', () => {
  it('a lone warrior does not oscillate between its village and an adjacent hex forever', () => {
    const map = makeTestMap(6);
    const aiCap = tileAt(map, 0, 0)!;
    aiCap.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    aiCap.ownedBy = 1;
    const ai = aiUnit('ai1', 0, 0);
    aiCap.unit = ai;
    const humanCap = tileAt(map, 2, 0)!;
    humanCap.settlement = { owner: 0, level: 1, captureReady: false, capital: true };
    humanCap.ownedBy = 0;
    humanCap.unit = makeUnit('hum1', 0, 'warrior', 2, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'normal');
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.drainEvents();
    const pos = () => `${ai.q},${ai.r}`;
    const trace: string[] = [];
    for (let i = 0; i < 14; i++) {
      sim.applyCommand({ type: 'endTurn' });
      sim.drainEvents();
      trace.push(pos());
    }
    // 0,0 (village) and 1,0 (the hex toward the enemy) must not alternate more
    // than twice — the reinforce/grind fix should end the endless shuttle.
    let alternations = 0;
    for (let i = 1; i < trace.length; i++) {
      const cur = trace[i]!;
      const prev = trace[i - 1]!;
      if ((cur === '0,0' && prev === '1,0') || (cur === '1,0' && prev === '0,0')) alternations++;
    }
    expect(alternations).toBeLessThanOrEqual(2);
  });
});

describe('Pirate pathing', () => {
  it('navigates around land toward a reachable ship instead of stalling on a straight line', () => {
    const map = makeTestMap(4);
    for (const t of map.tiles) t.terrain = TileType.GrasslandLand;
    // Water path that first moves AWAY from the straight line to the target,
    // which the old greedy chase could never take.
    for (const [q, r] of [
      [0, 0], [0, -1], [1, -1], [2, -1], [2, 0], [3, 0], [4, 0],
    ] as const) {
      tileAt(map, q, r)!.terrain = TileType.Water;
    }
    const pirate = makePirate('pirate-1', 0, 0);
    tileAt(map, 0, 0)!.unit = pirate;
    const ship = makeShip('ship-1', 0, 4, 0);
    tileAt(map, 4, 0)!.unit = ship;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    sim.drainEvents();
    // It must have moved along the detour, not remained at its start hex.
    expect(pirate.q !== 0 || pirate.r !== 0).toBe(true);
    expect(pirate.r).toBeLessThanOrEqual(0);
  });

  it('patrols when the nearest unit is unreachable by water instead of idling', () => {
    const map = makeTestMap(4);
    for (const t of map.tiles) t.terrain = TileType.GrasslandLand;
    for (const [q, r] of [
      [0, 0], [1, 0], [0, 1], [3, 0], [4, 0], [4, -1],
    ] as const) {
      tileAt(map, q, r)!.terrain = TileType.Water;
    }
    const pirate = makePirate('pirate-1', 0, 0);
    tileAt(map, 0, 0)!.unit = pirate;
    const ship = makeShip('ship-1', 0, 4, 0);
    tileAt(map, 4, 0)!.unit = ship;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    const moved = events.some(
      (e) => e.type === 'unitMoved' && (e as { unitId: string }).unitId === 'pirate-1',
    );
    expect(moved).toBe(true);
  });
});
