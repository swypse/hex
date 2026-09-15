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

  it('positions main-bg centered at the bottom edge, 100px below the screen', () => {
    const screen = new StartScreen();
    screen.mount(host);
    const load = FakeImage.instances.find((i) => i.src.includes('main-bg.png'))!;
    load.onload!.call(load);

    const bg = sprites((screen as unknown as { root: Container }).root!).find((s) => s.anchor.x === 0.5);
    expect(bg).toBeDefined();
    expect(bg!.anchor.y).toBe(1);
    // Anchored at the screen's bottom-centre, then dropped 100px lower.
    expect(bg!.position.x).toBeCloseTo(640, 5);
    expect(bg!.position.y).toBeCloseTo(800 + 100, 5);
    screen.destroy();
  });

  it('adds the single background image as the first child, behind the menu', () => {
    const screen = new StartScreen();
    screen.mount(host);
    loadAll();
    const root = (screen as unknown as { root: Container }).root!;
    const bgs = sprites(root);
    expect(bgs.length).toBe(1);
    expect(root.children.indexOf(bgs[0]!)).toBeLessThan(root.children.length - 1);
    screen.destroy();
  });

  it('shows a Tutorial button alongside Single player and Multiplayer', () => {
    const screen = new StartScreen();
    screen.mount(host);
    const buttons = (screen as unknown as { buttons: unknown[] }).buttons;
    const labels = buttons.map((b) => {
      const btn = b as { children: { text?: string }[] };
      const t = btn.children.find((c) => typeof c.text === 'string');
      return ((t?.text as string) ?? '').toUpperCase();
    });
    expect(labels).toContain('SINGLE PLAYER');
    expect(labels).toContain('MULTIPLAYER');
    expect(labels).toContain('TUTORIAL');
    screen.destroy();
  });
});

function buttonByLabel(root: Container, label: string): unknown {
  function walk(o: Container): unknown {
    if (!o || (o as { destroyed?: boolean }).destroyed) return null;
    const kids = (o as { children?: unknown[] }).children ?? [];
    const textChild = kids.find((c) => typeof (c as { text?: unknown }).text === 'string') as
      | { text?: string }
      | undefined;
    if (textChild) {
      const text = textChild.text;
      if (text && text.toUpperCase() === label.toUpperCase()) return o;
    }
    for (const c of kids) {
      const hit = walk(c as Container);
      if (hit) return hit;
    }
    return null;
  }
  return walk(root);
}

describe('StartScreen settings popup close button', () => {
  let host: UIHost;
  let screen: StartScreen;
  let root: Container;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { Image?: unknown }).Image = FakeImage;
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
    screen = new StartScreen();
    screen.mount(host);
    root = (screen as unknown as { root: Container }).root!;
  });

  afterEach(() => {
    screen.destroy();
  });

  it('closes the settings popup when its Close button is pressed', () => {
    const open = buttonByLabel(root, 'Settings') as { trigger(): void };
    expect(open).toBeDefined();
    open.trigger();

    const close = buttonByLabel(root, 'Close');
    expect(close).toBeDefined();
    expect(() => (close as { trigger(): void }).trigger()).not.toThrow();

    expect(buttonByLabel(root, 'Close')).toBeNull();
  });

  it('closes the About popup when its Close button is pressed', () => {
    const open = buttonByLabel(root, 'About') as { trigger(): void };
    open.trigger();

    const close = buttonByLabel(root, 'Close');
    expect(close).toBeDefined();
    expect(() => (close as { trigger(): void }).trigger()).not.toThrow();

    expect(buttonByLabel(root, 'Close')).toBeNull();
  });
});
