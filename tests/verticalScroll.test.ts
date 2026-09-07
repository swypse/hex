import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { ScreenScroll } from '../src/ui/verticalScroll';

type Handler = (e: { pointerId: number; clientY: number; button?: number }) => void;

function fakeWindow() {
  const handlers = new Map<string, Handler[]>();
  return {
    handlers,
    addEventListener: (type: string, cb: unknown): void => {
      const list = handlers.get(type) ?? [];
      list.push(cb as Handler);
      handlers.set(type, list);
    },
    removeEventListener: (type: string, cb: unknown): void => {
      const list = handlers.get(type) ?? [];
      handlers.set(
        type,
        list.filter((h) => h !== cb),
      );
    },
  };
}

describe('ScreenScroll', () => {
  let win: ReturnType<typeof fakeWindow>;
  let app: Application;
  let root: Container;
  let scroll: ScreenScroll;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    win = fakeWindow();
    (globalThis as { window: unknown }).window = win as unknown as Window;
    app = { screen: { width: 400, height: 600 }, ticker: { add: (): void => {}, remove: (): void => {} } } as unknown as Application;
    root = new Container();
    scroll = new ScreenScroll(app, root);
    const tall = new Graphics();
    tall.rect(0, 0, 100, 1200).fill(0xffffff);
    scroll.content.addChild(tall);
    scroll.refresh();
  });

  afterEach(() => {
    scroll.destroy();
  });

  function press(target: Container, clientY: number, pointerId = 1): void {
    (target as unknown as { emit: (t: string, e: unknown) => void }).emit('pointerdown', {
      pointerId,
      clientY,
      button: 0,
    });
  }

  function move(clientY: number, pointerId = 1): void {
    for (const h of win.handlers.get('pointermove') ?? []) h({ pointerId, clientY });
  }

  function up(clientY: number, pointerId = 1): void {
    for (const h of win.handlers.get('pointerup') ?? []) h({ pointerId, clientY });
  }

  it('scrolls when a drag starts over content (e.g. a button) and moves past the threshold', () => {
    press(scroll.content, 500);
    expect(scroll.content.position.y).toBe(0);
    move(498);
    expect(scroll.content.position.y).toBe(0);
    move(300);
    up(300);
    expect(scroll.content.position.y).toBeLessThan(0);
    expect(Math.abs(scroll.content.position.y)).toBeGreaterThanOrEqual(190);
  });

  it('does not scroll or lose a tap when the pointer barely moves', () => {
    press(scroll.content, 500);
    move(497);
    up(497);
    expect(scroll.content.position.y).toBe(0);
  });

  it('scrolls when a drag starts on empty space (the pad)', () => {
    press(scroll.pad, 500);
    move(100);
    up(100);
    expect(Math.abs(scroll.content.position.y)).toBeGreaterThanOrEqual(190);
  });
});
