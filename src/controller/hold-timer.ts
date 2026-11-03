/** A cancellable one-shot delay used for long-press (click-and-hold)
 *  gestures. `start` begins (or restarts) a countdown; `cancel` aborts it
 *  (e.g. the pointer was released before the hold elapsed) and `release` marks
 *  the gesture finished so a pending hold no longer fires. */
export class HoldTimer {
  private pending: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly delayMs: number) {}

  start(onHold: () => void): void {
    this.cancel();
    this.pending = setTimeout(onHold, this.delayMs);
  }

  cancel(): void {
    if (this.pending !== null) {
      clearTimeout(this.pending);
      this.pending = null;
    }
  }

  release(): void {
    this.cancel();
  }
}