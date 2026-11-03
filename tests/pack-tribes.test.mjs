import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, finalizeAtlas, atlasPngsMatch } from '../tools/packSkills.mjs';
import {
  generateTribeAtlas,
  TRIBE_CODES,
  TRIBE_COLS,
  TRIBE_ATLAS_FILES,
  SOURCE_ROOT_URL,
  ATLAS_DIR_URL,
} from '../tools/packTribes.mjs';
import { TRIBES } from '../src/game/tribes';

const CELL_W = 256;
const CELL_H = 448;

describe('tribe atlas generation', () => {
  it('covers every playable tribe with a matching asset dir', () => {
    const codes = TRIBES.map((t) => t.code).sort();
    expect(TRIBE_CODES).toEqual(codes);
    for (const code of TRIBE_CODES) {
      const dir = new URL(`tribe-${code}/`, SOURCE_ROOT_URL);
      const files = readdirSync(dir).filter((n) => n.endsWith('.png'));
      expect(files.length).toBeGreaterThan(0);
    }
  });

  it('packs a deterministic atlas per tribe with in-bounds 256x448 frames', () => {
    for (const code of TRIBE_CODES) {
      const dir = new URL(`tribe-${code}/`, SOURCE_ROOT_URL);
      const files = readdirSync(dir)
        .filter((n) => n.endsWith('.png'))
        .map((n) => n.slice(0, -4))
        .sort();
      const a = generateTribeAtlas(code);
      const b = generateTribeAtlas(code);
      expect(Buffer.compare(a.png, b.png)).toBe(0);
      const rows = Math.ceil(files.length / TRIBE_COLS);
      expect(a.width).toBe(TRIBE_COLS * CELL_W);
      expect(a.height).toBe(rows * CELL_H);
      const seen = new Set();
      for (const id of files) {
        const f = a.frames[id];
        expect(f).not.toBeUndefined();
        expect(f.w).toBe(CELL_W);
        expect(f.h).toBe(CELL_H);
        expect(f.x + CELL_W).toBeLessThanOrEqual(a.width);
        expect(f.y + CELL_H).toBeLessThanOrEqual(a.height);
        seen.add(`${f.x},${f.y}`);
      }
      expect(seen.size).toBe(files.length);
    }
  });

  it('keeps the committed per-tribe atlas PNGs in sync with the packer output', async () => {
    for (const code of TRIBE_CODES) {
      const file = TRIBE_ATLAS_FILES[code];
      expect(file).toBe(`${code}-atlas.png`);
      const committed = readFileSync(fileURLToPath(new URL(file, ATLAS_DIR_URL)));
      const final = await finalizeAtlas(generateTribeAtlas(code).png);
      expect(atlasPngsMatch(committed, final)).toBe(true);
    }
  }, 30000);

  it('references only real, valid 256x448 tribe PNGs', () => {
    for (const code of TRIBE_CODES) {
      const dir = new URL(`tribe-${code}/`, SOURCE_ROOT_URL);
      const frames = generateTribeAtlas(code).frames;
      for (const n of readdirSync(dir).filter((x) => x.endsWith('.png'))) {
        const id = n.slice(0, -4);
        const f = frames[id];
        expect(f).not.toBeUndefined();
        const img = decodePng(readFileSync(new URL(n, dir)));
        expect([img.width, img.height]).toEqual([CELL_W, CELL_H]);
      }
    }
  });
});