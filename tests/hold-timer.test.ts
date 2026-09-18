import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HoldTimer } from '../src/controller/hold-timer';

describe('HoldTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the hold callback after the delay', () => {
    const timer = new HoldTimer(500);
    const fired: number[] = [];
    timer.start(() => fired.push(1));
    expect(fired).toHaveLength(0);
    vi.advanceTimersByTime(499);
    expect(fired).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(fired).toHaveLength(1);
  });

  it('does not fire after cancel', () => {
    const timer = new HoldTimer(500);
    const fired: number[] = [];
    timer.start(() => fired.push(1));
    timer.cancel();
    vi.advanceTimersByTime(1000);
    expect(fired).toHaveLength(0);
  });

  it('does not fire after release', () => {
    const timer = new HoldTimer(500);
    const fired: number[] = [];
    timer.start(() => fired.push(1));
    timer.release();
    vi.advanceTimersByTime(1000);
    expect(fired).toHaveLength(0);
  });

  it('restarts a fresh hold when started again', () => {
    const timer = new HoldTimer(500);
    const fired: number[] = [];
    timer.start(() => fired.push(1));
    vi.advanceTimersByTime(200);
    timer.start(() => fired.push(2));
    vi.advanceTimersByTime(500);
    expect(fired).toEqual([2]);
  });
});