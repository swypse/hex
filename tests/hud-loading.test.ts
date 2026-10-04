import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { Container, Text } from 'pixi.js';
import { HudLoading } from '../src/ui/hud/hud-loading';
import { useGameStore } from '../src/store/game-store';
import { type UIHost } from '../src/ui/host';
import { Screen } from '@enums';

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
    useGameStore.setState({ screen: Screen.GAME, texturesLoading: true });
  });

  afterEach(() => {
    useGameStore.setState({ screen: Screen.START, texturesLoading: false });
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
    useGameStore.setState({ screen: Screen.START });
    expect(el.visible).toBe(false);
    w.destroy();
  });
});
