import { sleep } from './sleep';

/** Lets the browser run pending input, rendering and other tasks. */
export function yieldToMain(): Promise<void> {
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof sched?.yield === 'function') return sched.yield();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (): void => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/** Default work budget per slice: well under Chrome's 50 ms long-task mark. */
export const SLICE_BUDGET_MS = 8;

/** Tighter budget for simulation turns: a slice can overshoot by one step, and
 *  the page must still fit rendering into the same 16 ms frame. */
export const SIM_SLICE_BUDGET_MS = 4;

/** Drives a step generator to completion, handing control back to the browser
 *  whenever a slice has used `budgetMs`, so a long computation shows up as many
 *  short tasks instead of one long one. Resolves with the generator's result. */
export async function runSliced<T>(
  steps: Generator<void, T, void>,
  budgetMs: number = SLICE_BUDGET_MS,
  yielder: () => Promise<void> = yieldToMain,
  now: () => number = () => performance.now(),
): Promise<T> {
  let sliceEnd = now() + budgetMs;
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    if (now() >= sliceEnd) {
      await yielder();
      sliceEnd = now() + budgetMs;
    }
  }
}

/** Resolves when the browser is idle (or after `timeoutMs` at the latest, so a
 *  busy page still makes progress). Falls back to a short timer where
 *  `requestIdleCallback` does not exist (Safari). */
export function whenIdle(timeoutMs = 500): Promise<void> {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') return new Promise((resolve) => ric(() => resolve(), { timeout: timeoutMs }));
  return sleep(50);
}

/** Runs `work` for each item, one per idle period, so a long list of small jobs
 *  never takes more than one job's time away from the page at once. */
export async function forEachIdle<T>(items: readonly T[], work: (item: T) => void, idle: () => Promise<void> = whenIdle): Promise<void> {
  for (const item of items) {
    await idle();
    work(item);
  }
}
