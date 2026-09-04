import { describe, expect, it, afterEach, vi } from 'vitest';
import { Container, Text } from 'pixi.js';
import { CenterMessage } from '../src/ui/overlays/CenterMessage';
import { useGameStore } from '../src/store/gameStore';
import { t } from '../src/i18n';
import { type UIHost } from '../src/ui/host';

function makeHost(width = 800, height = 600): UIHost {
  return { app: { screen: { width, height } }, screenLayer: new Container(), overlayLayer: new Container() } as unknown as UIHost;
}

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
  };
}

function installCanvas(): void {
  (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
  };
}

function allTexts(c: Container): Text[] {
  const out: Text[] = [];
  const walk = (n: Container): void => {
    for (const ch of n.children) {
      if (ch instanceof Text) out.push(ch as Text);
      if (ch instanceof Container) walk(ch);
    }
  };
  walk(c);
  return out;
}

describe('CenterMessage', () => {
  afterEach(() => {
    useGameStore.setState({ centerMessage: null, centerMessageQueue: [] });
    vi.restoreAllMocks();
  });

  it('renders a smaller, wrapped notification that stays within 90% of the screen width', () => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 500 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    installCanvas();

    useGameStore.setState({ centerMessage: 'A very long notification about something that happened on the map.' });
    const host = makeHost(400);
    const root = new Container();
    const msg = new CenterMessage();
    msg.mount(host, root);

    const el = root.children[0] as Container;
    expect(el).toBeDefined();

    const popupRoot = el.children[0] as Container;
    const message = useGameStore.getState().centerMessage!;
    const text = allTexts(popupRoot).find((t) => String(t.text) === message);
    expect(text).toBeDefined();
    const style = text!.style;
    expect(style.fontSize).toBe(10.5);
    expect(style.wordWrap).toBe(true);
    expect(style.wordWrapWidth).toBeLessThanOrEqual(400 * 0.9);

    // The card never exceeds 90% of the screen width.
    const card = popupRoot.children[2] as Container;
    const bg = card.children[0] as unknown as { width: number };
    expect(bg.width).toBeLessThanOrEqual(400 * 0.9);

    msg.destroy();
    expect(root.children.length).toBe(0);
  });

  it('auto-clears the message after a timeout', async () => {
    installCanvas();
    useGameStore.setState({ centerMessage: 'Hello' });
    const host = makeHost();
    const root = new Container();
    const msg = new CenterMessage();
    msg.mount(host, root);
    expect(useGameStore.getState().centerMessage).toBe('Hello');
    await new Promise((r) => setTimeout(r, 1500));
    expect(useGameStore.getState().centerMessage).toBeNull();
    msg.destroy();
  });

  it('closes "Your turn" after 0.8s and other messages after 1.4s', () => {
    vi.useFakeTimers();
    try {
      installCanvas();
      const host = makeHost();
      const msg = new CenterMessage();

      useGameStore.setState({ centerMessage: t('msg.yourTurn') });
      msg.mount(host, new Container());
      vi.advanceTimersByTime(900);
      expect(useGameStore.getState().centerMessage).toBeNull();

      useGameStore.setState({ centerMessage: 'Hello' });
      vi.advanceTimersByTime(900);
      expect(useGameStore.getState().centerMessage).toBe('Hello');
      vi.advanceTimersByTime(600);
      expect(useGameStore.getState().centerMessage).toBeNull();

      msg.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('regular auto-close clears the pending force-close timer', () => {
    vi.useFakeTimers();
    try {
      installCanvas();
      useGameStore.setState({ centerMessage: 'Hello' });
      const msg = new CenterMessage();
      msg.mount(makeHost(), new Container());
      vi.advanceTimersByTime(1400);
      expect(useGameStore.getState().centerMessage).toBeNull();
      vi.advanceTimersByTime(5000);
      expect(useGameStore.getState().centerMessage).toBeNull();
      msg.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('force-closes after 5s even when the regular timer keeps being re-armed', () => {
    vi.useFakeTimers();
    try {
      installCanvas();
      useGameStore.setState({ centerMessage: 'Hello' });
      const root = new Container();
      const msg = new CenterMessage();
      msg.mount(makeHost(), root);

      for (let t = 0; t < 4; t++) {
        vi.advanceTimersByTime(1000);
        useGameStore.setState({ turn: t + 2 });
      }
      expect(useGameStore.getState().centerMessage).toBe('Hello');
      vi.advanceTimersByTime(1000);
      expect(useGameStore.getState().centerMessage).toBeNull();

      msg.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
