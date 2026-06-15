/**
 * Legacy "todos" collection (raw SQL helpers).
 *
 * The shared `@family-todo/db` schema does not include a `todos` table (it
 * models the family-todo domain: groups/children/tasks/...). The legacy todos
 * routes predate that domain and are not surfaced by any UI page, but the
 * endpoints are kept working against the same SQLite connection via this
 * self-bootstrapping table so behaviour is preserved. Mirrors the columns the
 * old PocketBase `todos` collection exposed (id, title, completed, user_id).
 */

import type { DB } from '@family-todo/db'

/**
 * Create the `todos` table if it does not already exist (idempotent).
 */
export function ensureTodosTable(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id        TEXT PRIMARY KEY,
      title     TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      user_id   TEXT,
      created   TEXT NOT NULL DEFAULT '',
      updated   TEXT NOT NULL DEFAULT ''
    )
  `)
}
