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

/** Narrowest screen (px) that shows the keyboard help. */
const KEYBOARD_MIN_WIDTH = 600;

/** Whether the device likely has a keyboard: a hover-capable fine pointer (mouse/trackpad) and a wide enough screen.
 *  Browsers can't report a keyboard directly. */
export function hasKeyboard(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches && window.innerWidth >= KEYBOARD_MIN_WIDTH;
}
