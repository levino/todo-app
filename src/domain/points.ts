import type { Db } from '../db.ts'

export type PointTransaction = {
  id: string
  childId: string
  points: number
  type: 'task' | 'reward' | 'manual'
  description: string | null
  taskId: string | null
  rewardId: string | null
  createdAt: number
}

type Row = {
  id: string
  child_id: string
  points: number
  type: string
  description: string | null
  task_id: string | null
  reward_id: string | null
  created_at: number
}

const fromRow = (r: Row): PointTransaction => ({
  id: r.id,
  childId: r.child_id,
  points: r.points,
  type: r.type as PointTransaction['type'],
  description: r.description,
  taskId: r.task_id,
  rewardId: r.reward_id,
  createdAt: r.created_at,
})

export const getPointsBalance = (db: Db, childId: string): number => {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(points), 0) as total FROM point_transactions WHERE child_id = ?',
    )
    .get(childId) as { total: number }
  return row.total
}

export const listPointTransactions = (
  db: Db,
  childId: string,
  limit = 50,
): PointTransaction[] => {
  const rows = db
    .prepare(
      `SELECT id, child_id, points, type, description, task_id, reward_id, created_at
       FROM point_transactions WHERE child_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(childId, limit) as Row[]
  return rows.map(fromRow)
}
