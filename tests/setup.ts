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
