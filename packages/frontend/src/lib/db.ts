/**
 * Data Layer Accessor
 *
 * The app's data store is the shared SQLite layer `@family-todo/db` (raw SQL,
 * no ORM). This module exposes the process-wide singleton connection the
 * middleware attaches to `context.locals.db`. The connection path is taken from
 * the `DB_PATH` env var by `@family-todo/db` (default `/data/app.db` in
 * production via the container env).
 */

import { getDb, type DB } from '@family-todo/db'

export type { DB }

/**
 * Get the process-wide SQLite connection (opened lazily on first use).
 */
export function getDatabase(): DB {
  return getDb()
}
