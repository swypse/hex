import { buildPlayers } from '@/game/players';
import { Simulator } from '@/game/simulator';
import { LIGHTNING_COOLDOWN_TURNS, LIGHTNING_COST, LIGHTNING_RANGE, lightningReady, lightningTurnsLeft, lightningVillages } from '@/game/units/lightning';
import { Tribe } from '@/game/tribes';
import { SeededRandom } from '@/util';
import { CommandType, GameEventType, GameMode, UnitType, WeatherType } from '@enums';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

let sim: Simulator;
let map: ReturnType<typeof makeTestMap>;

beforeEach(() => {
  map = makeTestMap(3);
  const players = buildPlayers(Tribe.Aqua, 1, new SeededRandom(1));
  players[0]!.resources.money = 100;
  // A village at (2,0) that claims only itself and (2,-1); a stormcaller far away at (-2,0).
  tileAt(map, 2, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
  for (const [q, r] of [[2, 0], [2, -1]] as const) tileAt(map, q, r)!.claimedByVillage = { q: 2, r: 0 };
  tileAt(map, -2, 0)!.unit = makeUnit('sc', 0, UnitType.STORMCALLER, -2, 0);
  sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
});

const cast = (q = 2, r = 0) => sim.applyCommand({ type: CommandType.LIGHTNING, unitId: 'sc', q, r });

describe('stormcaller Call lightning', () => {
  it('costs money, strikes a cell of the chosen village and starts the recharge', () => {
    expect(cast()).toBe(true);
    expect(sim.players[0]!.resources.money).toBe(100 - LIGHTNING_COST);
    expect(sim.players[0]!.lightningReadyTurn).toBe(sim.turn + LIGHTNING_COOLDOWN_TURNS);
    const started = sim.drainEvents().find((e) => e.type === GameEventType.WEATHER_STARTED);
    expect(started).toBeDefined();
    if (started?.type !== GameEventType.WEATHER_STARTED) return;
    expect(started.weather.type).toBe(WeatherType.LIGHTNING);
    expect(['2,0', '2,-1']).toContain(`${started.weather.q},${started.weather.r}`);
  });

  it('hurts a unit standing on the struck cell', () => {
    tileAt(map, 2, -1)!.unit = makeUnit('victim', 1, UnitType.SWORDSMAN, 2, -1);
    tileAt(map, 2, 0)!.claimedByVillage = { q: 9, r: 9 };
    cast();
    expect(tileAt(map, 2, -1)!.unit!.hp).toBeLessThan(80);
  });

  it('refuses while recharging and works again after the cooldown', () => {
    expect(cast()).toBe(true);
    expect(cast()).toBe(false);
    expect(lightningTurnsLeft(sim.players[0]!, sim.turn)).toBe(LIGHTNING_COOLDOWN_TURNS);
    expect(lightningReady(sim.players[0]!, sim.turn + LIGHTNING_COOLDOWN_TURNS)).toBe(true);
    expect(lightningReady(sim.players[0]!, sim.turn + LIGHTNING_COOLDOWN_TURNS - 1)).toBe(false);
  });

  it('refuses without enough money, for non-stormcallers and for villages it cannot see', () => {
    sim.players[0]!.resources.money = LIGHTNING_COST - 1;
    expect(cast()).toBe(false);
    sim.players[0]!.resources.money = 100;
    tileAt(map, -1, 0)!.unit = makeUnit('w', 0, UnitType.WARRIOR, -1, 0);
    expect(sim.applyCommand({ type: CommandType.LIGHTNING, unitId: 'w', q: 2, r: 0 })).toBe(false);
    tileAt(map, 2, 0)!.exploredBy = [];
    expect(cast()).toBe(false);
    expect(sim.players[0]!.resources.money).toBe(100);
  });

  it('only reaches villages within the lightning range of the stormcaller', () => {
    const big = makeTestMap(LIGHTNING_RANGE + 3);
    tileAt(big, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(big, LIGHTNING_RANGE, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(big, LIGHTNING_RANGE + 1, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    const from = { q: 0, r: 0 };
    const reach = lightningVillages(big, 0, from).map((t) => t.q);
    expect(reach).toContain(0);
    expect(reach).toContain(LIGHTNING_RANGE);
    expect(reach).not.toContain(LIGHTNING_RANGE + 1);
  });

  it('accepts another village within the range', () => {
    const far = tileAt(map, 3, 0)!; // 5 hexes: in range
    far.settlement = { owner: 1, level: 1, captureReady: false };
    expect(cast(3, 0)).toBe(true);
  });

  it('refuses a cell without a village', () => {
    expect(cast(0, 0)).toBe(false);
  });
});

describe('AI stormcaller lightning', () => {
  it('calls lightning onto an explored enemy village once, then waits for the recharge', async () => {
    const { planAiActions } = await import('@/game/ai/ai');
    const { AiActionType } = await import('@enums');
    sim.players[0]!.isHuman = false;
    tileAt(map, 2, -1)!.unit = makeUnit('e', 1, UnitType.WARRIOR, 2, -1); // something worth striking
    const plan = () => planAiActions(map, sim.players[0]!, new SeededRandom(1), GameMode.TURNS30, undefined, sim.turn)
      .filter((a) => a.type === AiActionType.LIGHTNING);
    expect(plan()).toEqual([{ type: AiActionType.LIGHTNING, unitId: 'sc', q: 2, r: 0 }]);
    sim.players[0]!.lightningReadyTurn = sim.turn + 2;
    expect(plan()).toEqual([]);
  });

  it('does nothing without an explored enemy village or enough money', async () => {
    const { planAiActions } = await import('@/game/ai/ai');
    const { AiActionType } = await import('@enums');
    sim.players[0]!.isHuman = false;
    const plan = () => planAiActions(map, sim.players[0]!, new SeededRandom(1), GameMode.TURNS30, undefined, sim.turn)
      .filter((a) => a.type === AiActionType.LIGHTNING);
    sim.players[0]!.resources.money = LIGHTNING_COST;
    expect(plan()).toEqual([]);
    sim.players[0]!.resources.money = 100;
    tileAt(map, 2, 0)!.exploredBy = [];
    expect(plan()).toEqual([]);
  });
});
