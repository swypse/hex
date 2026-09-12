import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  encodePng,
  decodePng,
  generateSkillAtlas,
  finalizeAtlas,
  skillOrder,
  ATLAS_COLS,
  ATLAS_CELL,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packSkills.mjs';

const SOURCE_DIR = SOURCE_DIR_URL;

describe('skill PNG codec', () => {
  it('round-trips a small RGBA buffer through encode/decode', () => {
    const w = 4;
    const h = 3;
    const rgba = Buffer.alloc(w * h * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37 + 11) & 0xff;

    const png = encodePng(rgba, w, h);
    const decoded = decodePng(png);

    expect(decoded.width).toBe(w);
    expect(decoded.height).toBe(h);
    expect(Buffer.compare(decoded.rgba, rgba)).toBe(0);
  });

  it('re-encoding an existing 120x120 skill icon is pixel-identical', () => {
    const src = readFileSync(fileURLToPath(new URL('skill-climbing.png', SOURCE_DIR)));
    const decoded = decodePng(src);
    expect([decoded.width, decoded.height]).toEqual([120, 120]);

    const png = encodePng(decoded.rgba, decoded.width, decoded.height);
    const again = decodePng(png);
    expect(Buffer.compare(again.rgba, decoded.rgba)).toBe(0);
    expect([again.width, again.height]).toEqual([120, 120]);
  });
});

describe('skill atlas generation', () => {
  const FILES = readdirSync(SOURCE_DIR)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -4))
    .sort();

  it('covers exactly the PNG files in the skills directory, exactly once', () => {
    const order = skillOrder();
    expect(order.length).toBe(FILES.length);
    expect([...new Set(order)]).toEqual(order);
    expect(order).toEqual(FILES);
  });

  it('is deterministic: two runs produce identical PNG bytes and manifest', () => {
    const a = generateSkillAtlas(SOURCE_DIR, ATLAS_COLS);
    const b = generateSkillAtlas(SOURCE_DIR, ATLAS_COLS);
    expect(Buffer.compare(a.png, b.png)).toBe(0);
    expect(a.manifestTs).toBe(b.manifestTs);
  });

  it('returns non-overlapping 120x120 frames inside the atlas bounds', () => {
    const { frames, width, height } = generateSkillAtlas(SOURCE_DIR, ATLAS_COLS);
    const cols = Math.ceil(FILES.length / ATLAS_COLS);
    expect(width).toBe(ATLAS_COLS * ATLAS_CELL);
    expect(height).toBe(cols * ATLAS_CELL);
    const seen = new Set();
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      expect(f.w).toBe(ATLAS_CELL);
      expect(f.h).toBe(ATLAS_CELL);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + ATLAS_CELL).toBeLessThanOrEqual(width);
      expect(f.y + ATLAS_CELL).toBeLessThanOrEqual(height);
      for (let yy = f.y; yy < f.y + ATLAS_CELL; yy++) {
        for (let xx = f.x; xx < f.x + ATLAS_CELL; xx++) {
          expect(seen.has(`${xx},${yy}`)).toBe(false);
          seen.add(`${xx},${yy}`);
        }
      }
    }
  });

  it('keeps the committed atlas PNG in sync with the packer output', async () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const final = await finalizeAtlas(generateSkillAtlas(SOURCE_DIR, ATLAS_COLS).png);
    expect(Buffer.compare(committed, final)).toBe(0);
  });

  it('references only real, valid skill icons', () => {
    const { frames } = generateSkillAtlas(SOURCE_DIR, ATLAS_COLS);
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      const src = readFileSync(fileURLToPath(new URL(`${id}.png`, SOURCE_DIR)));
      const png = decodePng(src);
      expect([png.width, png.height]).toEqual([ATLAS_CELL, ATLAS_CELL]);
    }
  });
});