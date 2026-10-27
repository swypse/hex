import { describe, expect, it, afterEach, vi } from 'vitest';
import { Container, Sprite, BitmapText } from 'pixi.js';
import { CenterMessage } from '../src/ui/overlays/center-message';
import { OverlayKind } from '@enums';
import { useGameStore } from '../src/store/game-store';
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

function allTexts(c: Container): BitmapText[] {
  const out: BitmapText[] = [];
  const walk = (n: Container): void => {
    for (const ch of n.children) {
      if (ch instanceof BitmapText) out.push(ch as BitmapText);
      if (ch instanceof Container) walk(ch);
    }
  };
  walk(c);
  return out;
}

function countSprites(c: Container): number {
  let n = 0;
  for (const ch of c.children) {
    if (ch instanceof Sprite) n += 1;
    if (ch instanceof Container) n += countSprites(ch);
  }
  return n;
}

describe('CenterMessage', () => {
  afterEach(() => {
    useGameStore.setState({ centerMessage: null, centerMessageQueue: [], centerIconFile: null, centerIconQueue: [], centerChipStyle: null, centerChipQueue: [] });
    vi.restoreAllMocks();
  });

  it('renders a smaller, wrapped notification that stays within 90% of the screen width', () => {
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
    expect(style.fontSize).toBe(14);
    expect(style.wordWrap).toBe(true);
    expect(style.wordWrapWidth).toBeLessThanOrEqual(400 * 0.9);

    // The card never exceeds 90% of the screen width.
    const card = popupRoot.children[2] as Container;
    const bg = card.children[0] as unknown as { width: number };
    expect(bg.width).toBeLessThanOrEqual(400 * 0.9);

    msg.destroy();
    expect(root.children.length).toBe(0);
  });

  it('holds the message while the skill tree is open and shows it once closed', () => {
    installCanvas();
    useGameStore.setState({ centerMessage: 'Waiting', overlay: { kind: OverlayKind.SKILL } });
    const root = new Container();
    const msg = new CenterMessage();
    msg.mount(makeHost(), root);
    const el = root.children[0] as Container;
    expect(el.children.length).toBe(0);
    expect(useGameStore.getState().centerMessage).toBe('Waiting');

    useGameStore.setState({ overlay: null });
    const popupRoot = (root.children[0] as Container).children[0] as Container;
    expect(allTexts(popupRoot).some((tx) => String(tx.text) === 'Waiting')).toBe(true);
    msg.destroy();
  });

  it('shows the tribe icon above the text for a meet-tribe message', () => {
    installCanvas();
    useGameStore.setState({ centerMessage: 'You meet Cats!', centerIconFile: 'cats-icon.png' });
    const host = makeHost();
    const root = new Container();
    const msg = new CenterMessage();
    msg.mount(host, root);

    const popupRoot = (root.children[0] as Container).children[0] as Container;
    expect(allTexts(popupRoot).some((tx) => String(tx.text) === 'You meet Cats!')).toBe(true);
    expect(countSprites(popupRoot)).toBeGreaterThan(0);
    msg.destroy();
  });

  it('renders the achievement icon chip at 64px when a chip style is set', () => {
    installCanvas();
    useGameStore.setState({
      centerMessage: 'Achievement unlocked!',
      centerIconFile: 'achivements/x.png',
      centerChipStyle: { size: 64, bgColor: 0x373748 },
    });
    const host = makeHost();
    const root = new Container();
    const msg = new CenterMessage();
    msg.mount(host, root);

    const popupRoot = (root.children[0] as Container).children[0] as Container;
    const sprites: Sprite[] = [];
    const walk = (n: Container): void => {
      for (const ch of n.children) {
        if (ch instanceof Sprite) sprites.push(ch);
        if (ch instanceof Container) walk(ch);
      }
    };
    walk(popupRoot);
    expect(sprites.length).toBeGreaterThan(0);
    for (const s of sprites) expect(s.width).toBe(64);
    msg.destroy();
  });

  it('closes immediately when the card is clicked', () => {
    installCanvas();
    useGameStore.setState({ centerMessage: 'Hello' });
    const root = new Container();
    const msg = new CenterMessage();
    msg.mount(makeHost(), root);

    const el = root.children[0] as Container;
    const popupRoot = el.children[0] as Container;
    const card = popupRoot.children[2] as Container;
    (card as unknown as { emit: (e: string) => void }).emit('pointertap');

    expect(useGameStore.getState().centerMessage).toBeNull();
    msg.destroy();
  });

  it('never closes on its own, only by a tap', () => {
    vi.useFakeTimers();
    try {
      installCanvas();
      useGameStore.setState({ centerMessage: 'Hello' });
      const msg = new CenterMessage();
      msg.mount(makeHost(), new Container());
      vi.advanceTimersByTime(60_000);
      expect(useGameStore.getState().centerMessage).toBe('Hello');
      msg.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
