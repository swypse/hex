import { describe, it, expect } from 'vitest';
import { generateMap } from '../src/game/mapGen';
import { axialKey, hexNeighbors } from '../src/game/hex';
import { TileType } from '../src/game/tileTypes';
import { tileSignature, tileInView } from '../src/render/tileSignature';
import { Viewport } from '../src/render/tileSignature';

describe('tileSignature', () => {
  it('changes when terrain changes', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0]!;
    const a = tileSignature(t, map, 0, new Set());
    t.terrain = t.terrain === TileType.Water ? TileType.GrasslandLand : TileType.Water;
    const b = tileSignature(t, map, 0, new Set());
    expect(a).not.toBe(b);
  });

  it('changes when a unit appears', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0]!;
    const a = tileSignature(t, map, 0, new Set());
    t.unit = { id: 'u1', owner: 0, type: 'warrior', q: t.q, r: t.r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: t.q, r: t.r } };
    const b = tileSignature(t, map, 0, new Set());
    expect(a).not.toBe(b);
  });

  it('changes when the unit is hidden', () => {
    const map = generateMap(2, 42);
    const t = map.tiles.find((x) => x.unit);
    if (!t || !t.unit) return;
    const a = tileSignature(t, map, 0, new Set());
    const b = tileSignature(t, map, 0, new Set([t.unit.id]));
    expect(a).not.toBe(b);
  });

  it('changes when ownership changes', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0]!;
    const a = tileSignature(t, map, 0, new Set());
    t.ownedBy = 1;
    const b = tileSignature(t, map, 0, new Set());
    expect(a).not.toBe(b);
  });

  it('changes when a neighbor ownership changes', () => {
    const map = generateMap(2, 42);
    const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
    const withNeighbor = map.tiles.find((t) => hexNeighbors(t).some((n) => byKey.has(axialKey(n))))!;
    const a = tileSignature(withNeighbor, map, 0, new Set());
    const nb = hexNeighbors(withNeighbor)[0]!;
    const nbTile = byKey.get(axialKey(nb));
    if (!nbTile) return;
    nbTile.ownedBy = 1;
    const b = tileSignature(withNeighbor, map, 0, new Set());
    expect(a).not.toBe(b);
  });

  it('changes when a neighbor road appears', () => {
    const map = generateMap(2, 42);
    const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
    const withNeighbor = map.tiles.find((t) => hexNeighbors(t).some((n) => byKey.has(axialKey(n))))!;
    const a = tileSignature(withNeighbor, map, 0, new Set());
    const nb = hexNeighbors(withNeighbor)[0]!;
    const nbTile = byKey.get(axialKey(nb));
    if (!nbTile) return;
    nbTile.roadOwner = 0;
    const b = tileSignature(withNeighbor, map, 0, new Set());
    expect(a).not.toBe(b);
  });

  it('changes when the owner tribe becomes known', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0]!;
    t.ownedBy = 1;
    const a = tileSignature(t, map, 0, new Set());
    const b = tileSignature(t, map, 0, new Set(), new Set([1]));
    expect(a).not.toBe(b);
  });

  it('keeps an unknown-owner signature stable across calls', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0]!;
    t.ownedBy = 1;
    expect(tileSignature(t, map, 0, new Set())).toBe(tileSignature(t, map, 0, new Set()));
  });

  it('changes when a bridge appears', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0]!;
    const a = tileSignature(t, map, 0, new Set());
    t.bridge = { owner: 0, dir: 'we' };
    const b = tileSignature(t, map, 0, new Set());
    expect(a).not.toBe(b);
  });

  it('is stable for an unchanged tile', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0]!;
    expect(tileSignature(t, map, 0, new Set())).toBe(tileSignature(t, map, 0, new Set()));
  });
});

describe('tileInView', () => {
  const vp: Viewport = { x: 400, y: 300, scale: 1, width: 800, height: 600 };
  it('is true for the center tile', () => {
    const map = generateMap(2, 42);
    const center = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    expect(tileInView(center, 40, vp)).toBe(true);
  });
  it('is false for a far tile', () => {
    const map = generateMap(2, 42);
    const far = map.tiles[map.tiles.length - 1]!;
    expect(tileInView(far, 40, vp)).toBe(false);
  });
});
