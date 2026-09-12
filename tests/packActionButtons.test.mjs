import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, finalizeAtlas } from '../tools/packSkills.mjs';
import {
  generateActionButtonAtlas,
  ACTION_BUTTON_ORDER,
  ACTION_BUTTON_COLS,
  ACTION_BUTTON_CELL,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packActionButtons.mjs';

describe('action button atlas generation', () => {
  const FILES = readdirSync(SOURCE_DIR_URL)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -4))
    .sort();

  it('covers exactly the PNG files in the action-buttons dir, exactly once', () => {
    expect(ACTION_BUTTON_ORDER.length).toBe(FILES.length);
    expect([...new Set(ACTION_BUTTON_ORDER)]).toEqual(ACTION_BUTTON_ORDER);
    expect(ACTION_BUTTON_ORDER).toEqual(FILES);
  });

  it('is deterministic: two runs produce identical PNG bytes and manifest', () => {
    const a = generateActionButtonAtlas(SOURCE_DIR_URL, ACTION_BUTTON_COLS);
    const b = generateActionButtonAtlas(SOURCE_DIR_URL, ACTION_BUTTON_COLS);
    expect(Buffer.compare(a.png, b.png)).toBe(0);
    expect(a.manifestTs).toBe(b.manifestTs);
  });

  it('returns non-overlapping 120x120 frames inside the atlas bounds', () => {
    const { frames, width, height } = generateActionButtonAtlas(SOURCE_DIR_URL, ACTION_BUTTON_COLS);
    const rows = Math.ceil(FILES.length / ACTION_BUTTON_COLS);
    expect(width).toBe(ACTION_BUTTON_COLS * ACTION_BUTTON_CELL);
    expect(height).toBe(rows * ACTION_BUTTON_CELL);
    const seen = new Set();
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      expect(f.w).toBe(ACTION_BUTTON_CELL);
      expect(f.h).toBe(ACTION_BUTTON_CELL);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + ACTION_BUTTON_CELL).toBeLessThanOrEqual(width);
      expect(f.y + ACTION_BUTTON_CELL).toBeLessThanOrEqual(height);
    }
  });

  it('keeps the committed atlas PNG in sync with the packer output', async () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const final = await finalizeAtlas(generateActionButtonAtlas(SOURCE_DIR_URL, ACTION_BUTTON_COLS).png);
    expect(Buffer.compare(committed, final)).toBe(0);
  });

  it('references only real, valid 120x120 action button icons', () => {
    const { frames } = generateActionButtonAtlas(SOURCE_DIR_URL, ACTION_BUTTON_COLS);
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      const src = readFileSync(fileURLToPath(new URL(`${id}.png`, SOURCE_DIR_URL)));
      const png = decodePng(src);
      expect([png.width, png.height]).toEqual([ACTION_BUTTON_CELL, ACTION_BUTTON_CELL]);
    }
  });
});