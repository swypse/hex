import { beforeEach, describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { HudScrim } from '../src/ui/hud/hud-scrim';
import { type UIHost } from '../src/ui/host';

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudScrim', () => {
  let host: UIHost;
  let root: Container;

  beforeEach(() => {
    host = makeHost();
    root = new Container();
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
  });

  it('top scrim: full-width 70px band at y 0, non-interactive', () => {
    const scrim = new HudScrim({ side: 'top' });
    scrim.mount(host, root);
    const el = (scrim as unknown as { el: Container }).el!;
    expect(el.eventMode).toBe('none');
    expect(el.position.y).toBe(0);
    const bounds = el.getLocalBounds();
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(1280);
    expect(bounds.height).toBe(70);
    scrim.destroy();
  });

  it('bottom scrim: full-width 70px band flush with the screen bottom', () => {
    const scrim = new HudScrim({ side: 'bottom' });
    scrim.mount(host, root);
    const el = (scrim as unknown as { el: Container }).el!;
    expect(el.position.y).toBe(800 - 70);
    const bounds = el.getLocalBounds();
    expect(bounds.width).toBe(1280);
    expect(bounds.height).toBe(70);
    scrim.destroy();
  });

  it('resizes the band with the screen width', () => {
    const handlers: Array<() => void> = [];
    const orig = window.addEventListener as unknown as (t: string, cb: unknown) => void;
    (window as unknown as { addEventListener: unknown }).addEventListener = ((t: string, cb: () => void): void => {
      if (t === 'resize') handlers.push(cb);
    }) as typeof window.addEventListener;
    try {
      const scrim = new HudScrim();
      scrim.mount(host, root);
      const el = (scrim as unknown as { el: Container }).el!;
      expect(el.getLocalBounds().width).toBe(1280);
      (host.app.screen as { width: number }).width = 1600;
      handlers.splice(0).forEach((h) => h());
      expect(el.getLocalBounds().width).toBe(1600);
      scrim.destroy();
    } finally {
      (window as unknown as { addEventListener: unknown }).addEventListener = orig;
    }
  });
});