export const TIP_TEXTS: readonly string[] = [
  'Attacks can miss. Open the Science skill to make your attacks more precise.',
  'Open the Roads skill to connect villages and move your units faster.',
  'Open the Navigation skill to turn units into ships and sail the seas.',
  'Beware: pirates can capture your ships.',
  'Build mines on mountains to gather stone and ore — you need them to upgrade villages.',
];

export interface TipsProgress {
  /** Indices into `TIP_TEXTS` in the per-game random display order. */
  order: number[];
  /** Position in `order` of the next tip to show. */
  pointer: number;
  /** Game turn on which the most recent tip was closed (null until the first close). */
  closedAtTurn: number | null;
}

export function initialTipsProgress(rng: () => number = Math.random): TipsProgress {
  const order = TIP_TEXTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return { order, pointer: 0, closedAtTurn: null };
}

export function tipsDueTurn(progress: TipsProgress): number {
  return progress.closedAtTurn === null ? 3 : progress.closedAtTurn + 2;
}

export function isTipsExhausted(progress: TipsProgress): boolean {
  return progress.pointer >= progress.order.length;
}

export function currentTipText(progress: TipsProgress): string | null {
  if (isTipsExhausted(progress)) return null;
  return TIP_TEXTS[progress.order[progress.pointer]!]!;
}
