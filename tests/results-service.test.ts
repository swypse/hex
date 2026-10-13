import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../worker/src/auth/auth-service';
import { MemoryUserRepository } from '../worker/src/auth/memory-user-repository';
import { MemoryResultRepository } from '../worker/src/results/memory-result-repository';
import { handleResultsRequest } from '../worker/src/results/results-routes';
import { ResultService } from '../worker/src/results/result-service';
import { SqlResultRepository } from '../worker/src/results/sql-result-repository';
import type { ResultRepository } from '../worker/src/results/result-repository';
import { parseGameResult } from '../src/results/result-validation';
import type { GameResultInput } from '../src/results/result-types';
import { AuthError, GameMode, Tribe } from '@enums';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };

const result = (over: Partial<GameResultInput> = {}): GameResultInput => ({
  id: 'game-0001-abcd', tribe: Tribe.Cats, score: 500, stars: 2, mode: GameMode.CAPTURE, turns: 30, players: 3, won: true, ...over,
});

describe('parseGameResult', () => {
  it('accepts a valid result', () => {
    expect(parseGameResult(result())).toEqual(result());
  });

  it.each([
    ['unknown tribe', { tribe: 99 }],
    ['fractional score', { score: 1.5 }],
    ['negative score', { score: -1 }],
    ['too many stars', { stars: 4 }],
    ['stars without a win', { stars: 1, won: false }],
    ['unknown mode', { mode: 'nope' }],
    ['short id', { id: 'x' }],
  ])('rejects %s', (_name, over) => {
    expect(parseGameResult({ ...result(), ...over })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(parseGameResult(null)).toBeNull();
    expect(parseGameResult('x')).toBeNull();
  });
});

function suite(name: string, make: () => ResultRepository): void {
  describe(`ResultService over ${name}`, () => {
    let service: ResultService;
    beforeEach(() => {
      service = new ResultService(make(), () => 1);
    });

    it('lists every tribe, zeroed when unplayed', async () => {
      const bests = await service.bests('u1');
      expect(bests).toHaveLength(7);
      expect(bests.every((b) => b.games === 0 && b.maxScore === 0 && b.maxStars === 0)).toBe(true);
    });

    it('keeps the max score and stars per tribe, per user', async () => {
      await service.record('u1', result({ id: 'game-0001-aaaa', score: 500, stars: 2 }));
      await service.record('u1', result({ id: 'game-0002-aaaa', score: 900, stars: 1 }));
      await service.record('u1', result({ id: 'game-0003-aaaa', tribe: Tribe.Sand, score: 100, stars: 0, won: false }));
      await service.record('u2', result({ id: 'game-0004-aaaa', score: 9999, stars: 3 }));
      const bests = await service.bests('u1');
      expect(bests.find((b) => b.tribe === Tribe.Cats)).toEqual({ tribe: Tribe.Cats, games: 2, maxScore: 900, maxStars: 2 });
      expect(bests.find((b) => b.tribe === Tribe.Sand)).toEqual({ tribe: Tribe.Sand, games: 1, maxScore: 100, maxStars: 0 });
    });

    it('ignores a resubmitted game id', async () => {
      await service.record('u1', result());
      await service.record('u1', result());
      expect((await service.bests('u1')).find((b) => b.tribe === Tribe.Cats)?.games).toBe(1);
    });

    it('rejects invalid input', async () => {
      expect(await service.record('u1', { tribe: 99 })).toEqual({ ok: false, error: AuthError.INVALID_INPUT });
    });
  });
}

suite('memory', () => new MemoryResultRepository());
suite('sqlite', () => {
  const db = new DatabaseSync(':memory:');
  return new SqlResultRepository({
    exec: (q, ...b) => {
      const rows = db.prepare(q).all(...(b as never[])) as Record<string, unknown>[];
      return { toArray: () => rows };
    },
  });
});

describe('results routes', () => {
  const codes: string[] = [];
  const auth = new AuthService(new MemoryUserRepository(), { sendConfirmationCode: async (_t, _n, c) => void codes.push(c) });
  const results = new ResultService(new MemoryResultRepository());

  async function call(method: string, path: string, body?: unknown, token?: string) {
    const res = await handleResultsRequest(
      new Request(`https://x.test${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
      auth,
      results,
    );
    return { res: res!, json: (await res!.json()) as { ok: boolean; value?: unknown } };
  }

  async function login(): Promise<string> {
    await auth.register({ name: 'Ann', email: 'ann@example.com', password: 'longenough1' });
    await auth.confirm('ann@example.com', codes[0]!);
    const l = await auth.login('ann@example.com', 'longenough1');
    if (!l.ok) throw new Error('login failed');
    return l.value.token;
  }

  it('ignores other paths and requires a session', async () => {
    expect(await handleResultsRequest(new Request('https://x.test/api/auth/me'), auth, results)).toBeNull();
    expect((await call('GET', '/api/results/best')).res.status).toBe(401);
    expect((await call('POST', '/api/results', result())).res.status).toBe(401);
  });

  it('stores a result and returns bests for all tribes', async () => {
    const token = await login();
    expect((await call('POST', '/api/results', result(), token)).res.status).toBe(200);
    const best = await call('GET', '/api/results/best', undefined, token);
    const rows = best.json.value as { tribe: number; maxStars: number; maxScore: number }[];
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.tribe === Tribe.Cats)).toMatchObject({ maxScore: 500, maxStars: 2 });
    expect((await call('POST', '/api/results', { ...result(), stars: 9 }, token)).res.status).toBe(400);
  });
});
