/** Segments each road strip is split into. */
const SEGMENTS = 6;
/** Max sideways bow of a strip (px), reached mid-way; its sign is per strip. */
const BEND_MAX = 7;
/** Bow as a share of the strip length. */
const BEND_SHARE = 0.2;
/** Per-point sideways wobble (px) and width variation (share of the half width). */
const WOBBLE = 1.1;
const WIDTH_VARIATION = 0.3;

/** Deterministic 0..1 value from integers: the same strip always looks the same. */
function hash01(a: number, b: number, c: number, d: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177) ^ Math.imul(d | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Outline (flat x,y pairs) of a hand-drawn-looking road strip from a hex edge
 *  midpoint `(ex, ey)` to the tile centre `(cx, cy)`: it bows to one side and
 *  wobbles with a varying width, but both ends sit exactly on the edge midpoint
 *  and the centre, so the halves drawn by neighbouring tiles still meet. */
export function roadStripOutline(
  ex: number,
  ey: number,
  cx: number,
  cy: number,
  halfWidth: number,
  seed: { q: number; r: number; edge: number },
): number[] {
  const dx = cx - ex;
  const dy = cy - ey;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = (hash01(seed.q, seed.r, seed.edge, 0) * 2 - 1) * Math.min(BEND_MAX, len * BEND_SHARE);
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const inner = i > 0 && i < SEGMENTS;
    const wobble = inner ? (hash01(seed.q, seed.r, seed.edge, i) * 2 - 1) * WOBBLE : 0;
    const side = bend * 4 * t * (1 - t) + wobble;
    const w = halfWidth * (1 + (inner ? (hash01(seed.q, seed.r, seed.edge, i + 100) * 2 - 1) * WIDTH_VARIATION : 0));
    const x = ex + dx * t + nx * side;
    const y = ey + dy * t + ny * side;
    left.push(x + nx * w, y + ny * w);
    right.push(x - nx * w, y - ny * w);
  }
  const out = left;
  for (let i = right.length - 2; i >= 0; i -= 2) out.push(right[i]!, right[i + 1]!);
  return out;
}
