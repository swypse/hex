import { create } from 'zustand';
import { useAuthStore } from '../auth/auth-store';
import { HttpResultsClient, type ResultsClient } from './results-client';
import type { GameResultInput, TribeBest } from './result-types';

interface ResultsState {
  /** Bests by tribe id; empty while logged out or before the first load. */
  bests: Record<number, TribeBest>;
  /** Stars to draw for a tribe: its best, or null when it was never played. */
  starsFor(tribe: number): number | null;
  refresh(): Promise<void>;
  submit(result: GameResultInput): Promise<void>;
  clear(): void;
}

type TokenSource = { getState(): { token: string | null }; subscribe(fn: () => void): () => void };

/** Per-tribe bests of the logged-in user; reloads on login and clears on logout. */
export function createResultsStore(client: ResultsClient, auth: TokenSource) {
  const store = create<ResultsState>((set, get) => ({
    bests: {},

    starsFor(tribe) {
      const best = get().bests[tribe];
      return best && best.games > 0 ? best.maxStars : null;
    },

    async refresh() {
      const token = auth.getState().token;
      if (!token) return set({ bests: {} });
      const res = await client.best(token);
      if (res.ok && auth.getState().token === token) {
        set({ bests: Object.fromEntries(res.value.map((b) => [b.tribe, b])) });
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
