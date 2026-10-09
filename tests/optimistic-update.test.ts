import { NetworkController, type NetworkHost } from '@/controller/network-controller';
import { initialExplorationFor } from '@/game/map/explore';
import { generateMap } from '@/game/map/map-gen';
import { buildMultiplayerPlayers } from '@/game/players';
import { reachableTargets } from '@/game/units/selection';
import { PREDICTABLE_COMMAND_TYPES, Simulator } from '@/game/simulator';
import { Tribe } from '@/game/tribes';
import type { HostMessage } from '@/net/peer-session';
import { useGameStore } from '@/store/game-store';
import { SeededRandom } from '@/util';
import { CommandType, ConnectionState, GameMode, HostMessageType, NetMode, Screen } from '@enums';
import type { Application } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  return new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5 });
}

describe('predictable command types', () => {
  it('covers deterministic commands and excludes random/AI ones', () => {
    expect([...PREDICTABLE_COMMAND_TYPES].sort()).toEqual([
      CommandType.BUILD,
      CommandType.BUILD_BRIDGE,
      CommandType.BUILD_ROAD,
      CommandType.BUILD_WALL,
      CommandType.BURN,
      CommandType.BURN_ROAD,
      CommandType.CAPTURE,
      CommandType.DEAL,
      CommandType.DESTROY_BUILDING,
      CommandType.DISBAND,
      CommandType.ENABLE_STEALTH,
      CommandType.EXTINGUISH,
      CommandType.HEAL,
      CommandType.MOVE,
      CommandType.OPEN_SKILL,
      CommandType.REPAIR,
      CommandType.SHIP_LANDING,
      CommandType.SPAWN,
      CommandType.STORM,
      CommandType.TRAP,
      CommandType.UPGRADE_SHIP,
      CommandType.UPGRADE_VILLAGE,
    ]);
    expect(PREDICTABLE_COMMAND_TYPES.has(CommandType.ATTACK)).toBe(false);
    expect(PREDICTABLE_COMMAND_TYPES.has(CommandType.CLAIM_BONUS)).toBe(false);
    expect(PREDICTABLE_COMMAND_TYPES.has(CommandType.END_TURN)).toBe(false);
  });

  it('reproduces identical events and state when a deterministic command is applied on host and on a mirror', () => {
    const start = (sim: Simulator) => {
      const unit = sim.map.tiles.find((t) => t.unit && t.unit.owner === 0)!;
      const target = reachableTargets(sim.map, unit.unit!, 1, false, false, 0)[0]!;
      return { unit: unit.unit!, target };
    };

    const host = buildSim();
    const mirror = Simulator.fromSnapshot(host.snapshot());
    const h = start(host);
    const m = start(mirror);

    const okHost = host.applyCommand({ type: CommandType.MOVE, unitId: h.unit.id, q: h.target.q, r: h.target.r });
    const okMirror = mirror.applyCommand({ type: CommandType.MOVE, unitId: m.unit.id, q: m.target.q, r: m.target.r });
    expect(okHost).toBe(true);
    expect(okMirror).toBe(true);
    expect(mirror.drainEvents()).toEqual(host.drainEvents());
    expect(mirror.snapshot()).toEqual(host.snapshot());
  });
});

function makeFakeHost() {
  const adopt = vi.fn();
  const present = vi.fn().mockResolvedValue(undefined);
  const render = vi.fn();
  const host: NetworkHost = {
    app: () => ({}) as unknown as Application,
    sim: () => null,
    setSim: () => {
    },
    setTextures: () => {
    },
    enqueue: async (task) => {
      await task();
    },
    render,
    syncStore: () => {
    },
    syncKnownTribes: () => {
    },
    exploredKeysFor: () => new Set<string>(),
    presentEvents: async () => {
      present();
    },
    adoptSnapshot: () => {
      adopt();
    },
    applyFitToScreen: () => {
    },
    centerOnStartVillage: () => {
    },
    cameraQualityFactor: () => 1,
    runCommand: async () => {
    },
  };
  return { host, adopt, present, render };
}

describe('client optimistic reconciliation', () => {
  let snap: ReturnType<Simulator['snapshot']>;

  beforeEach(() => {
    snap = buildSim().snapshot();
    useGameStore.setState({
      screen: Screen.GAME,
      netMode: NetMode.CLIENT,
      localPlayerIndex: 1,
      connection: ConnectionState.CONNECTED,
      lobby: null,
      aiActive: false,
      players: snap.players,
      turn: snap.turn,
      currentPlayerIndex: snap.currentPlayerIndex,
      gameOver: snap.gameOver,
      winnerIndex: snap.winnerIndex,
      expectedTurns: snap.expectedTurns,
      bonusAwarded: snap.bonusAwarded,
    });
  });

  const stateMsg = (): HostMessage => ({ type: HostMessageType.STATE, state: snap, playerIndex: 1 });
  const eventsMsg = (): HostMessage => ({ type: HostMessageType.EVENTS, events: [] });

  it('skips presenting events for an optimistically predicted command', async () => {
    const { host, adopt, present } = makeFakeHost();
    const net = new NetworkController(host);

    net.noteClientPrediction();
    net.onHostMessage(stateMsg());
    await Promise.resolve();
    expect(adopt).toHaveBeenCalledTimes(1);

    net.onHostMessage(eventsMsg());
    await Promise.resolve();
    expect(present).not.toHaveBeenCalled();
  });

  it('presents events normally once no prediction is pending', async () => {
    const { host, adopt, present } = makeFakeHost();
    const net = new NetworkController(host);

    net.noteClientPrediction();
    net.onHostMessage(stateMsg());
    await Promise.resolve();
    net.onHostMessage(eventsMsg());
    await Promise.resolve();
    expect(present).not.toHaveBeenCalled();

    net.onHostMessage(stateMsg());
    await Promise.resolve();
    net.onHostMessage(eventsMsg());
    await Promise.resolve();
    expect(adopt).toHaveBeenCalledTimes(2);
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('clears a stale skip flag when the next reply has no pending prediction', async () => {
    const { host, present } = makeFakeHost();
    const net = new NetworkController(host);

    net.noteClientPrediction();
    net.onHostMessage(stateMsg());
    await Promise.resolve();

    net.onHostMessage(stateMsg());
    await Promise.resolve();
    net.onHostMessage(eventsMsg());
    await Promise.resolve();
    expect(present).toHaveBeenCalledTimes(1);
  });

  it('skips one events batch per pending prediction (two rapid commands)', async () => {
    const { host, adopt, present } = makeFakeHost();
    const net = new NetworkController(host);

    net.noteClientPrediction();
    net.noteClientPrediction();
    net.onHostMessage(stateMsg());
    await Promise.resolve();
    net.onHostMessage(stateMsg());
    await Promise.resolve();
    net.onHostMessage(eventsMsg());
    await Promise.resolve();
    net.onHostMessage(eventsMsg());
    await Promise.resolve();
    expect(adopt).toHaveBeenCalledTimes(2);
    expect(present).not.toHaveBeenCalled();
  });
});
