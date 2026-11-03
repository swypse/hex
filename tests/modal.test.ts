import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { Modal } from '../src/ui/kit/modal';

describe('Modal', () => {
  let listeners: Record<string, (e: KeyboardEvent) => void>;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    listeners = {};
    (globalThis as unknown as { window: Window }).window.addEventListener = ((type: string, cb: (e: KeyboardEvent) => void) => {
      listeners[type] = cb;
    }) as typeof window.addEventListener;
    (globalThis as unknown as { window: Window }).window.removeEventListener = ((type: string) => {
      delete listeners[type];
    }) as typeof window.removeEventListener;
  });

  const fakeApp = { screen: { width: 800, height: 600 } } as never;
  const keydown = (key: string): void => {
    listeners.keydown?.({ key, preventDefault: () => {} } as KeyboardEvent);
  };

  it('closes on Escape', () => {
    const close = vi.fn();
    const modal = new Modal({ app: fakeApp, title: 't', lines: [], onClose: close });
    keydown('Escape');
    expect(close).toHaveBeenCalled();
    modal.destroy();
  });

  it('closes on Enter when closeOnEnter is set', () => {
    const close = vi.fn();
    const modal = new Modal({ app: fakeApp, title: 't', lines: [], onClose: close, closeOnEnter: true });
    keydown('Enter');
    expect(close).toHaveBeenCalled();
    modal.destroy();
  });

  it('does not close on Enter by default', () => {
    const close = vi.fn();
    const modal = new Modal({ app: fakeApp, title: 't', lines: [], onClose: close });
    keydown('Enter');
    expect(close).not.toHaveBeenCalled();
    modal.destroy();
  });

  it('removes its keydown listener on destroy', () => {
    const close = vi.fn();
    const modal = new Modal({ app: fakeApp, title: 't', lines: [], onClose: close });
    modal.destroy();
    expect(listeners.keydown).toBeUndefined();
  });
});
