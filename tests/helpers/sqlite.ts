import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

/** Node's built-in SQLite, or null where it is missing (Node < 22.5). Loaded
 *  through `require` because vite cannot resolve the `node:sqlite` builtin in
 *  an import. Tests that need it skip when this is null. */
export function loadSqlite(): typeof DatabaseSyncType | null {
  try {
    const mod = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };
    return mod.DatabaseSync;
  } catch {
    return null;
  }
}
