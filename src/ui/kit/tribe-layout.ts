import type { Container } from 'pixi.js';

const TRIBE_DIAM = 56;
export const TRIBE_GAP = 16;
const TRIBE_STEP = TRIBE_DIAM + TRIBE_GAP;
export const TRIBE_ROW_STEP = 88;

interface TribeSlot {
  x: number;
  y: number;
}

export function tribeSlots(count: number, gap = TRIBE_GAP): { slots: TribeSlot[]; rows: number } {
  const step = TRIBE_DIAM + gap;
  const top = Math.ceil(count / 2);
  const rowSizes = top >= count ? [count] : [top, count - top];
  const slots: TribeSlot[] = [];
  rowSizes.forEach((size, r) => {
    const rowW = size * TRIBE_DIAM + (size - 1) * gap;
    const y = r * TRIBE_ROW_STEP;
    for (let c = 0; c < size; c += 1) {
      slots.push({ x: -rowW / 2 + TRIBE_DIAM / 2 + c * step, y });
    }
  });
  return { slots, rows: rowSizes.length };
}

export function positionTribes(cx: number, row1CenterY: number, items: readonly Container[], gap = TRIBE_GAP): number {
  const { slots, rows } = tribeSlots(items.length, gap);
  items.forEach((item, i) => {
    const s = slots[i]!;
    item.position.set(cx + s.x, row1CenterY + s.y);
  });
  return rows;
}
