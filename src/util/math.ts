/** `value` limited to [lo, hi]; `lo` wins when the range is inverted. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** `value` limited to [0, 1]. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}
