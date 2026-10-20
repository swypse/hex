import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, finalizeAtlas, atlasPngsMatch } from '../tools/packSkills.mjs';
import {
  generateTribeIconsAtlas,
  TRIBE_ICON_ORDER,
  TRIBE_ICON_COLS,
  TRIBE_ICON_GAP,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packTribeIcons.mjs';

const CELL = 120;

describe('tribe icons atlas generation', () => {
  const FILES = readdirSync(SOURCE_DIR_URL)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -4))
    .sort();

  it('covers exactly the PNG files in the tribe-icons dir, exactly once', () => {
    expect(TRIBE_ICON_ORDER.length).toBe(FILES.length);
    expect([...new Set(TRIBE_ICON_ORDER)]).toEqual(TRIBE_ICON_ORDER);
    expect(TRIBE_ICON_ORDER).toEqual(FILES);
  });

  it('is deterministic: two runs produce identical PNG bytes and manifest', () => {
    const a = generateTribeIconsAtlas(SOURCE_DIR_URL, TRIBE_ICON_COLS);
    const b = generateTribeIconsAtlas(SOURCE_DIR_URL, TRIBE_ICON_COLS);
    expect(Buffer.compare(a.png, b.png)).toBe(0);
    expect(a.manifestTs).toBe(b.manifestTs);
  });

  it('returns non-overlapping 120x120 frames inside the atlas bounds', () => {
    const { frames, width, height } = generateTribeIconsAtlas(SOURCE_DIR_URL, TRIBE_ICON_COLS);
    const rows = Math.ceil(FILES.length / TRIBE_ICON_COLS);
    const pitch = CELL + 2 * TRIBE_ICON_GAP;
    expect(width).toBe(TRIBE_ICON_COLS * pitch);
    expect(height).toBe(rows * pitch);
    const seen = new Set();
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      expect(f.w).toBe(CELL);
      expect(f.h).toBe(CELL);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + CELL).toBeLessThanOrEqual(width);
      expect(f.y + CELL).toBeLessThanOrEqual(height);
      seen.add(`${f.x},${f.y}`);
    }
    expect(seen.size).toBe(FILES.length);
  });

  it('keeps a transparent gap between neighbouring icons and around the edge', () => {
    const { frames, rgba, width } = generateTribeIconsAtlas(SOURCE_DIR_URL, TRIBE_ICON_COLS);
    expect(TRIBE_ICON_GAP).toBeGreaterThanOrEqual(1);
    for (const id of FILES) {
      const f = frames[id];
      expect(f.x % (CELL + 2 * TRIBE_ICON_GAP)).toBe(TRIBE_ICON_GAP);
      expect(f.y % (CELL + 2 * TRIBE_ICON_GAP)).toBe(TRIBE_ICON_GAP);
      // the ring of pixels just outside the icon is fully transparent
      for (let g = 1; g <= TRIBE_ICON_GAP; g++) {
        for (let i = -g; i < CELL + g; i++) {
          for (const [px, py] of [[f.x + i, f.y - g], [f.x + i, f.y + CELL - 1 + g], [f.x - g, f.y + i], [f.x + CELL - 1 + g, f.y + i]]) {
            expect(rgba[(py * width + px) * 4 + 3]).toBe(0);
          }
        }
      }
    }
  });

  it('keeps the committed atlas PNG in sync with the packer output', async () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const final = await finalizeAtlas(generateTribeIconsAtlas(SOURCE_DIR_URL, TRIBE_ICON_COLS).png);
    expect(atlasPngsMatch(committed, final)).toBe(true);
  });

  it('references only real, valid 120x120 tribe icons', () => {
    const { frames } = generateTribeIconsAtlas(SOURCE_DIR_URL, TRIBE_ICON_COLS);
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      const src = readFileSync(fileURLToPath(new URL(`${id}.png`, SOURCE_DIR_URL)));
      const png = decodePng(src);
      expect([png.width, png.height]).toEqual([CELL, CELL]);
    }
  });
});