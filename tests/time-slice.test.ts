import { describe, expect, it, vi } from 'vitest';
import { forEachIdle, runSliced } from '../src/util/time-slice';

function* counter(n: number): Generator<void, number, void> {
  for (let i = 0; i < n; i++) yield;
  return n;
}

describe('runSliced', () => {
  it('resolves with the generator result', async () => {
    expect(await runSliced(counter(5), 8, async () => {}, () => 0)).toBe(5);
  });

  it('does not yield while the slice is within budget', async () => {
    const yielder = vi.fn(async () => {});
    await runSliced(counter(100), 8, yielder, () => 0);
    expect(yielder).not.toHaveBeenCalled();
  });

  it('yields once the slice budget is used and starts a fresh slice after', async () => {
    let t = 0;
    const yielder = vi.fn(async () => {});
    // each step costs 3 ms: a yield after every third step (9 ms >= 8 ms budget)
    function* work(): Generator<void, void, void> {
      for (let i = 0; i < 9; i++) {
        t += 3;
        yield;
      }
    }
    await runSliced(work(), 8, yielder, () => t);
    expect(yielder).toHaveBeenCalledTimes(3);
  });
});

describe('forEachIdle', () => {
  it('waits for an idle period before each item and runs the work in order', async () => {
    const log: string[] = [];
    const idle = async (): Promise<void> => {
      log.push('idle');
    };
    await forEachIdle(['a', 'b', 'c'], (item) => log.push(item), idle);
    expect(log).toEqual(['idle', 'a', 'idle', 'b', 'idle', 'c']);
  });

  it('does nothing for an empty list', async () => {
    const idle = vi.fn(async () => {});
    await forEachIdle([], () => {}, idle);
    expect(idle).not.toHaveBeenCalled();
  });
});
