import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Container, ImageSource, Sprite, Text, Texture } from 'pixi.js';
import { StartScreen } from '../src/ui/screens/StartScreen';
import { type UIHost } from '../src/ui/host';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

function sprites(root: Container): Sprite[] {
  return root.children.filter((c): c is Sprite => c instanceof Sprite);
}

describe('StartScreen background images', () => {
  let host: UIHost;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(new Texture({ source: new ImageSource({ width: 1, height: 1 }) }));
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({
        getContext: () => ({
          measureText: (s: string) => ({ width: s.length * 8 }),
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createRadialGradient: () => ({ addColorStop: () => {} }),
          fillRect: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        }),
        width: 0,
        height: 0,
      }),
    };
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    host = makeHost();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function loadAll(): void {
    for (const inst of FakeImage.instances) inst.onload?.call(inst);
  }

  it('positions main-top at the top-right corner, partly off the screen', () => {
    const screen = new StartScreen();
    screen.mount(host);
    const load = FakeImage.instances.find((i) => i.src.includes('main-top.png'))!;
    load.onload!.call(load);

    const top = sprites((screen as unknown as { root: Container }).root!).find((s) => s.anchor.x === 1);
    expect(top).toBeDefined();
    expect(top!.anchor.y).toBe(0);
    // Anchored at the screen's top-right corner, then shifted by image-relative offsets.
    expect(top!.position.x).toBeCloseTo(1280 + 510 * 0.1, 5);
    expect(top!.position.y).toBeCloseTo(0 + 396 * -0.5, 5);
    expect(top!.width).toBeCloseTo(510, 5);
    expect(top!.height).toBeCloseTo(510, 5);
    screen.destroy();
  });

  it('positions main-bottom at the bottom edge, partly off the left', () => {
    const screen = new StartScreen();
    screen.mount(host);
    loadAll();

    const bottom = sprites((screen as unknown as { root: Container }).root!).find((s) => s.anchor.x === 0);
    expect(bottom).toBeDefined();
    expect(bottom!.anchor.y).toBe(1);
    // Anchored at the screen's bottom-left corner, then shifted by image-relative offsets.
    expect(bottom!.position.x).toBeCloseTo(0 + 589 * -0.05, 5);
    expect(bottom!.position.y).toBeCloseTo(800 + 599 * 0.1, 5);
    expect(bottom!.width).toBeCloseTo(589, 5);
    expect(bottom!.height).toBeCloseTo(589, 5);
    screen.destroy();
  });

  it('renders both background images at the same relative scale', () => {
    const screen = new StartScreen();
    screen.mount(host);
    loadAll();

    const [top, bottom] = sprites((screen as unknown as { root: Container }).root!);
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    // Both at the same pixels-per-image scale; heights follow the texture
    // aspect ratio (the mock texture is square, so height equals width).
    expect(top!.width / 510).toBeCloseTo(bottom!.width / 589, 5);
    expect(top!.height / 510).toBeCloseTo(bottom!.height / 589, 5);
    expect(top!.width / 510).toBeCloseTo(1, 5);
    expect(bottom!.width / 589).toBeCloseTo(1, 5);
    screen.destroy();
  });

  it('keeps the aspect ratio of each background texture', () => {
    const screen = new StartScreen();
    screen.mount(host);
    loadAll();
    const [top, bottom] = sprites((screen as unknown as { root: Container }).root!);
    expect(top!.height / top!.width).toBeCloseTo(1, 5);
    expect(bottom!.height / bottom!.width).toBeCloseTo(1, 5);
    screen.destroy();
  });

  it('adds both background images as the first children, behind the menu', () => {
    const screen = new StartScreen();
    screen.mount(host);
    loadAll();
    const root = (screen as unknown as { root: Container }).root!;
    expect(sprites(root).length).toBe(2);
    expect(root.children.indexOf(sprites(root)[0]!)).toBeLessThan(root.children.length - 1);
    screen.destroy();
  });

  it('shows a Tutorial button alongside Single player and Multiplayer', () => {
    const screen = new StartScreen();
    screen.mount(host);
    const buttons = (screen as unknown as { buttons: unknown[] }).buttons;
    const labels = buttons.map((b) => {
      const btn = b as { children: { text?: string }[] };
      const t = btn.children.find((c) => typeof c.text === 'string');
      return (t?.text as string) ?? '';
    });
    expect(labels).toContain('Single player');
    expect(labels).toContain('Multiplayer');
    expect(labels).toContain('Tutorial');
    screen.destroy();
  });
});
