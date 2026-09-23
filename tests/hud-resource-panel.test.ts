import { beforeEach, describe, expect, it } from 'vitest';
import { BitmapText, Container, Sprite, Text } from 'pixi.js';
import { HudResourcePanel } from '../src/ui/hud/hud-resource-panel';
import { useGameStore } from '../src/store/game-store';
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
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
  };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudResourcePanel placement', () => {
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
    const money = new HudResourcePanel();
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

    const money = new HudResourcePanel();
    money.mount(host, root);

    const srcs = FakeImage.instances.map((i) => i.src);
    const bad = srcs.find((s) => !s.endsWith('icons-32-atlas.png'));
    expect(bad).toBeUndefined();
    (globalThis as { Image?: unknown }).Image = originalImage;
    money.destroy();
  });

  it('uses 14px text and 12px icons on screens under 600px wide', () => {
    host = makeHost(480);
    const money = new HudResourcePanel();
    money.mount(host, root);
    const el = (money as unknown as { el: Container }).el!;
    const walk = (root: Container): { fonts: number[]; iconWidths: number[] } => {
      const fonts: number[] = [];
      const iconWidths: number[] = [];
      const visit = (c: Container): void => {
        for (const ch of c.children) {
          if (ch instanceof BitmapText) fonts.push((ch as unknown as { style: { fontSize: number } }).style.fontSize);
          if (ch instanceof Sprite) iconWidths.push((ch as unknown as { width: number }).width);
          if (ch instanceof Container) visit(ch as Container);
        }
      };
      visit(root);
      return { fonts, iconWidths };
    };
    const { fonts, iconWidths } = walk(el);
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((f) => f === 14)).toBe(true);
    expect(iconWidths.length).toBeGreaterThan(0);
    expect(iconWidths.every((w) => w === 12)).toBe(true);
    money.destroy();
  });
});
