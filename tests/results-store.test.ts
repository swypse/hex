import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createResultsStore } from '../src/results/results-store';
import type { ResultsClient } from '../src/results/results-client';
import { HttpResultsClient } from '../src/results/results-client';
import { buildResult } from '../src/controller/result-recorder';
import { GameMode, Tribe } from '@enums';
import { foldTribeBest } from '../src/results/result-types';
import { starRating } from '../src/game/game-mode';

const BESTS = [
  foldTribeBest(Tribe.Cats, [{ tribe: Tribe.Cats, mode: GameMode.CAPTURE, games: 3, maxScore: 700, maxStars: 2 }]),
  foldTribeBest(Tribe.Sand, []),
];

function setup(token: string | null = 'tok', client: Partial<ResultsClient> = {}) {
  const auth = createStore<{ token: string | null }>(() => ({ token }));
  const full: ResultsClient = {
    submit: vi.fn(async () => ({ ok: true as const, value: undefined })),
    best: vi.fn(async () => ({ ok: true as const, value: BESTS })),
    ...client,
  };
  return { auth, client: full, store: createResultsStore(full, auth) };
}

describe('results store', () => {
  it('tolerates a worker that answers without per-mode bests', async () => {
    const legacy = [{ tribe: Tribe.Cats, games: 3, maxScore: 700, maxStars: 2 }] as unknown as typeof BESTS;
    const { store } = setup('tok', { best: async () => ({ ok: true as const, value: legacy }) });
    await store.getState().refresh();
    expect(store.getState().modeBest(Tribe.Cats, GameMode.CAPTURE)).toEqual({ games: 0, maxScore: 0, maxStars: 0 });
    expect(store.getState().starsFor(Tribe.Cats)).toBe(2);
  });

  it('shows stars only for tribes that were played', async () => {
    const { store } = setup();
    await store.getState().refresh();
    expect(store.getState().starsFor(Tribe.Cats)).toBe(2);
    expect(store.getState().starsFor(Tribe.Sand)).toBeNull();
    expect(store.getState().starsFor(Tribe.Aqua)).toBeNull();
  });

  it('loads on login and clears on logout', async () => {
    const { auth, store, client } = setup(null);
    await store.getState().refresh();
    expect(client.best).not.toHaveBeenCalled();
    auth.setState({ token: 'tok' });
    await vi.waitFor(() => expect(store.getState().starsFor(Tribe.Cats)).toBe(2));
    auth.setState({ token: null });
    expect(store.getState().starsFor(Tribe.Cats)).toBeNull();
  });

  it('submits then refreshes; skips submit when logged out', async () => {
    const { store, client } = setup();
    const result = { id: 'game-0001-abcd', tribe: Tribe.Cats, score: 1, stars: 0, mode: GameMode.CAPTURE, turns: 1, players: 2, won: false };
    await store.getState().submit(result);
    expect(client.submit).toHaveBeenCalledWith('tok', result);
    expect(client.best).toHaveBeenCalledTimes(1);

    const out = setup(null);
    await out.store.getState().submit(result);
    expect(out.client.submit).not.toHaveBeenCalled();
  });
});

describe('HttpResultsClient', () => {
  it('posts the result and fetches /best with the bearer token', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ok: true, value: BESTS })));
    const client = new HttpResultsClient(() => 'https://h/api/results', fetchFn as unknown as typeof fetch);
    expect((await client.best('tok')).ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith('https://h/api/results/best', expect.objectContaining({
      method: 'GET', headers: { authorization: 'Bearer tok' },
    }));
  });
});

describe('buildResult', () => {
  const state = (over: Record<string, unknown> = {}) => ({
    tutorial: false,
    localPlayerIndex: 0,
    winnerIndex: 0,
    mode: GameMode.TURNS30,
    turn: 30,
    players: [
      { index: 0, tribe: Tribe.Cats, isHuman: true, score: 2500, name: 'A' },
      { index: 1, tribe: Tribe.Sand, isHuman: false, score: 10, name: 'B' },
    ],
    ...over,
  }) as never;
  const map = { tiles: [] } as never;

  it('gives the winner the star rating of their score', () => {
    const r = buildResult(state(), map, 'game-0001-abcd')!;
    expect(r).toMatchObject({ tribe: Tribe.Cats, score: 2500, won: true, turns: 30, players: 2 });
    expect(r.stars).toBe(starRating(2500, 2, GameMode.TURNS30, 30));
  });

  it('gives a non-winner 0 stars and skips tutorials / AI seats', () => {
    expect(buildResult(state({ winnerIndex: 1 }), map, 'game-0001-abcd')).toMatchObject({ won: false, stars: 0 });
    expect(buildResult(state({ tutorial: true }), map, 'game-0001-abcd')).toBeNull();
    expect(buildResult(state({ localPlayerIndex: 1 }), map, 'game-0001-abcd')).toBeNull();
  });
});
