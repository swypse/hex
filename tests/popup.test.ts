import { describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { Popup } from '../src/ui/kit/popup';
import { makeLabel } from '../src/ui/kit/label';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
  };
}

function install(): void {
  Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
  Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
  (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
  };
}

describe('Popup auto height', () => {
  it('grows with taller content so text stays visible', () => {
    install();
    const app = { screen: { width: 800, height: 600 } } as never;
    const root = new Container();
    const popup = new Popup({ app });
    root.addChild(popup.el);

    const a = makeLabel('Line one', { fontSize: 14, fill: 0xcccccc });
    a.position.set(0, 0);
    popup.content.addChild(a);
    const b = makeLabel('Line two', { fontSize: 14, fill: 0xcccccc });
    b.position.set(0, 14);
    popup.content.addChild(b);

    popup.finish();
    expect(popup.height).toBeGreaterThanOrEqual(40);
    popup.destroy();
    expect(root.children.length).toBe(0);
  });
});
