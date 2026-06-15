import { randomUUID } from 'node:crypto'
import type { Db } from '../db.ts'
import { getPointsBalance } from './points.ts'

export type Reward = {
  id: string
  groupId: string
  name: string
  description: string | null
  pointsCost: number
  createdAt: number
}

type Row = {
  id: string
  group_id: string
  name: string
  description: string | null
  points_cost: number
  created_at: number
}

const fromRow = (r: Row): Reward => ({
  id: r.id,
  groupId: r.group_id,
  name: r.name,
  description: r.description,
  pointsCost: r.points_cost,
  createdAt: r.created_at,
})

export const createReward = (
  db: Db,
  input: {
    groupId: string
    name: string
    description?: string | null
    pointsCost: number
  },
): Reward => {
  const id = randomUUID()
  const createdAt = Date.now()
  db.prepare(
    `INSERT INTO rewards (id, group_id, name, description, points_cost, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.groupId,
    input.name,
    input.description ?? null,
    input.pointsCost,
    createdAt,
  )
  return {
    id,
    groupId: input.groupId,
    name: input.name,
    description: input.description ?? null,
    pointsCost: input.pointsCost,
    createdAt,
  }
}

export const listRewards = (db: Db, groupId: string): Reward[] => {
  const rows = db
    .prepare(
      `SELECT id, group_id, name, description, points_cost, created_at
       FROM rewards WHERE group_id = ?
       ORDER BY points_cost ASC`,
    )
    .all(groupId) as Row[]
  return rows.map(fromRow)
}

export const getRewardById = (db: Db, id: string): Reward | null => {
  const row = db
    .prepare(
      'SELECT id, group_id, name, description, points_cost, created_at FROM rewards WHERE id = ?',
    )
    .get(id) as Row | undefined
  return row ? fromRow(row) : null
}

export const deleteReward = (db: Db, id: string): void => {
  db.prepare('DELETE FROM rewards WHERE id = ?').run(id)
}

export type RedeemResult =
  | { ok: true; balanceAfter: number }
  | {
      ok: false
      reason: 'reward_not_found' | 'insufficient_points'
      balance: number
    }

export const redeemReward = (
  db: Db,
  childId: string,
  rewardId: string,
): RedeemResult => {
  const reward = getRewardById(db, rewardId)
  if (!reward) {
    return {
      ok: false,
      reason: 'reward_not_found',
      balance: getPointsBalance(db, childId),
    }
  }
  const balance = getPointsBalance(db, childId)
  if (balance < reward.pointsCost) {
    return { ok: false, reason: 'insufficient_points', balance }
  }
  db.prepare(
    `INSERT INTO point_transactions (id, child_id, points, type, description, reward_id, created_at)
     VALUES (?, ?, ?, 'reward', ?, ?, ?)`,
  ).run(
    randomUUID(),
    childId,
    -reward.pointsCost,
    `Redeemed: ${reward.name}`,
    rewardId,
    Date.now(),
  )
  return { ok: true, balanceAfter: balance - reward.pointsCost }
}
