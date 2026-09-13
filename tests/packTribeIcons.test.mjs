import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, finalizeAtlas } from '../tools/packSkills.mjs';
import {
  generateTribeIconsAtlas,
  TRIBE_ICON_ORDER,
  TRIBE_ICON_COLS,
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
    expect(width).toBe(TRIBE_ICON_COLS * CELL);
    expect(height).toBe(rows * CELL);
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

  it('keeps the committed atlas PNG in sync with the packer output', async () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const final = await finalizeAtlas(generateTribeIconsAtlas(SOURCE_DIR_URL, TRIBE_ICON_COLS).png);
    expect(Buffer.compare(committed, final)).toBe(0);
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