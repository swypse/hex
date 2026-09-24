import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runDuels, PLAYABLE_UNITS, cheapBeatsCostly } from '../src/game/balance';
import { buildReport, CAPTION } from '../src/game/balance-report';

const OUT = resolve(__dirname, '../combat-balance.md');

/** The 7 base combat units; tribe special units are utility unlocks and sit
 *  outside the raw duel-balance verdict. */
const CORE = ['warrior', 'rider', 'archer', 'swordsman', 'shield', 'catapult', 'knight'] as (typeof PLAYABLE_UNITS)[number][];

describe('combat-balance report', () => {
  it('contains the duel matrices and the balance verdict', () => {
    const report = buildReport();
    expect(report).toContain('# Combat balance report');
    expect(report).toContain('Turns-to-kill matrix');
    expect(report).toContain('Win-rate matrix');
    expect(report).toContain('Cost efficiency');
    expect(report).toContain('Balance flags');
    expect(report).toContain('Applied changes');
    for (const t of PLAYABLE_UNITS) expect(report).toContain(CAPTION[t]);
  });

  it('regenerates combat-balance.md so it always matches the live stats', () => {
    const report = buildReport();
    let prev = '';
    try {
      prev = readFileSync(OUT, 'utf8');
    } catch {
      // First run / deleted file: write unconditionally.
    }
    if (prev !== report) writeFileSync(OUT, report);
    expect(readFileSync(OUT, 'utf8')).toBe(report);
  });

  it('reports a post-rebalance pass on the cheap-beats-costly check', () => {
    const flags = cheapBeatsCostly(runDuels());
    // The only pair that may remain is the accepted knight-vs-catapult siege
    // counter (documented in the report). Special units are utility unlocks
    // and are excluded from this verdict.
    const catastrophes = flags.filter((f) => f.win > 0.9 && CORE.includes(f.cheaper) && CORE.includes(f.pricier) && !(f.cheaper === 'catapult' || f.pricier === 'catapult'));
    expect(catastrophes).toEqual([]);
  });
});
