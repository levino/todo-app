import type { DB } from './connection.js'
import { generateId } from './ids.js'
import { getReward } from './rewards.js'
import type { PointTransaction } from './types.js'

/**
 * Current points balance for a child = SUM(points) of their transactions.
 * Mirrors MCP get_points_balance.
 */
export function getPointsBalance(db: DB, childId: string): number {
  const row = db
    .prepare<[string], { balance: number | null }>(
      'SELECT SUM(points) AS balance FROM point_transactions WHERE child_id = ?',
    )
    .get(childId)
  return row?.balance ?? 0
}

/**
 * Number of point transactions for a child (used by get_points_balance output).
 */
export function countPointTransactions(db: DB, childId: string): number {
  const row = db
    .prepare<[string], { n: number }>(
      'SELECT COUNT(*) AS n FROM point_transactions WHERE child_id = ?',
    )
    .get(childId)
  return row?.n ?? 0
}

/**
 * List a child's point transactions (most recent first).
 */
export function listPointTransactions(db: DB, childId: string): PointTransaction[] {
  return db
    .prepare<[string], PointTransaction>(
      'SELECT * FROM point_transactions WHERE child_id = ? ORDER BY created DESC',
    )
    .all(childId)
}

export interface CreatePointTransactionInput {
  childId: string
  points: number
  type: string
  description?: string
  rewardId?: string | null
  taskId?: string | null
}

/**
 * Insert a raw point transaction (positive = earned, negative = spent).
 */
export function createPointTransaction(
  db: DB,
  input: CreatePointTransactionInput,
): PointTransaction {
  const now = new Date().toISOString()
  const id = generateId()
  db.prepare(
    `INSERT INTO point_transactions
       (id, child_id, points, type, description, reward_id, task_id, created, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.childId,
    input.points,
    input.type,
    input.description ?? '',
    input.rewardId ?? null,
    input.taskId ?? null,
    now,
    now,
  )
  return db
    .prepare<[string], PointTransaction>('SELECT * FROM point_transactions WHERE id = ?')
    .get(id) as PointTransaction
}

export interface RedeemRewardResult {
  error?: string
  balance: number
  newBalance?: number
  reward?: { id: string; name: string; pointsCost: number }
}

/**
 * Redeem a reward for a child. Checks the child's balance against the reward
 * cost; if sufficient, inserts a negative 'redeemed' point_transaction.
 * Mirrors MCP redeem_reward (balance check then insert).
 */
export function redeemReward(
  db: DB,
  childId: string,
  rewardId: string,
): RedeemRewardResult {
  const reward = getReward(db, rewardId)
  if (!reward) {
    return { error: 'reward-not-found', balance: getPointsBalance(db, childId) }
  }

  const run = db.transaction((): RedeemRewardResult => {
    const balance = getPointsBalance(db, childId)
    if (balance < reward.pointsCost) {
      return { error: 'insufficient-points', balance }
    }
    createPointTransaction(db, {
      childId,
      points: -reward.pointsCost,
      type: 'redeemed',
      description: `Redeemed: ${reward.name}`,
      rewardId,
    })
    return {
      balance,
      newBalance: balance - reward.pointsCost,
      reward: { id: reward.id, name: reward.name, pointsCost: reward.pointsCost },
    }
  })

  return run()
}
