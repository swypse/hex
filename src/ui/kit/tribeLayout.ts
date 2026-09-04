import type { Container } from 'pixi.js';

export const TRIBE_DIAM = 56;
export const TRIBE_GAP = 16;
export const TRIBE_STEP = TRIBE_DIAM + TRIBE_GAP;
export const TRIBE_ROW_STEP = 88;

export interface TribeSlot {
  x: number;
  y: number;
}

export function tribeSlots(count: number, availWidth: number): { slots: TribeSlot[]; rows: number } {
  const singleRowW = count * TRIBE_DIAM + (count - 1) * TRIBE_GAP;
  let rowSizes: number[];
  if (availWidth >= singleRowW) {
    rowSizes = [count];
  } else {
    const top = Math.ceil(count / 2);
    rowSizes = top >= count ? [count] : [top, count - top];
  }
  const slots: TribeSlot[] = [];
  rowSizes.forEach((size, r) => {
    const rowW = size * TRIBE_DIAM + (size - 1) * TRIBE_GAP;
    const y = r * TRIBE_ROW_STEP;
    for (let c = 0; c < size; c += 1) {
      slots.push({ x: -rowW / 2 + TRIBE_DIAM / 2 + c * TRIBE_STEP, y });
    }
  });
  return { slots, rows: rowSizes.length };
}

export function positionTribes(cx: number, row1CenterY: number, items: readonly Container[], availWidth: number): number {
  const { slots, rows } = tribeSlots(items.length, availWidth);
  items.forEach((item, i) => {
    const s = slots[i]!;
    item.position.set(cx + s.x, row1CenterY + s.y);
  });
  return rows;
}
