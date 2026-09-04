import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { EventPresenter, type EventHost } from '../src/controller/eventPresenter';
import { useGameStore } from '../src/store/gameStore';
import { TileType } from '../src/game/tileTypes';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import type { Player } from '../src/game/players';
import type { MapTile } from '../src/game/mapGen';

describe('capture messages', () => {
  beforeEach(() => {
    useGameStore.setState({ centerMessage: null, centerMessageQueue: [] });
  });

  function player(index: number, tribe: Tribe, knownTribes: Tribe[] = []): Player {
    return {
      index,
      tribe,
      isHuman: index === 0,
      name: `P${index}`,
      resources: { ...START_RESOURCES },
      score: 0,
      kills: 0,
      skills: [],
      isActive: true,
      knownTribes,
    };
  }

  function makeHost(players: Player[]): EventHost {
    const villageTile: MapTile = {
      q: 0, r: 0, terrain: TileType.GrasslandLand,
      settlement: { owner: 0, level: 1, captureReady: false, name: 'V' },
      building: null, roadOwner: null, unit: null, ownedBy: 0, claimedByVillage: null,
      exploredBy: [0],
    };
    const host = {
      app: vi.fn(() => ({})),
      mapRoot: vi.fn(() => new Container()),
      mapView: vi.fn(() => null),
      textures: vi.fn(() => null),
      sim: vi.fn(() => ({ map: { tiles: [villageTile] }, players })),
      hiddenUnitIds: vi.fn(() => new Set<string>()),
      camera: vi.fn(() => null),
      render: vi.fn(),
      syncKnownTribes: vi.fn(),
      enqueue: vi.fn(),
      bringCellIntoView: vi.fn(),
      exploredKeysFor: vi.fn(() => new Set<string>()),
      saveGame: vi.fn(),
    } as unknown as Record<string, unknown>;
    return host as unknown as EventHost;
  }

  it('shows Unknown tribe when the capturer has not been met yet', async () => {
    const local = player(0, Tribe.Cats);
    const capturer = player(1, Tribe.Barbarians, [Tribe.Barbarians]);
    useGameStore.setState({ localPlayerIndex: 0, players: [local, capturer] });
    const presenter = new EventPresenter(makeHost([local, capturer]));
    await presenter.present(
      [{ type: 'captured', q: 0, r: 0, oldOwner: 1, newOwner: 1, ownerDied: false }],
      new Set(),
    );
    expect(useGameStore.getState().centerMessage).toBe('V is captured by Unknown tribe!');
  });

  it('shows the tribe name once it is known', async () => {
    const local = player(0, Tribe.Cats, [Tribe.Barbarians]);
    const capturer = player(1, Tribe.Barbarians, [Tribe.Barbarians]);
    useGameStore.setState({ localPlayerIndex: 0, players: [local, capturer] });
    const presenter = new EventPresenter(makeHost([local, capturer]));
    await presenter.present(
      [{ type: 'captured', q: 0, r: 0, oldOwner: 1, newOwner: 1, ownerDied: false }],
      new Set(),
    );
    expect(useGameStore.getState().centerMessage).toBe('V is captured by Barbarians!');
  });
});
