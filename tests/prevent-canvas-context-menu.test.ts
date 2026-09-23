import { describe, it, expect } from 'vitest';
import { preventCanvasContextMenu } from '../src/prevent-canvas-context-menu';

class FakeCanvas {
  listeners = new Map<string, Array<(e: { preventDefault: () => void }) => void>>();
  calls: string[] = [];
  style = {
    setProperty: (name: string, value: string): void => {
      this.calls.push(`${name}:${value}`);
    },
  };

  addEventListener(type: string, fn: (e: { preventDefault: () => void }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
}

describe('preventCanvasContextMenu', () => {
  it('prevents the browser context menu on the game canvas', () => {
    const canvas = new FakeCanvas();
    preventCanvasContextMenu(canvas as unknown as HTMLCanvasElement);
    const [fn] = canvas.listeners.get('contextmenu') ?? [];
    expect(fn).toBeDefined();
    let prevented = false;
    fn!({ preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(true);
  });

  it('disables the mobile long-press callout/selection on the canvas', () => {
    const canvas = new FakeCanvas();
    preventCanvasContextMenu(canvas as unknown as HTMLCanvasElement);
    expect(canvas.calls).toContain('-webkit-touch-callout:none');
    expect(canvas.calls).toContain('-webkit-user-select:none');
    expect(canvas.calls).toContain('user-select:none');
  });
});