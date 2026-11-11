type Ease = 'in' | 'out' | 'inOut';

/** Duration of one rubber-ball hop. */
export const RUBBER_BOUNCE_MS = 560;

/** Keyframes: time (0-1), lift (0 = on the ground, 1 = peak), x and y scale; `ease` shapes the segment ending at the key. */
const KEYS: { t: number; lift: number; sx: number; sy: number; ease: Ease }[] = [
  { t: 0, lift: 0, sx: 1, sy: 1, ease: 'inOut' },
  { t: 0.14, lift: 0, sx: 1.12, sy: 0.84, ease: 'inOut' },
  { t: 0.4, lift: 1, sx: 0.92, sy: 1.1, ease: 'out' },
  { t: 0.64, lift: 0, sx: 1, sy: 1, ease: 'in' },
  { t: 0.76, lift: 0, sx: 1.12, sy: 0.84, ease: 'out' },
  { t: 0.9, lift: 0, sx: 0.96, sy: 1.05, ease: 'inOut' },
  { t: 1, lift: 0, sx: 1, sy: 1, ease: 'inOut' },
];

function applyEase(p: number, ease: Ease): number {
  if (ease === 'in') return p * p;
  if (ease === 'out') return 1 - (1 - p) * (1 - p);
  return p * p * (3 - 2 * p);
}

/** Lift (0-1) and squash/stretch scales at `progress` (0-1) of a rubber-ball hop: squash, jump, land, squash, settle. */
export function rubberPose(progress: number): { lift: number; sx: number; sy: number } {
  let i = 1;
  while (i < KEYS.length - 1 && progress > KEYS[i]!.t) i += 1;
  const a = KEYS[i - 1]!;
  const b = KEYS[i]!;
  const k = applyEase(Math.min(1, Math.max(0, (progress - a.t) / (b.t - a.t))), b.ease);
  return { lift: a.lift + (b.lift - a.lift) * k, sx: a.sx + (b.sx - a.sx) * k, sy: a.sy + (b.sy - a.sy) * k };
}
