import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { Container, Text } from 'pixi.js';
import { HudLoading } from '../src/ui/hud/HudLoading';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudLoading', () => {
  let host: UIHost;
  let root: Container;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    host = makeHost();
    root = new Container();
    useGameStore.setState({ screen: 'game', texturesLoading: true });
  });

  afterEach(() => {
    useGameStore.setState({ screen: 'start', texturesLoading: false });
  });

  it('is visible on the game screen while textures are loading', () => {
    const w = new HudLoading();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    expect(el.visible).toBe(true);
    w.destroy();
  });

  it('is hidden once textures finish loading', () => {
    const w = new HudLoading();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    useGameStore.setState({ texturesLoading: false });
    expect(el.visible).toBe(false);
    w.destroy();
  });

  it('is hidden outside the game screen', () => {
    const w = new HudLoading();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    useGameStore.setState({ screen: 'start' });
    expect(el.visible).toBe(false);
    w.destroy();
  });
});
