import type { DB } from './connection.js'
import { generateId } from './ids.js'
import type { Group, User } from './types.js'

/**
 * Predefined child-friendly colors (ported from frontend/lib/groups.ts and the
 * MCP server). Kept here so both consumers share one source of truth.
 */
export const CHILD_COLORS = [
  { name: 'Rot', value: '#FF6B6B' },
  { name: 'Orange', value: '#FFA94D' },
  { name: 'Gelb', value: '#FFE066' },
  { name: 'Grün', value: '#69DB7C' },
  { name: 'Blau', value: '#4DABF7' },
  { name: 'Lila', value: '#B197FC' },
  { name: 'Pink', value: '#F783AC' },
] as const

/**
 * Get initials from a name (e.g. "Max Müller" -> "MM"). Max 2 characters.
 * Ported verbatim from frontend/lib/groups.ts.
 */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2)
}

/**
 * Whether a user is a member of a group. Foundation for ownership scoping.
 */
export function userInGroup(db: DB, userId: string, groupId: string): boolean {
  const row = db
    .prepare<[string, string], { id: string }>(
      'SELECT id FROM user_groups WHERE user_id = ? AND group_id = ?',
    )
    .get(userId, groupId)
  return !!row
}

/** Alias kept to match the frontend lib function name. */
export const isUserInGroup = userInGroup

/**
 * All groups a user belongs to (scoped via user_groups), ordered by name.
 */
export function getUserGroups(db: DB, userId: string): Group[] {
  return db
    .prepare<[string], Group>(
      `SELECT g.* FROM groups g
       JOIN user_groups ug ON ug.group_id = g.id
       WHERE ug.user_id = ?
       ORDER BY g.name`,
    )
    .all(userId)
}

/**
 * Fetch a single group by id, regardless of membership.
 */
export function getGroup(db: DB, groupId: string): Group | null {
  const row = db.prepare<[string], Group>('SELECT * FROM groups WHERE id = ?').get(groupId)
  return row ?? null
}

/**
 * Create a group and add the creating user as its first member. Mirrors the
 * MCP create_group tool (group + user_groups membership in one step).
 */
export function createGroup(db: DB, userId: string, name: string): Group {
  const now = new Date().toISOString()
  const id = generateId()
  const create = db.transaction(() => {
    db.prepare(
      'INSERT INTO groups (id, name, morningEnd, eveningStart, timezone, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, name, '09:00', '18:00', 'Europe/Berlin', now, now)
    addUserToGroup(db, userId, id)
  })
  create()
  return getGroup(db, id) as Group
}

/**
 * Delete a group, cascading to its children, their tasks, point_transactions,
 * rewards and memberships. Mirrors MCP delete_group. (FK ON DELETE CASCADE
 * already covers most of this; we run it explicitly inside a transaction so the
 * behaviour is identical regardless of pragma state.)
 */
export function deleteGroup(db: DB, groupId: string): void {
  const run = db.transaction(() => {
    db.prepare(
      `DELETE FROM point_transactions
       WHERE child_id IN (SELECT id FROM children WHERE group_id = ?)`,
    ).run(groupId)
    db.prepare(
      `DELETE FROM tasks
       WHERE child_id IN (SELECT id FROM children WHERE group_id = ?)`,
    ).run(groupId)
    db.prepare('DELETE FROM children WHERE group_id = ?').run(groupId)
    db.prepare('DELETE FROM rewards WHERE group_id = ?').run(groupId)
    db.prepare('DELETE FROM user_groups WHERE group_id = ?').run(groupId)
    db.prepare('DELETE FROM groups WHERE id = ?').run(groupId)
  })
  run()
}

/**
 * Update a group's phase-time configuration. Only provided fields change.
 * Mirrors MCP configure_phase_times.
 */
export function configurePhaseTimes(
  db: DB,
  groupId: string,
  updates: { morningEnd?: string; eveningStart?: string; timezone?: string },
): void {
  const sets: string[] = []
  const values: unknown[] = []
  if (updates.morningEnd !== undefined) {
    sets.push('morningEnd = ?')
    values.push(updates.morningEnd)
  }
  if (updates.eveningStart !== undefined) {
    sets.push('eveningStart = ?')
    values.push(updates.eveningStart)
  }
  if (updates.timezone !== undefined) {
    sets.push('timezone = ?')
    values.push(updates.timezone)
  }
  if (sets.length === 0) return
  sets.push('updated = ?')
  values.push(new Date().toISOString())
  values.push(groupId)
  db.prepare(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]))
}

/**
 * Add a user to a group (idempotent: a duplicate membership is ignored thanks
 * to the unique index). Ported from frontend addUserToGroup / MCP add_member.
 */
export function addUserToGroup(db: DB, userId: string, groupId: string): void {
  if (userInGroup(db, userId, groupId)) return
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO user_groups (id, user_id, group_id, created, updated) VALUES (?, ?, ?, ?, ?)',
  ).run(generateId(), userId, groupId, now, now)
}

/**
 * Remove a user from a group. Ported from frontend removeUserFromGroup /
 * MCP remove_member.
 */
export function removeUserFromGroup(db: DB, userId: string, groupId: string): void {
  db.prepare('DELETE FROM user_groups WHERE user_id = ? AND group_id = ?').run(
    userId,
    groupId,
  )
}

/**
 * List the member users of a group. Mirrors MCP list_members.
 */
export function listMembers(db: DB, groupId: string): User[] {
  return db
    .prepare<[string], User>(
      `SELECT u.* FROM users u
       JOIN user_groups ug ON ug.user_id = u.id
       WHERE ug.group_id = ?
       ORDER BY u.email`,
    )
    .all(groupId)
}
