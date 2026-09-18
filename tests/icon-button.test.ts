import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IconButton } from '../src/ui/kit/icon-button';
import { THEME } from '../src/ui/kit/theme';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}

function fillOf(btn: IconButton): number {
  return (btn as unknown as { bg: { context: { fillStyle: { color: number } } } }).bg.context.fillStyle.color;
}

function fillAlphaOf(btn: IconButton): number {
  return (btn as unknown as { bg: { context: { fillStyle: { alpha: number } } } }).bg.context.fillStyle.alpha;
}

describe('IconButton', () => {
  let btn: IconButton;

  beforeEach(() => {
    (globalThis as { Image?: unknown }).Image = FakeImage;
    btn = new IconButton({ icon: 'x.png', onClick: () => {} });
  });

  afterEach(() => {
    btn.destroy({ children: true });
  });

  it('does not change size on press', () => {
    btn.emit('pointerdown', {} as never);
    expect(btn.scale.x).toBe(1);
    expect(btn.scale.y).toBe(1);
  });

  it('darkens the fill while pressed', () => {
    btn.emit('pointerdown', {} as never);
    expect(fillOf(btn)).toBe(THEME.buttonPressed);
  });

  it('restores the normal fill on release when not hovered', () => {
    btn.emit('pointerdown', {} as never);
    btn.emit('pointerup', {} as never);
    expect(fillOf(btn)).toBe(THEME.button);
  });

  it('restores the hover fill on release when hovered', () => {
    btn.emit('pointerover', {} as never);
    btn.emit('pointerdown', {} as never);
    btn.emit('pointerup', {} as never);
    expect(fillOf(btn)).toBe(THEME.buttonHover);
  });

  it('brightens on hover and restores on out', () => {
    btn.emit('pointerover', {} as never);
    expect(fillOf(btn)).toBe(THEME.buttonHover);
    btn.emit('pointerout', {} as never);
    expect(fillOf(btn)).toBe(THEME.button);
  });

  it('ignores press when disabled', () => {
    btn.disabled = true;
    btn.emit('pointerdown', {} as never);
    expect(btn.scale.x).toBe(1);
    expect(fillOf(btn)).toBe(THEME.button);
  });

  it('supports alpha-tinted fills for base, hover and pressed', () => {
    const alpha = new IconButton({
      icon: 'x.png',
      onClick: () => {},
      color: { color: 0x000000, alpha: 0.2 },
      hoverColor: { color: 0x000000, alpha: 0.4 },
      pressedColor: { color: 0x000000, alpha: 0.4 },
    });
    expect(fillOf(alpha)).toBe(0x000000);
    expect(fillAlphaOf(alpha)).toBe(0.2);
    alpha.emit('pointerover', {} as never);
    expect(fillAlphaOf(alpha)).toBe(0.4);
    alpha.emit('pointerdown', {} as never);
    expect(fillAlphaOf(alpha)).toBe(0.4);
    alpha.destroy({ children: true });
  });
});
