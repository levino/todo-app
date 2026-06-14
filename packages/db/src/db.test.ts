import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type DB,
  addUserToGroup,
  createChild,
  createDb,
  createGroup,
  createPointTransaction,
  createReward,
  createTask,
  completeTask,
  deleteGroup,
  deleteTask,
  getPointsBalance,
  getTask,
  getTasksPageViewForChild,
  getUserByEmail,
  getUserGroups,
  listChildren,
  listMembers,
  listTasks,
  redeemReward,
  removeUserFromGroup,
  resetTask,
  undoTask,
  upsertUserByEmail,
  userInGroup,
} from './index.js'

// Integration tests exercising the raw-SQL data layer against a fresh
// in-memory database (migrations applied via createDb(':memory:')).

let db: DB

beforeEach(() => {
  db = createDb(':memory:')
})

afterEach(() => {
  db.close()
})

describe('migrations', () => {
  it('apply cleanly on a fresh :memory: db and create every table + the view', () => {
    const names = db
      .prepare<[], { name: string; type: string }>(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
      )
      .all()
      .map((r) => r.name)

    for (const t of [
      'users',
      'groups',
      'children',
      'user_groups',
      'tasks',
      'rewards',
      'point_transactions',
      'tasks_page_view',
      'schema_migrations',
    ]) {
      expect(names).toContain(t)
    }
  })

  it('records applied migrations in schema_migrations and is idempotent', () => {
    const before = db
      .prepare<[], { name: string }>('SELECT name FROM schema_migrations')
      .all()
    expect(before.length).toBeGreaterThan(0)

    // Re-opening the same in-memory db is not possible, but a second createDb
    // on a fresh db must also leave exactly the migration set applied.
    const db2 = createDb(':memory:')
    const after = db2
      .prepare<[], { name: string }>('SELECT name FROM schema_migrations')
      .all()
    expect(after.map((r) => r.name)).toEqual(before.map((r) => r.name))
    db2.close()
  })
})

describe('upsertUserByEmail', () => {
  it('inserts a new user when absent', () => {
    const u = upsertUserByEmail(db, 'a@example.com', 'Alice')
    expect(u.email).toBe('a@example.com')
    expect(u.name).toBe('Alice')
    expect(u.id).toHaveLength(15)
    expect(getUserByEmail(db, 'a@example.com')?.id).toBe(u.id)
  })

  it('returns the same row (no duplicate) on second call', () => {
    const first = upsertUserByEmail(db, 'a@example.com', 'Alice')
    const second = upsertUserByEmail(db, 'a@example.com')
    expect(second.id).toBe(first.id)
    const count = db
      .prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM users')
      .get()
    expect(count?.n).toBe(1)
  })

  it('refreshes the name when a new one is supplied', () => {
    const first = upsertUserByEmail(db, 'a@example.com', 'Alice')
    const updated = upsertUserByEmail(db, 'a@example.com', 'Alice B')
    expect(updated.id).toBe(first.id)
    expect(updated.name).toBe('Alice B')
  })
})

describe('group membership scoping', () => {
  it('createGroup makes the creator a member; getUserGroups is scoped per user', () => {
    const alice = upsertUserByEmail(db, 'alice@example.com')
    const bob = upsertUserByEmail(db, 'bob@example.com')

    const g = createGroup(db, alice.id, 'Family A')

    expect(userInGroup(db, alice.id, g.id)).toBe(true)
    expect(userInGroup(db, bob.id, g.id)).toBe(false)

    expect(getUserGroups(db, alice.id).map((x) => x.id)).toEqual([g.id])
    expect(getUserGroups(db, bob.id)).toEqual([])
  })

  it('addUserToGroup is idempotent and removeUserFromGroup works', () => {
    const alice = upsertUserByEmail(db, 'alice@example.com')
    const bob = upsertUserByEmail(db, 'bob@example.com')
    const g = createGroup(db, alice.id, 'Family A')

    addUserToGroup(db, bob.id, g.id)
    addUserToGroup(db, bob.id, g.id) // duplicate ignored
    expect(listMembers(db, g.id).map((m) => m.id).sort()).toEqual(
      [alice.id, bob.id].sort(),
    )

    removeUserFromGroup(db, bob.id, g.id)
    expect(userInGroup(db, bob.id, g.id)).toBe(false)
    expect(listMembers(db, g.id).map((m) => m.id)).toEqual([alice.id])
  })

  it('deleteGroup cascades children, tasks, point_transactions, rewards and memberships', () => {
    const alice = upsertUserByEmail(db, 'alice@example.com')
    const g = createGroup(db, alice.id, 'Family A')
    const child = createChild(db, g.id, 'Kid', '#FF6B6B')
    const task = createTask(db, child.id, { title: 'Brush teeth', timeOfDay: 'morning' })
    createReward(db, g.id, 'Ice cream', 10)
    createPointTransaction(db, { childId: child.id, points: 5, type: 'earned' })

    deleteGroup(db, g.id)

    expect(listChildren(db, g.id)).toEqual([])
    expect(getTask(db, task.id)).toBeNull()
    expect(
      db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM rewards').get()?.n,
    ).toBe(0)
    expect(
      db
        .prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM point_transactions')
        .get()?.n,
    ).toBe(0)
    expect(userInGroup(db, alice.id, g.id)).toBe(false)
  })
})

