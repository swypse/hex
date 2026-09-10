import { describe, expect, it } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { SeededRandom } from '../src/util/random';
import { hasAnyAvailableAction } from '../src/game/playerActions';
import { Tribe } from '../src/game/tribes';
import { TileType } from '../src/game/tileTypes';
import { SKILLS } from '../src/game/skills';

describe('hasAnyAvailableAction', () => {
  const players = () => buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
  const human = (p: ReturnType<typeof buildPlayers>) => p[0]!;

  function broke(p: ReturnType<typeof buildPlayers>): void {
    const target = p[0]!;
    target.resources = { wood: 0, stone: 0, money: 0, ore: 0 };
    target.skills = [];
  }

  it('returns false on an empty map with a broke player', () => {
    const map = makeTestMap(2);
    const p = players();
    broke(p);
    expect(hasAnyAvailableAction(map, human(p), 1)).toBe(false);
  });

  it('is true when an own unit can move', () => {
    const map = makeTestMap(2);
    const p = players();
    broke(p);
    tileAt(map, 0, 0)!.unit = makeUnit('u', 0, 'warrior', 0, 0);
    expect(hasAnyAvailableAction(map, human(p), 1)).toBe(true);
  });

  it('is true when an own unit can attack an enemy', () => {
    const map = makeTestMap(2);
    const p = players();
    broke(p);
    tileAt(map, 0, 0)!.unit = makeUnit('a', 0, 'warrior', 0, 0);
    tileAt(map, 1, 0)!.unit = makeUnit('e', 1, 'warrior', 1, 0);
    expect(hasAnyAvailableAction(map, human(p), 1)).toBe(true);
  });

  it('is true when an own unit can heal', () => {
    const map = makeTestMap(2);
    const p = players();
    broke(p);
    const u = makeUnit('h', 0, 'warrior', 0, 0);
    u.hp = 1;
    tileAt(map, 0, 0)!.unit = u;
    expect(hasAnyAvailableAction(map, human(p), 1)).toBe(true);
  });

  it('is true when an owned village can spawn a unit', () => {
    const map = makeTestMap(2);
    const p = players();
    broke(p);
    human(p).resources.money = 5;
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    expect(hasAnyAvailableAction(map, human(p), 1)).toBe(true);
  });

  it('is true when a skill can be opened', () => {
    const map = makeTestMap(2);
    const p = players();
    human(p).skills = [];
    human(p).resources.money = 5;
    expect(hasAnyAvailableAction(map, human(p), 1)).toBe(true);
  });

  it('is true when a captureReady village has an own unit on it', () => {
    const map = makeTestMap(2);
    const p = players();
    broke(p);
    tileAt(map, 0, 0)!.settlement = { owner: null, level: 1, captureReady: true };
    tileAt(map, 0, 0)!.unit = makeUnit('c', 0, 'warrior', 0, 0);
    expect(hasAnyAvailableAction(map, human(p), 1)).toBe(true);
  });

  it('is true when a bonus is claimable', () => {
    const map = makeTestMap(2);
    const p = players();
    broke(p);
    const t = tileAt(map, 0, 0)!;
    t.bonus = { kind: 'money', claimer: 0, arrivalTurn: 1 };
    t.unit = makeUnit('b', 0, 'warrior', 0, 0);
    expect(hasAnyAvailableAction(map, human(p), 2)).toBe(true);
  });

  it('is true when an owned village can be upgraded', () => {
    const map = makeTestMap(2);
    const p = players();
    human(p).skills = Object.keys(SKILLS) as (keyof typeof SKILLS)[];
    human(p).resources = { wood: 100, stone: 100, money: 100, ore: 100 };
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    expect(hasAnyAvailableAction(map, human(p), 1)).toBe(true);
  });

  it('is true when a sawmill can be built', () => {
    const map = makeTestMap(2);
    const p = players();
    human(p).skills = Object.keys(SKILLS) as (keyof typeof SKILLS)[];
    human(p).resources = { wood: 100, stone: 100, money: 100, ore: 100 };
    const tile = tileAt(map, 0, 0)!;
    tile.ownedBy = 0;
    tile.terrain = TileType.GrasslandLand;
    const neighbor = tileAt(map, 1, 0)!;
    neighbor.terrain = TileType.GrasslandForest;
    neighbor.ownedBy = 0;
    expect(hasAnyAvailableAction(map, human(p), 1)).toBe(true);
  });

  it('returns false when every unit is exhausted and nothing is affordable', () => {
    const map = makeTestMap(2);
    const p = players();
    broke(p);
    const u = makeUnit('x', 0, 'warrior', 0, 0);
    u.hasMoved = true;
    u.hasAttacked = true;
    u.hasHealed = true;
    tileAt(map, 0, 0)!.unit = u;
    expect(hasAnyAvailableAction(map, human(p), 1)).toBe(false);
  });
});