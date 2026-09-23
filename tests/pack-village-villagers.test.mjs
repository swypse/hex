import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, finalizeAtlas, atlasPngsMatch } from '../tools/packSkills.mjs';
import {
  generateVillageVillagersAtlas,
  VILLAGE_VILLAGERS_ORDER,
  VILLAGE_VILLAGERS_COLS,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packVillageVillagers.mjs';

describe('village-villagers atlas generation', () => {
  const FILES = readdirSync(SOURCE_DIR_URL)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -4))
    .sort();
  const CELL_W = 90;
  const CELL_H = 90;

  it('covers exactly the PNG files in the village-villagers dir, exactly once', () => {
    expect(VILLAGE_VILLAGERS_ORDER.length).toBe(FILES.length);
    expect([...new Set(VILLAGE_VILLAGERS_ORDER)]).toEqual(VILLAGE_VILLAGERS_ORDER);
    expect(VILLAGE_VILLAGERS_ORDER).toEqual(FILES);
  });

  it('is deterministic: two runs produce identical PNG bytes and manifest', () => {
    const a = generateVillageVillagersAtlas(SOURCE_DIR_URL, VILLAGE_VILLAGERS_COLS);
    const b = generateVillageVillagersAtlas(SOURCE_DIR_URL, VILLAGE_VILLAGERS_COLS);
    expect(Buffer.compare(a.png, b.png)).toBe(0);
    expect(a.manifestTs).toBe(b.manifestTs);
  });

  it('returns non-overlapping 90x90 frames inside the atlas bounds', () => {
    const { frames, width, height } = generateVillageVillagersAtlas(SOURCE_DIR_URL, VILLAGE_VILLAGERS_COLS);
    const rows = Math.ceil(FILES.length / VILLAGE_VILLAGERS_COLS);
    expect(width).toBe(VILLAGE_VILLAGERS_COLS * CELL_W);
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
    const final = await finalizeAtlas(generateVillageVillagersAtlas(SOURCE_DIR_URL, VILLAGE_VILLAGERS_COLS).png);
    expect(atlasPngsMatch(committed, final)).toBe(true);
  });

  it('references only real, valid 90x90 village-villager PNGs', () => {
    const { frames } = generateVillageVillagersAtlas(SOURCE_DIR_URL, VILLAGE_VILLAGERS_COLS);
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      const src = readFileSync(fileURLToPath(new URL(`${id}.png`, SOURCE_DIR_URL)));
      const png = decodePng(src);
      expect([png.width, png.height]).toEqual([CELL_W, CELL_H]);
    }
  });
});