import { describe, expect, it } from 'vitest';
import { AiActionType, WeatherType } from '@enums';
import { tornadoVetoed } from '../src/game/ai/ai-weather';
import { makeTestMap } from './helpers/test-map';

describe('tornadoVetoed', () => {
  const move = (q: number, r: number) => [{ type: AiActionType.MOVE as const, unitId: 'u', q, r }];

  it('vetoes a move into the tornado area only', () => {
    const map = makeTestMap(4);
    map.weather = [{ id: 'tornado@9', type: WeatherType.TORNADO, q: 0, r: 0, radius: 1, startTurn: 9, age: 1, lifetime: 5 }];
    expect(tornadoVetoed(map, move(1, 0))).toBe(true);
    expect(tornadoVetoed(map, move(2, 0))).toBe(false);
  });

  it('ignores other weather', () => {
    const map = makeTestMap(4);
    map.weather = [{ id: 'drought@9', type: WeatherType.DROUGHT, q: 0, r: 0, radius: 2, startTurn: 9, age: 1, lifetime: 5 }];
    expect(tornadoVetoed(map, move(0, 0))).toBe(false);
  });
});
