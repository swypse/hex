import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventPresenter, type EventHost } from '../src/controller/event-presenter';
import { useGameStore } from '../src/store/game-store';
import { GameEventType, WeatherType } from '@enums';
import type { WeatherEvent } from '../src/game/weather/weather';

function weather(type: WeatherType, q: number, r: number, over: Partial<WeatherEvent> = {}): WeatherEvent {
  return { id: `${type}@9`, type, q, r, radius: 2, startTurn: 9, age: 1, lifetime: 6, ...over };
}

function makeHost(active: WeatherEvent[], extra: Record<string, unknown> = {}, tiles: unknown[] = []): EventHost {
  return {
    app: vi.fn(() => ({})),
    mapRoot: vi.fn(() => new Container()),
    mapView: vi.fn(() => null),
    textures: vi.fn(() => null),
    sim: vi.fn(() => ({ map: { tiles, weather: active }, players: [] })),
    hiddenUnitIds: vi.fn(() => new Set<string>()),
    camera: vi.fn(() => null),
    render: vi.fn(),
    syncKnownTribes: vi.fn(),
    enqueue: vi.fn(),
    bringCellIntoView: vi.fn(),
    exploredKeysFor: vi.fn(() => new Set<string>()),
    saveGame: vi.fn(),
    ...extra,
  } as unknown as EventHost;
}

describe('weather notifications', () => {
  beforeEach(() => {
    useGameStore.setState({ centerMessage: null, centerMessageQueue: [], weather: [], localPlayerIndex: 0, players: [] });
  });

  it('announces a new storm with its direction from the middle of the map', async () => {
    const storm = weather(WeatherType.STORM, 0, 8);
    const presenter = new EventPresenter(makeHost([storm]));
    await presenter.present([{ type: GameEventType.WEATHER_STARTED, weather: storm }], new Set());
    expect(useGameStore.getState().centerMessage).toBe('Storm in the southeast');
    expect(useGameStore.getState().weather).toEqual([storm]);
  });

  it('says "in the center" for an event near the middle', async () => {
    const drought = weather(WeatherType.DROUGHT, 1, 0, { lifetime: 5 });
    const presenter = new EventPresenter(makeHost([drought]));
    await presenter.present([{ type: GameEventType.WEATHER_STARTED, weather: drought }], new Set());
    expect(useGameStore.getState().centerMessage).toBe('Drought in the center');
  });

  it('announces when a storm is over and removes it from the HUD list', async () => {
    useGameStore.setState({ weather: [weather(WeatherType.STORM, 0, 8)] });
    const presenter = new EventPresenter(makeHost([]));
    await presenter.present([{ type: GameEventType.WEATHER_ENDED, weather: weather(WeatherType.STORM, 0, 8, { age: 7 }) }], new Set());
    expect(useGameStore.getState().centerMessage).toBe('Storm is over');
    expect(useGameStore.getState().weather).toEqual([]);
  });

  it('shows no end message for the one-turn earthquake', async () => {
    const quake = weather(WeatherType.EARTHQUAKE, 0, 8, { lifetime: 1, age: 2 });
    const presenter = new EventPresenter(makeHost([]));
    await presenter.present([{ type: GameEventType.WEATHER_ENDED, weather: quake }], new Set());
    expect(useGameStore.getState().centerMessage).toBeNull();
  });

  it('queues the end of one event and the start of another one after the other', async () => {
    const ended = weather(WeatherType.STORM, 0, 8, { age: 7 });
    const started = weather(WeatherType.DROUGHT, -8, 0, { id: 'drought@12', startTurn: 12, lifetime: 5 });
    const presenter = new EventPresenter(makeHost([started]));
    await presenter.present(
      [
        { type: GameEventType.WEATHER_ENDED, weather: ended },
        { type: GameEventType.WEATHER_STARTED, weather: started },
      ],
      new Set(),
    );
    const s = useGameStore.getState();
    expect([s.centerMessage, ...s.centerMessageQueue]).toEqual(['Storm is over', 'Drought in the west']);
  });

  it('centers the map on an earthquake first, then shakes the visible tiles in its scope', async () => {
    const quake = weather(WeatherType.EARTHQUAKE, 2, -3, { radius: 1, lifetime: 1 });
    const order: string[] = [];
    const centerOnCell = vi.fn(async () => {
      order.push('center');
    });
    const shakeTiles = vi.fn((tiles: { q: number; r: number }[]) => {
      order.push(`shake:${tiles.length}`);
      return 0;
    });
    const tile = (q: number, r: number, explored: boolean) => ({ q, r, exploredBy: explored ? [0] : [] });
    // the center and one neighbour are explored; the other neighbour is not
    const tiles = [tile(2, -3, true), tile(3, -3, true), tile(1, -3, false)];
    const host = makeHost([quake], { centerOnCell, mapView: vi.fn(() => ({ shakeTiles })) }, tiles);
    await new EventPresenter(host).present([{ type: GameEventType.WEATHER_STARTED, weather: quake }], new Set());
    expect(centerOnCell).toHaveBeenCalledWith(2, -3);
    expect(order).toEqual(['center', 'shake:2']);
    expect(useGameStore.getState().centerMessage).toContain('Earthquake');
  });

  it('does not move the camera for a storm or for an earthquake in unexplored land', async () => {
    const centerOnCell = vi.fn(async () => {});
    const storm = weather(WeatherType.STORM, 0, 8);
    await new EventPresenter(makeHost([storm], { centerOnCell })).present([{ type: GameEventType.WEATHER_STARTED, weather: storm }], new Set());
    const quake = weather(WeatherType.EARTHQUAKE, 5, 5, { lifetime: 1 });
    const hidden = [{ q: 5, r: 5, exploredBy: [] }];
    await new EventPresenter(makeHost([quake], { centerOnCell, mapView: vi.fn(() => ({ shakeTiles: () => 0 })) }, hidden)).present(
      [{ type: GameEventType.WEATHER_STARTED, weather: quake }],
      new Set(),
    );
    expect(centerOnCell).not.toHaveBeenCalled();
  });
});
