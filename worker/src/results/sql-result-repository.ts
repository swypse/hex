import type { GameResultInput, TribeBest } from '../../../src/results/result-types';
import type { SqlLike } from '../auth/sql-user-repository';
import type { ResultRepository } from './result-repository';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS results (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tribe INTEGER NOT NULL,
    score INTEGER NOT NULL,
    stars INTEGER NOT NULL,
    mode TEXT NOT NULL,
    turns INTEGER NOT NULL,
    players INTEGER NOT NULL,
    won INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS results_user_tribe ON results (user_id, tribe)',
];

/** `ResultRepository` over SQLite (Durable Object storage). */
export class SqlResultRepository implements ResultRepository {
  constructor(private readonly sql: SqlLike) {
    for (const statement of SCHEMA) sql.exec(statement);
  }

  async saveResult(userId: string, r: GameResultInput, createdAt: number): Promise<void> {
    this.sql.exec(
      `INSERT OR IGNORE INTO results (id, user_id, tribe, score, stars, mode, turns, players, won, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      r.id, userId, r.tribe, r.score, r.stars, r.mode, r.turns, r.players, r.won ? 1 : 0, createdAt,
    );
  }

  async bestByTribe(userId: string): Promise<TribeBest[]> {
    const rows = this.sql
      .exec(
        `SELECT tribe, COUNT(*) AS games, MAX(score) AS max_score, MAX(stars) AS max_stars
         FROM results WHERE user_id = ? GROUP BY tribe`,
        userId,
      )
      .toArray();
    return rows.map((r) => ({
      tribe: r.tribe as number,
      games: r.games as number,
      maxScore: r.max_score as number,
      maxStars: r.max_stars as number,
    }));
  }
}