describe('completeTask / undoTask / deleteTask', () => {
  function setup() {
    const alice = upsertUserByEmail(db, 'alice@example.com')
    const g = createGroup(db, alice.id, 'Family A')
    const child = createChild(db, g.id, 'Kid', '#FF6B6B')
    return { alice, g, child }
  }

  it('completeTask marks a one-off task completed', () => {
    const { alice, g, child } = setup()
    const task = createTask(db, child.id, { title: 'Tidy room', timeOfDay: 'afternoon' })

    const res = completeOneOff(db, task.id, child.id, alice.id, g.id)
    expect(res.error).toBeUndefined()

    const after = getTask(db, task.id)
    expect(after?.completed).toBe(true)
    expect(after?.completedBy).toBe(alice.id)
    expect(after?.completedAt).toBeTruthy()
  })

  it('completeTask on an already-completed task returns already-completed', () => {
    const { alice, g, child } = setup()
    const task = createTask(db, child.id, { title: 'Tidy room', timeOfDay: 'afternoon' })
    completeOneOff(db, task.id, child.id, alice.id, g.id)
    const res = completeOneOff(db, task.id, child.id, alice.id, g.id)
    expect(res.error).toBe('already-completed')
  })

  it('completeTask reschedules a recurring task instead of completing it', () => {
    const { alice, g, child } = setup()
    const task = createTask(db, child.id, {
      title: 'Water plants',
      timeOfDay: 'morning',
      recurrenceType: 'interval',
      recurrenceInterval: 3,
      dueDate: '2026-03-10T00:00:00.000Z',
    })

    const res = completeOneOff(db, task.id, child.id, alice.id, g.id)
    expect(res.error).toBeUndefined()

    const after = getTask(db, task.id)
    expect(after?.completed).toBe(false)
    expect(after?.lastCompletedAt).toBeTruthy()
    // dueDate advanced into the future
    expect(after?.dueDate?.slice(0, 10)).not.toBe('2026-03-10')
    expect(after?.previousDueDate?.slice(0, 10)).toBe('2026-03-10')
  })

  it('completeTask refuses a not-yet-due task', () => {
    const { alice, g, child } = setup()
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    const task = createTask(db, child.id, {
      title: 'Future task',
      timeOfDay: 'afternoon',
      dueDate: future,
    })
    const res = completeOneOff(db, task.id, child.id, alice.id, g.id)
    expect(res.error).toBe('not-yet-due')
  })

  it('undoTask reverts a completion done today', () => {
    const { alice, g, child } = setup()
    const task = createTask(db, child.id, { title: 'Tidy room', timeOfDay: 'afternoon' })
    completeOneOff(db, task.id, child.id, alice.id, g.id)

    const res = undoTask(db, task.id, 'Europe/Berlin')
    expect(res.error).toBeUndefined()
    const after = getTask(db, task.id)
    expect(after?.completed).toBe(false)
    expect(after?.completedAt).toBeNull()
  })

  it('undoTask refuses when nothing was completed today', () => {
    const { child } = setup()
    const task = createTask(db, child.id, { title: 'Tidy room', timeOfDay: 'afternoon' })
    const res = undoTask(db, task.id, 'Europe/Berlin')
    expect(res.error).toBe('not-completed-today')
  })

  it('deleteTask removes a one-off task', () => {
    const { child } = setup()
    const task = createTask(db, child.id, { title: 'One off', timeOfDay: 'afternoon' })
    const res = deleteTask(db, task.id, 'Europe/Berlin')
    expect(res.error).toBeUndefined()
    expect(getTask(db, task.id)).toBeNull()
  })

  it('deleteTask on a recurring task advances dueDate past today instead of deleting', () => {
    const { child } = setup()
    const task = createTask(db, child.id, {
      title: 'Recurring',
      timeOfDay: 'morning',
      recurrenceType: 'interval',
      recurrenceInterval: 1,
      dueDate: '2026-03-10T00:00:00.000Z',
    })
    const res = deleteTask(db, task.id, 'Europe/Berlin')
    expect(res.error).toBeUndefined()
    const after = getTask(db, task.id)
    expect(after).not.toBeNull()
    // dueDate moved strictly past today's backlog
    const todayStr = new Date().toISOString().slice(0, 10)
    expect((after?.dueDate ?? '').slice(0, 10) > todayStr).toBe(true)
  })

  it('deleteTask returns not-found for a missing task', () => {
    expect(deleteTask(db, 'doesnotexist0001').error).toBe('not-found')
  })

  it('resetTask clears completion', () => {
    const { alice, g, child } = setup()
    const task = createTask(db, child.id, { title: 'Tidy room', timeOfDay: 'afternoon' })
    completeOneOff(db, task.id, child.id, alice.id, g.id)
    resetTask(db, task.id)
    expect(getTask(db, task.id)?.completed).toBe(false)
  })

  it('listTasks excludes completed tasks by default and includes them when asked', () => {
    const { alice, g, child } = setup()
    const a = createTask(db, child.id, { title: 'A', timeOfDay: 'afternoon' })
    createTask(db, child.id, { title: 'B', timeOfDay: 'afternoon' })
    completeOneOff(db, a.id, child.id, alice.id, g.id)

    expect(listTasks(db, child.id).map((t) => t.title).sort()).toEqual(['B'])
    expect(listTasks(db, child.id, true).map((t) => t.title).sort()).toEqual(['A', 'B'])
  })
})

