import type { DB } from './connection.js'
import { generateId } from './ids.js'
import type { Reward } from './types.js'

/**
 * Fetch a reward by id, or null.
 */
export function getReward(db: DB, rewardId: string): Reward | null {
  const row = db.prepare<[string], Reward>('SELECT * FROM rewards WHERE id = ?').get(rewardId)
  return row ?? null
}

/**
 * List a group's rewards, ordered by name. Mirrors MCP list_rewards.
 */
export function listRewards(db: DB, groupId: string): Reward[] {
  return db
    .prepare<[string], Reward>('SELECT * FROM rewards WHERE group_id = ? ORDER BY name')
    .all(groupId)
}

/**
 * Create a reward. Mirrors MCP create_reward.
 */
export function createReward(
  db: DB,
  groupId: string,
  name: string,
  pointsCost: number,
  description = '',
): Reward {
  const now = new Date().toISOString()
  const id = generateId()
  db.prepare(
    'INSERT INTO rewards (id, name, description, pointsCost, group_id, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, name, description, pointsCost, groupId, now, now)
  return getReward(db, id) as Reward
}

/**
 * Update a reward. Only provided fields change. Mirrors MCP update_reward
 * (name uses a truthy guard; description/pointsCost use !== undefined).
 */
export function updateReward(
  db: DB,
  rewardId: string,
  updates: { name?: string; description?: string; pointsCost?: number },
): void {
  const sets: string[] = []
  const values: unknown[] = []
  if (updates.name) {
    sets.push('name = ?')
    values.push(updates.name)
  }
  if (updates.description !== undefined) {
    sets.push('description = ?')
    values.push(updates.description)
  }
  if (updates.pointsCost !== undefined) {
    sets.push('pointsCost = ?')
    values.push(updates.pointsCost)
  }
  if (sets.length === 0) return
  sets.push('updated = ?')
  values.push(new Date().toISOString())
  values.push(rewardId)
  db.prepare(`UPDATE rewards SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]))
}

/**
 * Delete a reward. Mirrors MCP delete_reward.
 */
export function deleteReward(db: DB, rewardId: string): void {
  db.prepare('DELETE FROM rewards WHERE id = ?').run(rewardId)
}
