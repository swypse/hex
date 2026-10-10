import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BitmapText, Container, Sprite } from 'pixi.js';
import { VeteranBonusDialog } from '../src/ui/overlays/veteran-bonus-dialog';
import { Button } from '../src/ui/kit/button';
import { useGameStore } from '../src/store/game-store';
import { type UIHost } from '../src/ui/host';
import { OverlayKind } from '@enums';

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

function findAll<T>(root: Container, test: (c: unknown) => c is T): T[] {
  const out: T[] = [];
  const walk = (n: Container): void => {
    for (const c of n.children) {
      if (test(c)) out.push(c);
      if (c instanceof Container) walk(c);
    }
  };
  walk(root);
  return out;
}

describe('VeteranBonusDialog', () => {
  beforeEach(() => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    useGameStore.setState({ overlay: { kind: OverlayKind.VETERAN_BONUS, unitId: 'u1' } });
  });

  afterEach(() => {
    useGameStore.setState({ overlay: null });
  });

  it('offers +5 / +10 / +20 as an icon followed by the number', () => {
    const host = { app: { screen: { width: 800, height: 600 } }, screenLayer: new Container(), overlayLayer: new Container() } as unknown as UIHost;
    const root = new Container();
    const dialog = new VeteranBonusDialog();
    dialog.mount(host, root);
    const buttons = findAll(root, (c): c is Button => c instanceof Button);
    expect(buttons).toHaveLength(3);
    const texts = buttons.map((b) => String(findAll(b, (c): c is BitmapText => c instanceof BitmapText)[0]!.text));
    expect(texts).toEqual(['+5', '+10', '+20']);
    for (const b of buttons) {
      const sprites = findAll(b, (c): c is Sprite => c instanceof Sprite);
      expect(sprites).toHaveLength(1);
      const text = findAll(b, (c): c is BitmapText => c instanceof BitmapText)[0]!;
      expect(sprites[0]!.x).toBeLessThan(text.x);
    }
    dialog.destroy();
  });
});
