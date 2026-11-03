export function shadeColor(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/** Linear interpolation between two 0xRRGGBB colors. `t` clamps to [0, 1]. */
export function mixColor(from: number, to: number, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const r = Math.round(((from >> 16) & 0xff) + (((to >> 16) & 0xff) - ((from >> 16) & 0xff)) * x);
  const g = Math.round(((from >> 8) & 0xff) + (((to >> 8) & 0xff) - ((from >> 8) & 0xff)) * x);
  const b = Math.round((from & 0xff) + ((to & 0xff) - (from & 0xff)) * x);
  return (r << 16) | (g << 8) | b;
}
