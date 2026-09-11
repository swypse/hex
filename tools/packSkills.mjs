// Packs the individual skill icon PNGs (public/textures/skills/skill-*.png)
// into a single compressed atlas PNG plus a generated manifest. The source
// files are never modified. Run with: npm run pack:skills
import { deflateSync, inflateSync, crc32 } from 'node:zlib';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { URL } from 'node:url';

export const SOURCE_DIR_URL = new URL('../src/assets/skills/', import.meta.url);
export const ATLAS_URL = new URL('../public/textures/skills-atlas.png', import.meta.url);
export const MANIFEST_URL = new URL('../src/game/skillAtlasData.gen.ts', import.meta.url);

export const ATLAS_COLS = 5;
export const ATLAS_CELL = 120;
export const ATLAS_FILE = 'skills-atlas.png';

function isPngSignature(b) {
  return b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function crc(buffer) {
  return crc32(buffer);
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const PAETH = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
};

/** Undo one scanline filter (types 0-4). `line` is mutated in place. */
function unfilterLine(filter, line, prev, bpp, stride) {
  for (let i = 0; i < stride; i++) {
    const a = i >= bpp ? line[i - bpp] : 0;
    const b = prev[i];
    const c = i >= bpp ? prev[i - bpp] : 0;
    let v;
    switch (filter) {
      case 0: v = line[i]; break;
      case 1: v = line[i] + a; break;
      case 2: v = line[i] + b; break;
      case 3: v = line[i] + ((a + b) >> 1); break;
      case 4: v = line[i] + PAETH(a, b, c); break;
      default: throw new Error(`unsupported PNG scanline filter ${filter}`);
    }
    line[i] = v & 0xff;
  }
}

export function decodePng(data) {
  if (!isPngSignature(data)) throw new Error('not a PNG file');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (pos + 8 <= data.length) {
    const len = data.readUInt32BE(pos);
    const type = data.subarray(pos + 4, pos + 8).toString('ascii');
    const payload = data.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      bitDepth = payload[8];
      colorType = payload[9];
      interlace = payload[12];
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(payload));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG format: bit depth ${bitDepth}, color type ${colorType}, interlace ${interlace}`);
  }
  const bpp = 4;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(stride * height);
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p];
    p += 1;
    const line = raw.subarray(p, p + stride);
    line.copy(rgba, y * stride);
    unfilterLine(filter, rgba.subarray(y * stride, y * stride + stride), prev, bpp, stride);
    rgba.subarray(y * stride, y * stride + stride).copy(prev, 0);
    p += stride;
  }
  return { width, height, bitDepth, colorType, rgba };
}

function filteredRow(rawRow, prev, bpp, stride, filter) {
  const out = Buffer.alloc(stride);
  for (let i = 0; i < stride; i++) {
    const a = i >= bpp ? rawRow[i - bpp] : 0;
    const b = prev[i];
    const c = i >= bpp ? prev[i - bpp] : 0;
    let v;
    switch (filter) {
      case 0: v = rawRow[i]; break;
      case 1: v = rawRow[i] - a; break;
      case 2: v = rawRow[i] - b; break;
      case 3: v = rawRow[i] - ((a + b) >> 1); break;
      case 4: v = rawRow[i] - PAETH(a, b, c); break;
      default: throw new Error(`unsupported filter ${filter}`);
    }
    out[i] = v & 0xff;
  }
  return out;
}

/** Cheap heuristic: pick the filter whose output has the smallest sum of magnitudes. */
function pickFilter(rawRow, prev, bpp, stride) {
  let best = 0;
  let bestScore = Number.MAX_SAFE_INTEGER;
  for (let f = 0; f < 5; f++) {
    const row = filteredRow(rawRow, prev, bpp, stride, f);
    let score = 0;
    for (let i = 0; i < stride; i++) score += Math.abs(row[i] - 128);
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

export function encodePng(rgba, width, height, opts = {}) {
  const bpp = 4;
  const stride = width * bpp;
  if (rgba.length !== stride * height) throw new Error('RGBA buffer size mismatch');

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0; // non-interlaced

  const scanlines = Buffer.alloc((stride + 1) * height);
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const rawRow = rgba.subarray(y * stride, (y + 1) * stride);
    const filter = opts.filter ?? pickFilter(rawRow, prev, bpp, stride);
    scanlines[p] = filter;
    p += 1;
    filteredRow(rawRow, prev, bpp, stride, filter).copy(scanlines, p);
    rawRow.copy(prev, 0);
    p += stride;
  }

  const idat = deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Permanent, sorted order of the source icon base names (e.g. 'skill-bridges'). */
const orderMemo = Symbol('order');
export const SKILL_ORDER = (() => {
  const names = readdirSync(SOURCE_DIR_URL)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -'.png'.length))
    .sort();
  return names;
})();

export function skillOrder() {
  return [...SKILL_ORDER];
}

export function generateSkillAtlas(sourceDir = SOURCE_DIR_URL, cols = ATLAS_COLS) {
  const order = readdirSync(sourceDir)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -'.png'.length))
    .sort();
  const cells = order.length;
  const rows = Math.ceil(cells / cols);
  const width = cols * ATLAS_CELL;
  const height = rows * ATLAS_CELL;
  const rgba = Buffer.alloc(width * height * 4); // zero = fully transparent
  const frames = {};

  order.forEach((base, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * ATLAS_CELL;
    const y = row * ATLAS_CELL;
    const src = readFileSync(new URL(`${base}.png`, sourceDir));
    const icon = decodePng(src);
    if (icon.width !== ATLAS_CELL || icon.height !== ATLAS_CELL) {
      throw new Error(`${base}.png must be ${ATLAS_CELL}x${ATLAS_CELL}, got ${icon.width}x${icon.height}`);
    }
    for (let yy = 0; yy < ATLAS_CELL; yy++) {
      icon.rgba.copy(rgba, (y + yy) * width * 4 + x * 4, yy * ATLAS_CELL * 4, (yy + 1) * ATLAS_CELL * 4);
    }
    frames[base] = { x, y, w: ATLAS_CELL, h: ATLAS_CELL };
  });

  const entries = order
    .map((base) => `  '${base}': { x: ${frames[base].x}, y: ${frames[base].y} },`)
    .join('\n');
  const manifestTs = `// AUTO-GENERATED by tools/packSkills.mjs — do not edit by hand.
// Regenerate after adding/changing skill icons: npm run pack:skills

export const SKILL_ATLAS_FILE = '${ATLAS_FILE}';
export const SKILL_ATLAS_CELL = ${ATLAS_CELL};
export const SKILL_ATLAS_COLS = ${ATLAS_COLS};
export const SKILL_ATLAS_FRAMES: Record<string, { x: number; y: number }> = {
${entries}
};
`;

  return {
    png: encodePng(rgba, width, height),
    manifestTs,
    frames,
    width,
    height,
    cell: ATLAS_CELL,
    cols,
  };
}

export function writeSkillAtlas() {
  const out = generateSkillAtlas();
  writeFileSync(ATLAS_URL, out.png);
  writeFileSync(MANIFEST_URL, out.manifestTs);
  return out;
}

if (import.meta.main) {
  const out = writeSkillAtlas();
  console.log(`packed ${Object.keys(out.frames).length} skill icons -> ${out.width}x${out.height} atlas (${out.png.length} bytes)`);
  console.log(`wrote ${ATLAS_URL.pathname}`);
  console.log(`wrote ${MANIFEST_URL.pathname}`);
}
