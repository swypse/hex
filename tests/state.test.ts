import { describe, expect, it } from 'vitest';
import { generateMap, type GameMap } from '../src/game/mapGen';
import { stripUndefinedValues } from '../src/game/state';
import { isShip } from '../src/game/ship';
import type { Unit } from '../src/game/units';

function lossyCodec(node: unknown): unknown {
  return JSON.parse(JSON.stringify(node, (_key, value) => (value === undefined ? null : value)));
}

describe('stripUndefinedValues', () => {
  it('keeps optional unit fields from becoming null across a lossy wire codec', () => {
    const map = generateMap(2, 42);
    const tile = map.tiles.find((t) => t.unit !== null)!;
    const warrior = tile.unit! as Unit;
    expect(warrior.shipLevel).toBeUndefined();

    const asSent = lossyCodec(map) as unknown as GameMap;
    const wireUnit = asSent.tiles.find((t) => t.unit !== null)!.unit! as Unit;
    expect(wireUnit.shipLevel).toBeNull();
    expect(isShip(wireUnit)).toBe(true);

    const clean = structuredClone(map) as unknown as GameMap;
    stripUndefinedValues(clean);
    const cleanAsSent = lossyCodec(clean) as unknown as GameMap;
    const cleanUnit = cleanAsSent.tiles.find((t) => t.unit !== null)!.unit! as Unit;
    expect(cleanUnit.shipLevel).toBeUndefined();
    expect(isShip(cleanUnit)).toBe(false);
  });

  it('deletes undefined values recursively without touching nulls', () => {
    const node = {
      a: undefined,
      b: null,
      c: { d: undefined, e: 1 },
      list: [{ f: undefined }, { g: 'x' }],
    };
    stripUndefinedValues(node);
    expect('a' in node).toBe(false);
    expect('d' in (node.c as object)).toBe(false);
    expect((node.c as { e: number }).e).toBe(1);
    expect((node.list[0] as Record<string, unknown>).f).toBeUndefined();
    expect('f' in (node.list[0] as object)).toBe(false);
    expect(node.b).toBeNull();
  });
});
