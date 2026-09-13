import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text } from 'pixi.js';
import { ButtonGroup } from '../src/ui/kit/buttonGroup';
import { THEME } from '../src/ui/kit/theme';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}

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

function fillOf(btn: { bg: { context: { fillStyle: { color: number } } } }): number {
  return btn.bg.context.fillStyle.color;
}

describe('ButtonGroup', () => {
  let group: ButtonGroup;

  beforeEach(() => {
    (globalThis as { Image?: unknown }).Image = FakeImage;
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    group = new ButtonGroup({
      items: [
        { label: 'A', onClick: () => {} },
        { label: 'B', onClick: () => {} },
        { label: 'C', onClick: () => {} },
      ],
    });
    group.position.set(0, 0);
  });

  afterEach(() => {
    group.destroy({ children: true });
  });

  it('highlights the active button with the selected color', () => {
    group.buttons[1]!.selected = true;
    expect(fillOf(group.buttons[1]! as unknown as { bg: { context: { fillStyle: { color: number } } } })).toBe(
      THEME.buttonSelected,
    );
    expect(fillOf(group.buttons[0]! as unknown as { bg: { context: { fillStyle: { color: number } } } })).toBe(
      THEME.button,
    );
  });

  it('moves the highlight when the active button changes', () => {
    group.buttons[0]!.selected = true;
    group.buttons[2]!.selected = true;
    group.buttons[0]!.selected = false;
    expect(fillOf(group.buttons[2]! as unknown as { bg: { context: { fillStyle: { color: number } } } })).toBe(
      THEME.buttonSelected,
    );
    expect(fillOf(group.buttons[0]! as unknown as { bg: { context: { fillStyle: { color: number } } } })).toBe(
      THEME.button,
    );
  });
});