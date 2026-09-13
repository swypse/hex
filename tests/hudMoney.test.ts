import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { Container, Text } from 'pixi.js';
import { HudMoney } from '../src/ui/hud/HudMoney';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({
      width: s.length * 8,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: s.length * 8,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 3,
    }),
  };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudMoney placement', () => {
  let host: UIHost;
  let root: Container;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    host = makeHost();
    root = new Container();
    useGameStore.setState({ screen: 'game', players: [], localPlayerIndex: 0 });
  });

  it('is docked to the top edge', () => {
    const money = new HudMoney();
    money.mount(host, root);
    const el = (money as unknown as { el: Container }).el!;
    expect(el.position.y).toBe(0);
    money.destroy();
  });

  it('loads resource icons from the packed 32px atlas, not separate files', () => {
    class FakeImage {
      src = '';
      static instances: FakeImage[] = [];

      constructor() {
        FakeImage.instances.push(this);
      }
    }
    FakeImage.instances = [];
    const originalImage = globalThis.Image;
    (globalThis as { Image?: unknown }).Image = FakeImage;

    const money = new HudMoney();
    money.mount(host, root);

    const srcs = FakeImage.instances.map((i) => i.src);
    const bad = srcs.find((s) => !s.endsWith('icons-32-atlas.png'));
    expect(bad).toBeUndefined();
    (globalThis as { Image?: unknown }).Image = originalImage;
    money.destroy();
  });
});
