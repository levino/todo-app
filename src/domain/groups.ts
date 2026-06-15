import { randomUUID } from 'node:crypto'
import type { Db } from '../db.ts'

export type Group = {
  id: string
  name: string
  createdAt: number
  createdBy: string
}

type Row = {
  id: string
  name: string
  created_at: number
  created_by: string
}

const fromRow = (r: Row): Group => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  createdBy: r.created_by,
})

export const createGroup = (
  db: Db,
  input: { name: string; createdBy: string },
): Group => {
  const id = randomUUID()
  const createdAt = Date.now()
  db.transaction(() => {
    db.prepare(
      'INSERT INTO groups (id, name, created_at, created_by) VALUES (?, ?, ?, ?)',
    ).run(id, input.name, createdAt, input.createdBy)
    db.prepare(
      "INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)",
    ).run(id, input.createdBy, createdAt)
  })()
  return { id, name: input.name, createdAt, createdBy: input.createdBy }
}

export const getGroupById = (db: Db, id: string): Group | null => {
  const row = db
    .prepare('SELECT id, name, created_at, created_by FROM groups WHERE id = ?')
    .get(id) as Row | undefined
  return row ? fromRow(row) : null
}

export const listGroupsForUser = (db: Db, userId: string): Group[] => {
  const rows = db
    .prepare(
      `SELECT g.id, g.name, g.created_at, g.created_by
       FROM groups g
       INNER JOIN group_members m ON m.group_id = g.id
       WHERE m.user_id = ?
       ORDER BY g.created_at ASC`,
    )
    .all(userId) as Row[]
  return rows.map(fromRow)
}

export const isUserInGroup = (
  db: Db,
  userId: string,
  groupId: string,
): boolean => {
  const row = db
    .prepare(
      'SELECT 1 as hit FROM group_members WHERE user_id = ? AND group_id = ?',
    )
    .get(userId, groupId)
  return !!row
}

export const addGroupMember = (
  db: Db,
  groupId: string,
  userId: string,
): void => {
  db.prepare(
    "INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)",
  ).run(groupId, userId, Date.now())
}

export const removeGroupMember = (
  db: Db,
  groupId: string,
  userId: string,
): void => {
  db.prepare(
    'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
  ).run(groupId, userId)
}

export const listGroupMemberIds = (db: Db, groupId: string): string[] => {
  const rows = db
    .prepare('SELECT user_id FROM group_members WHERE group_id = ?')
    .all(groupId) as { user_id: string }[]
  return rows.map((r) => r.user_id)
}
