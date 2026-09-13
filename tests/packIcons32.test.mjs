import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, finalizeAtlas } from '../tools/packSkills.mjs';
import {
  generateIcons32Atlas,
  ICONS32_ORDER,
  ICONS32_COLS,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packIcons32.mjs';

const CELL = 32;

describe('icons-32 atlas generation', () => {
  const FILES = readdirSync(SOURCE_DIR_URL)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -4))
    .sort();

  it('covers exactly the PNG files in the 32 dir, exactly once', () => {
    expect(ICONS32_ORDER.length).toBe(FILES.length);
    expect([...new Set(ICONS32_ORDER)]).toEqual(ICONS32_ORDER);
    expect(ICONS32_ORDER).toEqual(FILES);
  });

  it('is deterministic: two runs produce identical PNG bytes and manifest', () => {
    const a = generateIcons32Atlas(SOURCE_DIR_URL, ICONS32_COLS);
    const b = generateIcons32Atlas(SOURCE_DIR_URL, ICONS32_COLS);
    expect(Buffer.compare(a.png, b.png)).toBe(0);
    expect(a.manifestTs).toBe(b.manifestTs);
  });

  it('returns non-overlapping 32x32 frames inside the atlas bounds', () => {
    const { frames, width, height } = generateIcons32Atlas(SOURCE_DIR_URL, ICONS32_COLS);
    const rows = Math.ceil(FILES.length / ICONS32_COLS);
    expect(width).toBe(ICONS32_COLS * CELL);
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
    const final = await finalizeAtlas(generateIcons32Atlas(SOURCE_DIR_URL, ICONS32_COLS).png);
    expect(Buffer.compare(committed, final)).toBe(0);
  });

  it('references only real, valid 32x32 icons', () => {
    const { frames } = generateIcons32Atlas(SOURCE_DIR_URL, ICONS32_COLS);
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      const src = readFileSync(fileURLToPath(new URL(`${id}.png`, SOURCE_DIR_URL)));
      const png = decodePng(src);
      expect([png.width, png.height]).toEqual([CELL, CELL]);
    }
  });
});