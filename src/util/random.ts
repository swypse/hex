export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  next(): number {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i]!, copy[j]!] = [copy[j]!, copy[i]!];
    }
    return copy;
  }
}

/** Random integer in [min, max]. */
export function randomInt(min: number, max: number, rng: () => number = Math.random): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Random element, or undefined for an empty list. */
export function pickRandom<T>(items: readonly T[], rng: () => number = Math.random): T | undefined {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** Seed for a new SeededRandom / map generation. */
export function randomSeed(): number {
  return randomInt(0, 99999);
}
