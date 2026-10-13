import { describe, expect, it } from 'vitest';
import { BitmapText, Container, Graphics } from 'pixi.js';
import { makeTribeOption } from '../src/ui/kit/tribe-option';
import { TRIBE_COLORS } from '../src/config';
import { TRIBE_STARS_HEIGHT } from '../src/ui/kit/tribe-layout';

interface StrokeInstr {
  style?: { color?: number; width?: number; alignment?: number };
}

function strokesOf(circle: Graphics): StrokeInstr[] {
  return (circle as unknown as { context?: { instructions?: { action: string; data?: StrokeInstr }[] } })
    .context?.instructions
    ?.filter((i) => i.action === 'stroke')
    .map((i) => i.data)
    .filter((d): d is StrokeInstr => d !== undefined) ?? [];
}

function fillRadius(circle: Graphics): number {
  const fill = (circle as unknown as { context?: { instructions?: Array<{ action: string; data?: { style?: unknown; path?: { shapePath?: { shapePrimitives?: Array<{ shape?: { radius?: number } }> } } } }> } })
    .context?.instructions
    ?.find((i) => i.action === 'fill');
  const prims = fill?.data?.path?.shapePath?.shapePrimitives ?? [];
  return prims[0]?.shape?.radius ?? 0;
}

describe('makeTribeOption selection', () => {
  it('strokes the circle with the tribe color, 4px outer, without moving the circle', () => {
    const opt = makeTribeOption('Cats', 'cats-icon.png', () => {}, true, TRIBE_COLORS.Cats);
    const circle = (opt.el as Container).children.find((c) => c instanceof Graphics) as Graphics;

    const [stroke] = strokesOf(circle);
    expect(stroke?.style?.color).toBe(TRIBE_COLORS.Cats);
    expect(stroke?.style?.width).toBe(4);
    // alignment = 0 (outside): stroke drawn outside the radius, so adding it
    // neither shrinks the fill nor shifts the circle centre.
    expect(stroke?.style?.alignment).toBe(0);
    expect(fillRadius(circle)).toBe(28);
  });

  it('keeps the same circle geometry whether selected or not', () => {
    const a = makeTribeOption('Cats', 'cats-icon.png', () => {}, false, TRIBE_COLORS.Cats);
    const b = makeTribeOption('Cats', 'cats-icon.png', () => {}, true, TRIBE_COLORS.Cats);
    const circleA = (a.el as Container).children.find((c) => c instanceof Graphics) as Graphics;
    const circleB = (b.el as Container).children.find((c) => c instanceof Graphics) as Graphics;
    expect(fillRadius(circleA)).toBe(28);
    expect(fillRadius(circleB)).toBe(28);
  });

  it('wraps a two-word tribe name onto two stacked label lines', () => {
    const opt = makeTribeOption('Sand people', 'sand-icon.png', () => {}, false, TRIBE_COLORS.Sand);
    const texts = (opt.el as Container).children.filter((c) => c instanceof BitmapText).map((c) => String((c as BitmapText).text));
    expect(texts).toEqual(['Sand', 'people']);
    // Two lines: bottom line sits one line-height below the top one.
    const labels = (opt.el as Container).children.filter((c) => c instanceof BitmapText) as BitmapText[];
    expect(labels[1]!.position.y).toBe(labels[0]!.position.y + 14 + 2);
    // labelHeight covers both lines plus the star row; label is the top line.
    expect(opt.labelHeight).toBe(14 * 2 + 2 + TRIBE_STARS_HEIGHT);
    expect(opt.label).toBe(labels[0]);
  });

  it('keeps a single-word tribe name on one line', () => {
    const opt = makeTribeOption('Cats', 'cats-icon.png', () => {}, false, TRIBE_COLORS.Cats);
    const texts = (opt.el as Container).children.filter((c) => c instanceof BitmapText).map((c) => String((c as BitmapText).text));
    expect(texts).toEqual(['Cats']);
    expect(opt.labelHeight).toBe(14 + TRIBE_STARS_HEIGHT);
  });
});

describe('makeTribeOption stars', () => {
  const starRow = (opt: ReturnType<typeof makeTribeOption>): Container =>
    (opt.el as Container).children.filter((c) => c instanceof Container && !(c instanceof Graphics) && !(c instanceof BitmapText))
      .find((c) => c.eventMode === 'none') as Container;

  it('draws no stars by default and keeps their room reserved', () => {
    const opt = makeTribeOption('Cats', 'cats-icon.png', () => {}, false, TRIBE_COLORS.Cats);
    expect(starRow(opt).children).toHaveLength(0);
    expect(opt.labelHeight).toBe(14 + TRIBE_STARS_HEIGHT);
  });

  it('draws three stars under the name, as many filled as the best result', () => {
    const opt = makeTribeOption('Cats', 'cats-icon.png', () => {}, false, TRIBE_COLORS.Cats, 2);
    const row = starRow(opt);
    expect(row.children).toHaveLength(3);
    const name = (opt.el as Container).children.find((c) => c instanceof BitmapText) as BitmapText;
    expect(row.position.y).toBeGreaterThan(name.position.y + 14);
    opt.setStars(null);
    expect(row.children).toHaveLength(0);
    opt.setStars(0);
    expect(row.children).toHaveLength(3);
  });
});