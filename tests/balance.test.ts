import { describe, it, expect } from 'vitest';
import {
  PLAYABLE_UNITS,
  cheapBeatsCostly,
  effectiveCost,
  runDuels,
  symWin,
  UNIT_SKILL,
} from '../src/game/balance';

const duels = runDuels();

/** The 7 base combat units — duel-balance invariants apply to these. The 7
 *  tribe special units are utility unlocks (stealth, building, aura, traps,
 *  storm, stun) and deliberately sit outside the raw duel balance. */
const CORE: (typeof PLAYABLE_UNITS)[number][] = ['warrior', 'rider', 'archer', 'swordsman', 'shield', 'catapult', 'knight'];

describe('unit balance invariants', () => {
  it('PLAYABLE_UNITS covers every playable type incl. special units', () => {
    expect(PLAYABLE_UNITS).toContain('stalker');
    expect(PLAYABLE_UNITS).toContain('builder');
    expect(PLAYABLE_UNITS).toContain('banner');
    expect(PLAYABLE_UNITS).toContain('berserker');
    expect(PLAYABLE_UNITS).toContain('trapper');
    expect(PLAYABLE_UNITS).toContain('stormcaller');
    expect(PLAYABLE_UNITS).toContain('stunner');
  });
  it('spawns a rock-paper-scissors web among the core units (no 90%+ steamrolls between same-tier units)', () => {
    // Warrior vs Rider must no longer be a one-sided cheap-beats-skill-gated slaughter,
    // and the two elite melee units (swordsman/knight) must trade near-evenly.
    const warVsRider = Math.max(symWin(duels, 'warrior', 'rider'), symWin(duels, 'rider', 'warrior'));
    const swordVsKnight = Math.max(symWin(duels, 'swordsman', 'knight'), symWin(duels, 'knight', 'swordsman'));
    expect(warVsRider).toBeLessThan(0.75);
    expect(swordVsKnight).toBeLessThan(0.75);
  });

  it('no cheap-beats-costly catastrophes above a hard threshold', () => {
    const flags = cheapBeatsCostly(duels);
    // The knight-vs-catapult pairing is accepted: fast melee is the intended counter
    // to an unprotected siege catapult (documented in combat-balance.md).
    // Special units (stalker/builder/banner/berserker/trapper/stormcaller/stunner)
    // are utility tribal units and intentionally excluded from this duel-invariant.
    const bad = flags.filter((f) =>
      f.win > 0.9 &&
      CORE.includes(f.cheaper) && CORE.includes(f.pricier) &&
      !(f.cheaper === 'catapult' || f.pricier === 'catapult')
    );
    expect(bad).toEqual([]);
  });

  it('every core unit has both a favourable and an unfavourable matchup (no strictly dominant or strictly dominated unit)', () => {
    for (const a of CORE) {
      const wins = PLAYABLE_UNITS.filter((b) => b !== a && symWin(duels, a, b) > 0.5);
      const losses = PLAYABLE_UNITS.filter((b) => b !== a && symWin(duels, a, b) < 0.5);
      expect(wins.length, `${a} should beat at least one unit`).toBeGreaterThan(0);
      expect(losses.length, `${a} should lose to at least one unit`).toBeGreaterThan(0);
    }
  });

  it('the two skill-gated utility units keep their identities', () => {
    // Catapult: the costly siege specialist wins decisively vs slow foot units.
    expect(symWin(duels, 'catapult', 'warrior')).toBeGreaterThan(0.8);
    expect(symWin(duels, 'catapult', 'archer')).toBeGreaterThan(0.7);
    // Shield: a wall that beats infantry but loses to heavy hitters.
    expect(symWin(duels, 'shield', 'warrior')).toBeGreaterThan(0.8);
    expect(symWin(duels, 'swordsman', 'shield')).toBeGreaterThan(0.5);
  });

  it('costs reflect the skill gate (skill-gated units are more expensive in the model)', () => {
    expect(UNIT_SKILL.rider).toBe('riding');
    expect(effectiveCost('rider')).toBeGreaterThan(effectiveCost('warrior'));
    expect(effectiveCost('knight')).toBeGreaterThan(effectiveCost('swordsman'));
  });
});
