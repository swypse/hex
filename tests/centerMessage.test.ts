import { describe, expect, it, afterEach, vi } from 'vitest';
import { Container, Text } from 'pixi.js';
import { CenterMessage } from '../src/ui/overlays/CenterMessage';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';

function makeHost(width = 800, height = 600): UIHost {
  return { app: { screen: { width, height } }, screenLayer: new Container(), overlayLayer: new Container() } as unknown as UIHost;
}

describe('CenterMessage', () => {
  afterEach(() => {
    useGameStore.setState({ centerMessage: null, centerMessageQueue: [] });
    vi.restoreAllMocks();
  });

  it('renders a smaller, wrapped notification that stays within 90% of the screen width', () => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 500 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });

    useGameStore.setState({ centerMessage: 'A very long notification about something that happened on the map.' });
    const host = makeHost(400);
    const root = new Container();
    const msg = new CenterMessage();
    msg.mount(host, root);

    const el = root.children[0] as Container;
    const [bg, text] = el.children as [unknown, Text];
    expect(bg).toBeDefined();

    const style = text.style;
    expect(style.fontSize).toBe(20);
    expect(style.wordWrap).toBe(true);
    expect(style.wordWrapWidth).toBeLessThanOrEqual(400 * 0.9);

    // Container (panel + padding) never exceeds 90% of the screen width.
    const maxW = 400 * 0.9;
    const panelW = bg as unknown as { position: { x: number } };
    const panelRight = -panelW.position.x;
    expect(panelRight).toBeLessThanOrEqual(maxW);

    msg.destroy();
    expect(root.children.length).toBe(0);
  });

  it('auto-clears the message after a timeout', async () => {
    useGameStore.setState({ centerMessage: 'Your turn!' });
    const host = makeHost();
    const root = new Container();
    const msg = new CenterMessage();
    msg.mount(host, root);
    expect(useGameStore.getState().centerMessage).toBe('Your turn!');
    await new Promise((r) => setTimeout(r, 1500));
    expect(useGameStore.getState().centerMessage).toBeNull();
    msg.destroy();
  });
});
