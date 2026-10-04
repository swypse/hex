import { beforeEach, describe, expect, it } from 'vitest';
import { BitmapText, Container } from 'pixi.js';
import { WeatherType } from '@enums';
import { HudWeather } from '../src/ui/hud/hud-weather';
import { useGameStore } from '../src/store/game-store';
import type { WeatherEvent } from '../src/game/weather';

function w(type: WeatherType, age: number, lifetime: number): WeatherEvent {
  return { id: `${type}@9`, type, q: 0, r: 0, radius: 2, startTurn: 9, age, lifetime };
}

const visibleTexts = (root: Container): string[] =>
  (root.children as BitmapText[]).filter((c) => c.visible).map((c) => c.text);

describe('HudWeather', () => {
  beforeEach(() => {
    useGameStore.setState({ weather: [] });
  });

  it('shows nothing while the weather is calm', () => {
    const root = new Container();
    new HudWeather().mount({} as never, root);
    expect(visibleTexts(root)).toEqual([]);
  });

  it('lists each active event as "Name age/lifetime" and follows the store', () => {
    const root = new Container();
    const hud = new HudWeather();
    hud.mount({} as never, root);
    useGameStore.setState({ weather: [w(WeatherType.STORM, 3, 6), w(WeatherType.DROUGHT, 1, 5)] });
    expect(visibleTexts(root)).toEqual(['Storm 3/6', 'Drought 1/5']);
    useGameStore.setState({ weather: [w(WeatherType.STORM, 4, 6)] });
    expect(visibleTexts(root)).toEqual(['Storm 4/6']);
    useGameStore.setState({ weather: [] });
    expect(visibleTexts(root)).toEqual([]);
    hud.destroy();
  });

  it('shows just the name for an event that lasts one turn', () => {
    const root = new Container();
    new HudWeather().mount({} as never, root);
    useGameStore.setState({ weather: [w(WeatherType.EARTHQUAKE, 1, 1), w(WeatherType.STORM, 1, 6)] });
    expect(visibleTexts(root)).toEqual(['Earthquake', 'Storm 1/6']);
  });

  it('tapping a line reports that event\'s center tile', () => {
    const root = new Container();
    const picked: Array<[number, number]> = [];
    const hud = new HudWeather((q, r) => picked.push([q, r]));
    hud.mount({} as never, root);
    useGameStore.setState({
      weather: [{ ...w(WeatherType.STORM, 2, 6), q: 4, r: 1 }, { ...w(WeatherType.DROUGHT, 1, 5), q: -3, r: 2 }],
    });
    const [first, second] = root.children as BitmapText[];
    expect(first!.eventMode).toBe('static');
    first!.emit('pointertap', {} as never);
    second!.emit('pointertap', {} as never);
    expect(picked).toEqual([[4, 1], [-3, 2]]);
    // a storm that drifts keeps the same label but the tap follows it
    useGameStore.setState({ weather: [{ ...w(WeatherType.STORM, 2, 6), q: 5, r: 1 }, { ...w(WeatherType.DROUGHT, 1, 5), q: -3, r: 2 }] });
    first!.emit('pointertap', {} as never);
    expect(picked[2]).toEqual([5, 1]);
    hud.destroy();
  });
});
