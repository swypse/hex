import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, finalizeAtlas, atlasPngsMatch } from '../tools/packSkills.mjs';
import {
  generateBuildingsAtlas,
  BUILDINGS_ORDER,
  BUILDINGS_COLS,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packBuildings.mjs';

describe('buildings atlas generation', () => {
  const FILES = readdirSync(SOURCE_DIR_URL)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -4))
    .sort();
  const CELL_W = 256;
  const CELL_H = 448;

  it('covers exactly the PNG files in the buildings dir, exactly once', () => {
    expect(BUILDINGS_ORDER.length).toBe(FILES.length);
    expect([...new Set(BUILDINGS_ORDER)]).toEqual(BUILDINGS_ORDER);
    expect(BUILDINGS_ORDER).toEqual(FILES);
  });

  it('is deterministic: two runs produce identical PNG bytes and manifest', () => {
    const a = generateBuildingsAtlas(SOURCE_DIR_URL, BUILDINGS_COLS);
    const b = generateBuildingsAtlas(SOURCE_DIR_URL, BUILDINGS_COLS);
    expect(Buffer.compare(a.png, b.png)).toBe(0);
    expect(a.manifestTs).toBe(b.manifestTs);
  });

  it('returns non-overlapping 256x448 frames inside the atlas bounds', () => {
    const { frames, width, height } = generateBuildingsAtlas(SOURCE_DIR_URL, BUILDINGS_COLS);
    const rows = Math.ceil(FILES.length / BUILDINGS_COLS);
    expect(width).toBe(BUILDINGS_COLS * CELL_W);
    expect(height).toBe(rows * CELL_H);
    const seen = new Set();
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      expect(f.w).toBe(CELL_W);
      expect(f.h).toBe(CELL_H);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + CELL_W).toBeLessThanOrEqual(width);
      expect(f.y + CELL_H).toBeLessThanOrEqual(height);
      seen.add(`${f.x},${f.y}`);
    }
    expect(seen.size).toBe(FILES.length);
  });

  it('keeps the committed atlas PNG in sync with the packer output', async () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const final = await finalizeAtlas(generateBuildingsAtlas(SOURCE_DIR_URL, BUILDINGS_COLS).png);
    expect(atlasPngsMatch(committed, final)).toBe(true);
  });

  it('references only real, valid 256x448 building PNGs', () => {
    const { frames } = generateBuildingsAtlas(SOURCE_DIR_URL, BUILDINGS_COLS);
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      const src = readFileSync(fileURLToPath(new URL(`${id}.png`, SOURCE_DIR_URL)));
      const png = decodePng(src);
      expect([png.width, png.height]).toEqual([CELL_W, CELL_H]);
    }
  });
});