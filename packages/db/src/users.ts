import type { DB } from './connection.js'
import { generateId } from './ids.js'
import type { User } from './types.js'

/**
 * Look up a user by their email address. Returns null if no such user exists.
 */
export function getUserByEmail(db: DB, email: string): User | null {
  const row = db
    .prepare<[string], User>('SELECT * FROM users WHERE email = ?')
    .get(email)
  return row ?? null
}

/**
 * Look up a user by id. Returns null if not found.
 */
export function getUserById(db: DB, id: string): User | null {
  const row = db.prepare<[string], User>('SELECT * FROM users WHERE id = ?').get(id)
  return row ?? null
}

/**
 * Upsert a user by email. Used when the auth proxy presents a verified email:
 *   - if a user with that email exists, optionally refresh the name and return it;
 *   - otherwise insert a new user row.
 *
 * Always returns the resulting user row.
 */
export function upsertUserByEmail(db: DB, email: string, name?: string): User {
  const existing = getUserByEmail(db, email)
  const now = new Date().toISOString()

  if (existing) {
    if (name !== undefined && name !== existing.name) {
      db.prepare('UPDATE users SET name = ?, updated = ? WHERE id = ?').run(
        name,
        now,
        existing.id,
      )
      return getUserById(db, existing.id) as User
    }
    return existing
  }

  const id = generateId()
  db.prepare(
    'INSERT INTO users (id, email, name, created, updated) VALUES (?, ?, ?, ?, ?)',
  ).run(id, email, name ?? null, now, now)
  return getUserById(db, id) as User
}
