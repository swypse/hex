import { BitmapFont } from 'pixi.js';

const noop = (): void => {};
const fakeNavigator = { userAgent: 'vitest', platform: 'node', language: 'en-US' } as Navigator;

// pixi.js reads these browser globals at import time; stub them for the node test env.
(globalThis as Record<string, unknown>).navigator ??= fakeNavigator;
(globalThis as Record<string, unknown>).window ??= {
  removeEventListener: noop,
  addEventListener: noop,
  devicePixelRatio: 1,
  localStorage: {
    getItem: () => null,
    setItem: noop,
    removeItem: noop,
    clear: noop,
    key: () => null,
    length: 0,
  },
} as unknown as Window;

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}
(globalThis as Record<string, unknown>).Image ??= FakeImage;

function range(from: number, to: number): string {
  let out = '';
  for (let c = from; c <= to; c++) out += String.fromCharCode(c);
  return out;
}

const TEST_FONT_CHARS =
  range(0x20, 0x7e) +
  range(0x00a0, 0x00ff) +
  '\u0401' + range(0x0410, 0x044f) + '\u0451' + '\u2116' +
  '\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026' +
  range(0x2190, 0x2193) +
  '\u2212\u2713';

const fakeCanvasContext = () => ({
  measureText: (s: string) => ({
    width: s.length * 8,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: s.length * 8,
    actualBoundingBoxAscent: 12,
    actualBoundingBoxDescent: 3,
  }),
  fillText: noop,
  strokeText: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
  createPattern: () => ({}),
  getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  putImageData: noop,
  setTransform: noop,
  translate: noop,
  scale: noop,
  rotate: noop,
});

(globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D ??= class {};
(globalThis as { document?: unknown }).document ??= {
  createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
};

BitmapFont.install({ name: 'Roboto Regular', style: { fontSize: 16, fill: 0xffffff }, chars: TEST_FONT_CHARS });
BitmapFont.install({ name: 'Roboto Black', style: { fontSize: 16, fill: 0xffffff }, chars: TEST_FONT_CHARS });
