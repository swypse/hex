import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Graphics, Text } from 'pixi.js';
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
    vi.restoreAllMocks();
  });

  it('does not change size on press', () => {
    btn.emit('pointerdown', {} as never);
    expect(btn.scale.x).toBe(1);
    expect(btn.scale.y).toBe(1);
    btn.emit('pointerup', {} as never);
    expect(btn.scale.x).toBe(1);
  });

  it('does not draw a border on hover or press', () => {
    const bg = (btn as unknown as { bg: Graphics }).bg;
    const stroke = vi.spyOn(bg, 'stroke');
    btn.emit('pointerover', {} as never);
    expect(stroke).not.toHaveBeenCalled();
    btn.emit('pointerdown', {} as never);
    expect(stroke).not.toHaveBeenCalled();
    btn.emit('pointerup', {} as never);
    expect(stroke).not.toHaveBeenCalled();
  });

  it('still draws the selected border', () => {
    const bg = (btn as unknown as { bg: Graphics }).bg;
    const stroke = vi.spyOn(bg, 'stroke');
    btn.selected = true;
    expect(stroke).toHaveBeenCalled();
  });
});
