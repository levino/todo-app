import type { DB } from './connection.js'
import { generateId } from './ids.js'
import type { Child } from './types.js'

/**
 * List the children in a group, ordered by name. Mirrors MCP list_children.
 */
export function listChildren(db: DB, groupId: string): Child[] {
  return db
    .prepare<[string], Child>('SELECT * FROM children WHERE group_id = ? ORDER BY name')
    .all(groupId)
}

/**
 * Fetch a single child by id, or null.
 */
export function getChild(db: DB, childId: string): Child | null {
  const row = db.prepare<[string], Child>('SELECT * FROM children WHERE id = ?').get(childId)
  return row ?? null
}

/**
 * Create a child in a group. Mirrors MCP create_child.
 */
export function createChild(
  db: DB,
  groupId: string,
  name: string,
  color: string,
): Child {
  const now = new Date().toISOString()
  const id = generateId()
  db.prepare(
    'INSERT INTO children (id, name, color, group_id, created, updated) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, name, color, groupId, now, now)
  return getChild(db, id) as Child
}

/**
 * Update a child's name and/or color. Only provided fields change.
 * Mirrors MCP update_child.
 */
export function updateChild(
  db: DB,
  childId: string,
  updates: { name?: string; color?: string },
): void {
  const sets: string[] = []
  const values: unknown[] = []
  if (updates.name !== undefined) {
    sets.push('name = ?')
    values.push(updates.name)
  }
  if (updates.color !== undefined) {
    sets.push('color = ?')
    values.push(updates.color)
  }
  if (sets.length === 0) return
  sets.push('updated = ?')
  values.push(new Date().toISOString())
  values.push(childId)
  db.prepare(`UPDATE children SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]))
}

/**
 * Delete a child and all their tasks + point_transactions. Mirrors MCP
 * delete_child (which deletes the child's tasks first).
 */
export function deleteChild(db: DB, childId: string): void {
  const run = db.transaction(() => {
    db.prepare('DELETE FROM point_transactions WHERE child_id = ?').run(childId)
    db.prepare('DELETE FROM tasks WHERE child_id = ?').run(childId)
    db.prepare('DELETE FROM children WHERE id = ?').run(childId)
  })
  run()
}
