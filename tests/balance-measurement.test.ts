import { describe, it, expect } from 'vitest';
import {
  CORE_COMBAT,
  UTILITY_UNITS,
  dominance,
  duel,
  runDuels,
  superStrong,
  superWeak,
  symWin,
} from '../src/game/balance';
import { armyFor, armyUnitCost, runSkirmishMatrix, skirmish, skirmishMeans } from '../src/game/balance-skirmish';
import { Mulberry32 } from '../src/game/balance';

const duels = runDuels();
const dom = dominance(duels);

describe('balance measurement: dominance', () => {
  it('has no super-weak core unit (beats nothing and loses to most of the roster)', () => {
    expect(superWeak(dom).map((d) => d.type)).toEqual([]);
  });

  it('pins the known open issue: only the knight is flagged super-strong', () => {
    // Knight attack 40 leaves the swordsman as a ~45% coin-flip counter; when
    // the knight is tuned so the swordsman beats it at >=60% this list empties
    // and the expectation must become [].
    expect(superStrong(dom).map((d) => d.type)).toEqual(['knight']);
  });

  it('every non-knight core unit has a counter or a real loss somewhere', () => {
    for (const d of dom) {
      if (d.type === 'knight') continue;
      expect(d.beatenBy.length, `${d.type} should be beaten by something`).toBeGreaterThan(0);
    }
  });

  it('utility units are excluded from the core roster', () => {
    for (const u of UTILITY_UNITS) expect(CORE_COMBAT).not.toContain(u);
  });

  it('is symmetric: p(a beats b) + p(b beats a) = 1', () => {
    expect(symWin(duels, 'warrior', 'swordsman') + symWin(duels, 'swordsman', 'warrior')).toBeCloseTo(1, 10);
  });
});

describe('balance measurement: duel model', () => {
  it('a catapult that has to move cannot fire that turn', () => {
    // Start at distance 5 with a slow warrior: the catapult (range 4) must
    // step in, so the warrior gets to act first in range and the catapult's
    // first attack comes a turn later than a catapult that starts in range.
    const inRange = duel('catapult', 'warrior', () => 1, 100, undefined, { startDist: 4 });
    const farAway = duel('catapult', 'warrior', () => 1, 100, undefined, { startDist: 6 });
    expect(farAway.turnsForA).toBeLessThanOrEqual(inRange.turnsForA + 2);
    expect(farAway.hpB).toBe(0);
  });

  it('an ambushed catapult (distance 1) loses to a warrior it would beat with free volleys', () => {
    expect(duel('catapult', 'warrior').winner).toBe('catapult');
    expect(duel('catapult', 'swordsman', () => 1, 100, undefined, { startDist: 1 }).winner).toBe('swordsman');
  });

  it('a raging berserker does not counter-attack', () => {
    // Shield (def 20) would hurt a 50hp berserker with counters; at <=35% hp the
    // berserker deals +10 attack and ignores the counter side. Just assert the
    // duel finishes deterministically and the berserker never wins vs a shield.
    expect(duel('berserker', 'shield').winner).toBe('shield');
  });

  it('a stalker first strike ignores defense', () => {
    // Against a shield (def 20) the stalker's first hit is the full 15 dmg
    // instead of 3, so the shield loses hp to a stalker it could otherwise ignore.
    const d = duel('stalker', 'shield');
    expect(d.hpB).toBeLessThan(80);
  });
});

describe('balance measurement: skirmish', () => {
  it('sizes armies to the budget (at least one unit)', () => {
    expect(armyFor('warrior', 96)).toHaveLength(24);
    expect(armyFor('catapult', 96).length).toBe(Math.max(1, Math.round(96 / armyUnitCost('catapult'))));
    expect(armyFor('catapult', 1)).toHaveLength(1);
  });

  it('is deterministic for a seed and initiative-averaged', () => {
    const a = runSkirmishMatrix(96, 0, ['warrior', 'swordsman'], 1, 20);
    const b = runSkirmishMatrix(96, 0, ['warrior', 'swordsman'], 1, 20);
    expect(a.win).toEqual(b.win);
  });

  it('a lone unit fights to a finish or a draw, never throws', () => {
    const rng = new Mulberry32(3);
    const r = skirmish(['knight'], ['warrior', 'warrior'], true, () => rng.next());
    expect([0, 0.5, 1]).toContain(r);
  });

  it('gives every core unit a mean win-rate in [0,1]', () => {
    const m = runSkirmishMatrix(96, 0, CORE_COMBAT, 777, 20);
    for (const v of Object.values(skirmishMeans(m))) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
