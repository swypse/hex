import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Graphics, Text } from 'pixi.js';
import { Button } from '../src/ui/kit/button';
import { THEME } from '../src/ui/kit/theme';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}

function fillOf(btn: Button): number {
  return (btn as unknown as { bg: { context: { fillStyle: { color: number } } } }).bg.context.fillStyle.color;
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

  it('still draws a border when selected', () => {
    const bg = (btn as unknown as { bg: Graphics }).bg;
    const stroke = vi.spyOn(bg, 'stroke');
    btn.selected = true;
    expect(stroke).not.toHaveBeenCalled();
  });

  it('fills a selected button with the selected color', () => {
    btn.selected = true;
    expect(fillOf(btn)).toBe(THEME.buttonSelected);
  });

  it('restores the idle fill when deselected', () => {
    btn.selected = true;
    btn.selected = false;
    expect(fillOf(btn)).toBe(THEME.button);
  });

  it('keeps the selected fill while hovered', () => {
    btn.selected = true;
    btn.emit('pointerover', {} as never);
    expect(fillOf(btn)).toBe(THEME.buttonSelected);
  });
});
