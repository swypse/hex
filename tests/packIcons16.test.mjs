import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, finalizeAtlas } from '../tools/packSkills.mjs';
import {
  generateIcons16Atlas,
  ICONS16_ORDER,
  ICONS16_COLS,
  ICONS16_CELL,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packIcons16.mjs';

describe('icons16 atlas generation', () => {
  const FILES = readdirSync(SOURCE_DIR_URL)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -4))
    .sort();

  it('covers exactly the PNG files in the 16 dir, exactly once', () => {
    expect(ICONS16_ORDER.length).toBe(FILES.length);
    expect([...new Set(ICONS16_ORDER)]).toEqual(ICONS16_ORDER);
    expect(ICONS16_ORDER).toEqual(FILES);
  });

  it('is deterministic: two runs produce identical PNG bytes and manifest', () => {
    const a = generateIcons16Atlas(SOURCE_DIR_URL, ICONS16_COLS);
    const b = generateIcons16Atlas(SOURCE_DIR_URL, ICONS16_COLS);
    expect(Buffer.compare(a.png, b.png)).toBe(0);
    expect(a.manifestTs).toBe(b.manifestTs);
  });

  it('lays out the icons in a single row of 16x16 cells', () => {
    const { frames, width, height } = generateIcons16Atlas(SOURCE_DIR_URL, ICONS16_COLS);
    expect(width).toBe(ICONS16_COLS * ICONS16_CELL);
    expect(height).toBe(ICONS16_CELL);
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      expect([f.w, f.h]).toEqual([ICONS16_CELL, ICONS16_CELL]);
      expect(f.y).toBe(0);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x + ICONS16_CELL).toBeLessThanOrEqual(width);
    }
  });

  it('keeps the committed atlas PNG in sync with the packer output', async () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const final = await finalizeAtlas(generateIcons16Atlas(SOURCE_DIR_URL, ICONS16_COLS).png);
    expect(Buffer.compare(committed, final)).toBe(0);
  });

  it('references only real, valid 16x16 icons', () => {
    const { frames } = generateIcons16Atlas(SOURCE_DIR_URL, ICONS16_COLS);
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      const src = readFileSync(fileURLToPath(new URL(`${id}.png`, SOURCE_DIR_URL)));
      const png = decodePng(src);
      expect([png.width, png.height]).toEqual([ICONS16_CELL, ICONS16_CELL]);
    }
  });
});