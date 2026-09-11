import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../tools/packSkills.mjs';
import {
  generateAchievementAtlas,
  ACHIEVEMENT_ORDER,
  ACHIEVEMENT_COLS,
  ACHIEVEMENT_CELL,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packAchievements.mjs';

describe('achievement atlas generation', () => {
  const FILES = readdirSync(SOURCE_DIR_URL)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -4))
    .sort();

  it('covers exactly the PNG files in the achievements dir, exactly once', () => {
    expect(ACHIEVEMENT_ORDER.length).toBe(FILES.length);
    expect([...new Set(ACHIEVEMENT_ORDER)]).toEqual(ACHIEVEMENT_ORDER);
    expect(ACHIEVEMENT_ORDER).toEqual(FILES);
  });

  it('is deterministic: two runs produce identical PNG bytes and manifest', () => {
    const a = generateAchievementAtlas(SOURCE_DIR_URL, ACHIEVEMENT_COLS);
    const b = generateAchievementAtlas(SOURCE_DIR_URL, ACHIEVEMENT_COLS);
    expect(Buffer.compare(a.png, b.png)).toBe(0);
    expect(a.manifestTs).toBe(b.manifestTs);
  });

  it('returns non-overlapping 164x164 frames inside the atlas bounds', () => {
    const { frames, width, height } = generateAchievementAtlas(SOURCE_DIR_URL, ACHIEVEMENT_COLS);
    const rows = Math.ceil(FILES.length / ACHIEVEMENT_COLS);
    expect(width).toBe(ACHIEVEMENT_COLS * ACHIEVEMENT_CELL);
    expect(height).toBe(rows * ACHIEVEMENT_CELL);
    const seen = new Set();
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      expect(f.w).toBe(ACHIEVEMENT_CELL);
      expect(f.h).toBe(ACHIEVEMENT_CELL);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + ACHIEVEMENT_CELL).toBeLessThanOrEqual(width);
      expect(f.y + ACHIEVEMENT_CELL).toBeLessThanOrEqual(height);
      for (let yy = f.y; yy < f.y + ACHIEVEMENT_CELL; yy++) {
        for (let xx = f.x; xx < f.x + ACHIEVEMENT_CELL; xx++) {
          expect(seen.has(`${xx},${yy}`)).toBe(false);
          seen.add(`${xx},${yy}`);
        }
      }
    }
  });

  it('keeps the committed atlas PNG in sync with the packer output', () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const { png } = generateAchievementAtlas(SOURCE_DIR_URL, ACHIEVEMENT_COLS);
    expect(Buffer.compare(committed, png)).toBe(0);
  });

  it('references only real, valid 164x164 achievement icons', () => {
    const { frames } = generateAchievementAtlas(SOURCE_DIR_URL, ACHIEVEMENT_COLS);
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      const src = readFileSync(fileURLToPath(new URL(`${id}.png`, SOURCE_DIR_URL)));
      const png = decodePng(src);
      expect([png.width, png.height]).toEqual([ACHIEVEMENT_CELL, ACHIEVEMENT_CELL]);
    }
  });
});