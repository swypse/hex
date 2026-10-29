import { UnitType } from '@enums';
import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import { attackBuffSplit, resolveCombat } from '../src/game/units/combat';

describe('attackBuffSplit', () => {
  it('splits a stealthed stalker strike into base and sneak extra', () => {
    const map = makeTestMap(2);
    const stalker = makeUnit('s', 0, UnitType.STALKER, 0, 0);
    const target = tileAt(map, 1, 0)!;
    target.unit = makeUnit('t', 1, UnitType.WARRIOR, 1, 0);
    tileAt(map, 0, 0)!.unit = stalker;
    expect(attackBuffSplit(map, stalker, target)).toBeNull();
    stalker.isStealthed = true;
    const split = attackBuffSplit(map, stalker, target)!;
    expect(split.sneak).toBe(true);
    expect(split.base + split.extra).toBe(resolveCombat(map, stalker, target).attackerDamage);
    expect(split.extra).toBeGreaterThan(0);
  });
});
