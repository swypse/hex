import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt } from './helpers/testMap';
import {
  buildingHelpLines,
  buildingHelpTitle,
  buildingLimitHelpLines,
  buildingLimitHelpTitle,
  settlementHelpLines,
  settlementHelpTitle,
} from '../src/game/helpTexts';
import { BuildingKind } from '../src/game/events';

describe('help texts', () => {
  it('describes a settlement with level, capacity, income and upgrades', () => {
    const map = makeTestMap(2);
    const tile = tileAt(map, 0, 0)!;
    tile.settlement = { owner: 0, level: 2, captureReady: false, name: 'Alpha' };
    expect(settlementHelpTitle(tile)).toBe('Alpha');
    const text = settlementHelpLines(map, tile).join(' ');
    expect(text).toMatch(/level 2/);
    expect(text).toMatch(/money income/);
    expect(text).toMatch(/Upgrade to level 3/);
    expect(text).toMatch(/Supports 1\/2\/3\/4 buildings/);
  });

  it('describes a free village as capturable', () => {
    const map = makeTestMap(2);
    const tile = tileAt(map, 0, 0)!;
    tile.settlement = { owner: null, level: 1, captureReady: false };
    expect(settlementHelpLines(map, tile).join(' ')).toMatch(/captur/i);
  });

  it('provides a description for every building kind', () => {
    const map = makeTestMap(2);
    const kinds: BuildingKind[] = ['sawmill', 'mine', 'port', 'temple', 'forestTemple'];
    for (const kind of kinds) {
      const tile = tileAt(map, 0, 0)!;
      tile.settlement = null;
      tile.building = { kind, level: 1 };
      expect(buildingHelpTitle(tile), kind).toContain('level 1');
      expect(buildingHelpLines(map, tile).length, kind).toBeGreaterThan(0);
    }
  });

  it('describes village building limits', () => {
    const map = makeTestMap(2);
    const tile = tileAt(map, 0, 0)!;
    tile.settlement = { owner: 0, level: 1, captureReady: false, name: 'Alpha' };
    const text = buildingLimitHelpLines(map, tile).join(' ');
    expect(buildingLimitHelpTitle(tile)).toBe('Alpha: building limits');
    expect(text).toMatch(/levels 1-4/);
    expect(text).toMatch(/level 1/);
    expect(text).toMatch(/upgrade/i);
  });
});