describe('points + redeemReward balance check', () => {
  function setup() {
    const alice = upsertUserByEmail(db, 'alice@example.com')
    const g = createGroup(db, alice.id, 'Family A')
    const child = createChild(db, g.id, 'Kid', '#FF6B6B')
    return { alice, g, child }
  }

  it('getPointsBalance sums transactions (0 when none)', () => {
    const { child } = setup()
    expect(getPointsBalance(db, child.id)).toBe(0)
    createPointTransaction(db, { childId: child.id, points: 10, type: 'earned' })
    createPointTransaction(db, { childId: child.id, points: 5, type: 'earned' })
    expect(getPointsBalance(db, child.id)).toBe(15)
  })

  it('redeemReward rejects when balance is insufficient and writes nothing', () => {
    const { g, child } = setup()
    const reward = createReward(db, g.id, 'Toy', 20)
    createPointTransaction(db, { childId: child.id, points: 5, type: 'earned' })

    const res = redeemReward(db, child.id, reward.id)
    expect(res.error).toBe('insufficient-points')
    expect(res.balance).toBe(5)
    expect(getPointsBalance(db, child.id)).toBe(5) // unchanged
  })

  it('redeemReward deducts points via a negative transaction when affordable', () => {
    const { g, child } = setup()
    const reward = createReward(db, g.id, 'Toy', 20)
    createPointTransaction(db, { childId: child.id, points: 25, type: 'earned' })

    const res = redeemReward(db, child.id, reward.id)
    expect(res.error).toBeUndefined()
    expect(res.newBalance).toBe(5)
    expect(getPointsBalance(db, child.id)).toBe(5)
    expect(res.reward?.name).toBe('Toy')
  })

  it('redeemReward returns reward-not-found for a missing reward', () => {
    const { child } = setup()
    const res = redeemReward(db, child.id, 'missingreward01')
    expect(res.error).toBe('reward-not-found')
  })
})

describe('tasks_page_view', () => {
  it('exposes children (even with no tasks) and the summed points balance', () => {
    const alice = upsertUserByEmail(db, 'alice@example.com')
    const g = createGroup(db, alice.id, 'Family A')
    const child = createChild(db, g.id, 'Kid', '#FF6B6B')
    createPointTransaction(db, { childId: child.id, points: 7, type: 'earned' })

    const rows = getTasksPageViewForChild(db, child.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].child_name).toBe('Kid')
    expect(rows[0].group_id).toBe(g.id)
    expect(rows[0].child_points_balance).toBe(7)
    expect(rows[0].task_id).toBeNull()
  })
})

// completeTask takes (db, taskId, childId, completedBy, groupId). Wrapper for clarity.
function completeOneOff(
  db: DB,
  taskId: string,
  childId: string,
  completedBy: string,
  groupId: string,
) {
  return completeTask(db, taskId, childId, completedBy, groupId)
}
