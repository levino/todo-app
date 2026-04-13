import { randomUUID } from 'node:crypto'
import type { Db } from '../db.ts'

export type Child = {
  id: string
  groupId: string
  name: string
  color: string
  createdAt: number
}

type Row = {
  id: string
  group_id: string
  name: string
  color: string
  created_at: number
}

const fromRow = (r: Row): Child => ({
  id: r.id,
  groupId: r.group_id,
  name: r.name,
  color: r.color,
  createdAt: r.created_at,
})

export const createChild = (
  db: Db,
  input: { groupId: string; name: string; color: string },
): Child => {
  const id = randomUUID()
  const createdAt = Date.now()
  db.prepare(
    'INSERT INTO children (id, group_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, input.groupId, input.name, input.color, createdAt)
  return { id, ...input, createdAt }
}

export const listChildren = (db: Db, groupId: string): Child[] => {
  const rows = db
    .prepare(
      'SELECT id, group_id, name, color, created_at FROM children WHERE group_id = ? ORDER BY created_at ASC',
    )
    .all(groupId) as Row[]
  return rows.map(fromRow)
}

export const getChildById = (db: Db, id: string): Child | null => {
  const row = db
    .prepare(
      'SELECT id, group_id, name, color, created_at FROM children WHERE id = ?',
    )
    .get(id) as Row | undefined
  return row ? fromRow(row) : null
}

export const updateChild = (
  db: Db,
  id: string,
  updates: { name?: string; color?: string },
): Child | null => {
  const existing = getChildById(db, id)
  if (!existing) return null
  const next = { ...existing, ...updates }
  db.prepare('UPDATE children SET name = ?, color = ? WHERE id = ?').run(
    next.name,
    next.color,
    id,
  )
  return next
}

export const deleteChild = (db: Db, id: string): void => {
  db.prepare('DELETE FROM children WHERE id = ?').run(id)
}
