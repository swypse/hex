import { describe, it, expect } from 'vitest';
import { preventCanvasContextMenu } from '../src/preventCanvasContextMenu';

class FakeCanvas {
  listeners = new Map<string, Array<(e: { preventDefault: () => void }) => void>>();
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
});