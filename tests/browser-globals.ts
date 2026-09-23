// pixi.js reads browser globals such as `navigator` at module import time
// (e.g. isSafari() inside glUploadVideoResource). Node 20 has no `navigator`
// global, and ESM imports are hoisted, so a stub placed after an import is too
// late. This file defines the globals and MUST run before any module that
// imports pixi.js — list it before tests/setup.ts in vitest's setupFiles.

const noop = (): void => {};
const fakeNavigator = { userAgent: 'vitest', platform: 'node', language: 'en-US' } as Navigator;

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