import { create } from 'zustand';
import { GameMode } from '@enums';
import { useAuthStore } from '../auth/auth-store';
import { HttpResultsClient, type ResultsClient } from './results-client';
import { EMPTY_MODE_BEST, type GameResultInput, type ModeBest, type TribeBest } from './result-types';

interface ResultsState {
  /** Bests by tribe id; empty while logged out or before the first load. */
  bests: Record<number, TribeBest>;
  /** Stars to draw for a tribe: its best, or null when it was never played. */
  starsFor(tribe: number, mode?: GameMode): number | null;
  /** Total games played with a tribe, any mode. */
  gamesFor(tribe: number, mode?: GameMode): number;
  /** Games count and bests of a tribe in one mode (zeros while unknown). */
  modeBest(tribe: number, mode: GameMode): ModeBest;
  refresh(): Promise<void>;
  submit(result: GameResultInput): Promise<void>;
  clear(): void;
}

type TokenSource = { getState(): { token: string | null }; subscribe(fn: () => void): () => void };

/** Per-tribe bests of the logged-in user; reloads on login and clears on logout. */
export function createResultsStore(client: ResultsClient, auth: TokenSource) {
  const store = create<ResultsState>((set, get) => ({
    bests: {},

    starsFor(tribe, mode) {
      const best = mode ? get().modeBest(tribe, mode) : get().bests[tribe];
      return best && best.games > 0 ? best.maxStars : null;
    },

    gamesFor(tribe, mode) {
      return (mode ? get().modeBest(tribe, mode) : get().bests[tribe])?.games ?? 0;
    },

    modeBest(tribe, mode) {
      return get().bests[tribe]?.modes[mode] ?? EMPTY_MODE_BEST;
    },

    async refresh() {
      const token = auth.getState().token;
      if (!token) return set({ bests: {} });
      const res = await client.best(token);
      if (res.ok && auth.getState().token === token) {
        // An older worker answers without per-mode bests: treat them as unknown.
        const withModes = (b: TribeBest): TribeBest => ({
          ...b,
          modes: b.modes ?? { [GameMode.CAPTURE]: EMPTY_MODE_BEST, [GameMode.TURNS30]: EMPTY_MODE_BEST },
        });
        set({ bests: Object.fromEntries(res.value.map((b) => [b.tribe, withModes(b)])) });
      }
    },

    async submit(result) {
      const token = auth.getState().token;
      if (!token) return;
      const res = await client.submit(token, result);
      if (res.ok) await get().refresh();
    },

    clear() {
      set({ bests: {} });
    },
  }));

  let lastToken = auth.getState().token;
  auth.subscribe(() => {
    const token = auth.getState().token;
    if (token === lastToken) return;
    lastToken = token;
    if (token) void store.getState().refresh();
    else store.getState().clear();
  });
  return store;
}

export const useResultsStore = createResultsStore(new HttpResultsClient(), useAuthStore);
