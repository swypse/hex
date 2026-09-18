import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { makeTribeOption } from '../src/ui/kit/tribe-option';
import { TRIBE_COLORS } from '../src/config';

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
});