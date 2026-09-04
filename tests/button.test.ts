import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text } from 'pixi.js';
import { Button } from '../src/ui/kit/button';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}

describe('Button', () => {
  let btn: Button;

  beforeEach(() => {
    (globalThis as { Image?: unknown }).Image = FakeImage;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    btn = new Button({ label: '1', onClick: () => {} });
  });

  afterEach(() => {
    btn.destroy({ children: true });
  });

  it('does not change size on press', () => {
    btn.emit('pointerdown', {} as never);
    expect(btn.scale.x).toBe(1);
    expect(btn.scale.y).toBe(1);
    btn.emit('pointerup', {} as never);
    expect(btn.scale.x).toBe(1);
  });
});
