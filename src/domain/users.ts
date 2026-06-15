import { randomUUID } from 'node:crypto'
import type { Db } from '../db.ts'

export type User = {
  id: string
  email: string
  name: string | null
  githubId: string | null
  createdAt: number
}

type Row = {
  id: string
  email: string
  name: string | null
  github_id: string | null
  created_at: number
}

const fromRow = (r: Row): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  githubId: r.github_id,
  createdAt: r.created_at,
})

export const createUser = (
  db: Db,
  input: { email: string; name?: string | null; githubId?: string | null },
): User => {
  const id = randomUUID()
  const createdAt = Date.now()
  db.prepare(
    'INSERT INTO users (id, email, name, github_id, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, input.email, input.name ?? null, input.githubId ?? null, createdAt)
  return {
    id,
    email: input.email,
    name: input.name ?? null,
    githubId: input.githubId ?? null,
    createdAt,
  }
}

export const findUserById = (db: Db, id: string): User | null => {
  const row = db
    .prepare(
      'SELECT id, email, name, github_id, created_at FROM users WHERE id = ?',
    )
    .get(id) as Row | undefined
  return row ? fromRow(row) : null
}

export const findUserByEmail = (db: Db, email: string): User | null => {
  const row = db
    .prepare(
      'SELECT id, email, name, github_id, created_at FROM users WHERE email = ?',
    )
    .get(email) as Row | undefined
  return row ? fromRow(row) : null
}

export const findUserByGithubId = (db: Db, githubId: string): User | null => {
  const row = db
    .prepare(
      'SELECT id, email, name, github_id, created_at FROM users WHERE github_id = ?',
    )
    .get(githubId) as Row | undefined
  return row ? fromRow(row) : null
}

export const upsertUserByEmail = (
  db: Db,
  input: { email: string; name?: string | null; githubId?: string | null },
): User => {
  const existing = findUserByEmail(db, input.email)
  if (existing) {
    if (input.githubId && existing.githubId !== input.githubId) {
      db.prepare('UPDATE users SET github_id = ? WHERE id = ?').run(
        input.githubId,
        existing.id,
      )
      return { ...existing, githubId: input.githubId }
    }
    return existing
  }
  return createUser(db, input)
}
