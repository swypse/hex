import { describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { Popup } from '../src/ui/kit/popup';
import { makeLabel } from '../src/ui/kit/label';
import { FontSize } from '@enums';

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

    const a = makeLabel('Line one', { fontSize: FontSize.SMALL, fill: 0xcccccc });
    a.position.set(0, 0);
    popup.content.addChild(a);
    const b = makeLabel('Line two', { fontSize: FontSize.SMALL, fill: 0xcccccc });
    b.position.set(0, 14);
    popup.content.addChild(b);

    popup.finish();
    expect(popup.height).toBeGreaterThanOrEqual(40);
    popup.destroy();
    expect(root.children.length).toBe(0);
  });
});

describe('Popup card height', () => {
  function oneLinePopup(fitContent: boolean): Popup {
    install();
    const app = { screen: { width: 800, height: 600 } } as never;
    const popup = new Popup({ app, fitContent, modal: false });
    const text = makeLabel('Your turn', { fontSize: FontSize.SMALL, fill: 0xffffff });
    popup.content.addChild(text);
    popup.finish();
    return popup;
  }

  it('wraps a one-line message card tightly, with equal padding above and below the text', () => {
    const popup = oneLinePopup(true);
    // card = 16 px top padding + the text + 16 px bottom padding, no leftover space
    expect(popup.height - popup.contentAreaHeight).toBe(32);
    expect(popup.height).toBeLessThan(80);
    popup.destroy();
  });

  it('keeps the minimum height for ordinary popups', () => {
    const popup = oneLinePopup(false);
    expect(popup.height).toBe(80);
    popup.destroy();
  });
});
