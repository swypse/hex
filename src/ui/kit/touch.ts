let cached: boolean | null = null;

export function isTouchDevice(): boolean {
  if (cached === null) {
    cached =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
  }
  return cached;
}
