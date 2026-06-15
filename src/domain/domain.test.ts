import { beforeEach, describe, expect, it } from 'vitest'
import { type Db, openDb } from '../db.ts'
import { createChild, listChildren } from './children.ts'
import { createGroup, isUserInGroup, listGroupsForUser } from './groups.ts'
import { getPointsBalance } from './points.ts'
import { createReward, redeemReward } from './rewards.ts'
import {
  completeTask,
  createTask,
  isTaskActiveNow,
  listActiveTasksForChild,
  type Task,
} from './tasks.ts'
import { createTimePhase, isPhaseActiveAt } from './time_phases.ts'
import { createUser, upsertUserByEmail } from './users.ts'

let db: Db
let userId: string
let groupId: string
let childId: string

beforeEach(() => {
  db = openDb(':memory:')
  const u = createUser(db, { email: 'parent@test' })
  userId = u.id
  const g = createGroup(db, { name: 'Family', createdBy: userId })
  groupId = g.id
  const c = createChild(db, { groupId, name: 'Kid', color: '#f00' })
  childId = c.id
})

describe('users', () => {
  it('upsertUserByEmail returns the existing user', () => {
    const first = upsertUserByEmail(db, { email: 'x@test' })
    const second = upsertUserByEmail(db, { email: 'x@test' })
    expect(second.id).toBe(first.id)
  })
})

describe('groups', () => {
  it('createGroup adds the creator as a member', () => {
    expect(isUserInGroup(db, userId, groupId)).toBe(true)
  })

  it('listGroupsForUser returns only the groups the user belongs to', () => {
    const other = createUser(db, { email: 'other@test' })
    const otherGroup = createGroup(db, { name: 'Other', createdBy: other.id })
    const mine = listGroupsForUser(db, userId)
    expect(mine.map((g) => g.id)).toEqual([groupId])
    const theirs = listGroupsForUser(db, other.id)
    expect(theirs.map((g) => g.id)).toEqual([otherGroup.id])
  })
})

describe('children', () => {
  it('listChildren scopes by group', () => {
    const other = createUser(db, { email: 'other@test' })
    const otherGroup = createGroup(db, { name: 'Other', createdBy: other.id })
    createChild(db, { groupId: otherGroup.id, name: 'Bob', color: '#0f0' })
    const kids = listChildren(db, groupId)
    expect(kids.map((c) => c.name)).toEqual(['Kid'])
  })
})

describe('time phases', () => {
  it('isPhaseActiveAt checks day and time window', () => {
    const phase = {
      id: 'x',
      groupId,
      name: 'Morning',
      startHour: 7,
      startMinute: 0,
      endHour: 9,
      endMinute: 0,
      daysOfWeek: [1, 2, 3, 4, 5],
      sortOrder: 0,
    }
    const mondayMorning = new Date('2025-01-06T08:00:00')
    const mondayEvening = new Date('2025-01-06T20:00:00')
    const saturdayMorning = new Date('2025-01-11T08:00:00')
    expect(isPhaseActiveAt(phase, mondayMorning)).toBe(true)
    expect(isPhaseActiveAt(phase, mondayEvening)).toBe(false)
    expect(isPhaseActiveAt(phase, saturdayMorning)).toBe(false)
  })
})

describe('tasks', () => {
  it('listActiveTasksForChild filters by phase and completion state', () => {
    const phase = createTimePhase(db, {
      groupId,
      name: 'Morning',
      startHour: 7,
      startMinute: 0,
      endHour: 9,
      endMinute: 0,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      sortOrder: 0,
    })
    createTask(db, {
      childId,
      timePhaseId: phase.id,
      title: 'Brush teeth',
      points: 1,
    })
    const later = createTask(db, { childId, title: 'No phase task', points: 0 })

    const morning = new Date('2025-01-06T08:00:00')
    const morningActive = listActiveTasksForChild(db, childId, morning)
    expect(morningActive.map((t) => t.title).sort()).toEqual([
      'Brush teeth',
      'No phase task',
    ])

    const evening = new Date('2025-01-06T20:00:00')
    const eveningActive = listActiveTasksForChild(db, childId, evening)
    expect(eveningActive.map((t) => t.title)).toEqual(['No phase task'])

    // completing a daily task hides it for the rest of the day
    completeTask(db, later.id, morning.getTime())
    const afterComplete = listActiveTasksForChild(db, childId, evening)
    expect(afterComplete.map((t) => t.title)).toEqual([])
  })

  it('isTaskActiveNow respects recurrence', () => {
    const phases = new Set<string>()
    const daily: Task = {
      id: 'a',
      childId,
      timePhaseId: null,
      title: 'Daily',
      priority: 0,
      points: 0,
      recurrenceType: 'daily',
      recurrenceDays: null,
      createdAt: 0,
      lastCompletedAt: null,
    }
    const now = new Date('2025-01-06T20:00:00')
    expect(isTaskActiveNow(daily, phases, now)).toBe(true)
    daily.lastCompletedAt = new Date('2025-01-06T07:00:00').getTime()
    expect(isTaskActiveNow(daily, phases, now)).toBe(false)
    daily.lastCompletedAt = new Date('2025-01-05T20:00:00').getTime()
    expect(isTaskActiveNow(daily, phases, now)).toBe(true)

    const once: Task = {
      ...daily,
      recurrenceType: 'once',
      lastCompletedAt: null,
    }
    expect(isTaskActiveNow(once, phases, now)).toBe(true)
    once.lastCompletedAt = 1
    expect(isTaskActiveNow(once, phases, now)).toBe(false)
  })

  it('completeTask writes a point transaction when points > 0', () => {
    const task = createTask(db, { childId, title: 'Dishes', points: 3 })
    const result = completeTask(db, task.id)
    expect(result?.pointsEarned).toBe(3)
    expect(getPointsBalance(db, childId)).toBe(3)
  })

  it('completeTask writes no point transaction when points = 0', () => {
    const task = createTask(db, { childId, title: 'Clean room', points: 0 })
    completeTask(db, task.id)
    expect(getPointsBalance(db, childId)).toBe(0)
  })
})

describe('rewards', () => {
  it('redeemReward rejects when insufficient points', () => {
    const reward = createReward(db, {
      groupId,
      name: 'Ice cream',
      pointsCost: 10,
    })
    const result = redeemReward(db, childId, reward.id)
    expect(result).toEqual({
      ok: false,
      reason: 'insufficient_points',
      balance: 0,
    })
    expect(getPointsBalance(db, childId)).toBe(0)
  })

  it('redeemReward deducts the cost on success', () => {
    const task = createTask(db, { childId, title: 'Chore', points: 15 })
    completeTask(db, task.id)
    const reward = createReward(db, {
      groupId,
      name: 'Ice cream',
      pointsCost: 10,
    })
    const result = redeemReward(db, childId, reward.id)
    expect(result).toEqual({ ok: true, balanceAfter: 5 })
    expect(getPointsBalance(db, childId)).toBe(5)
  })
})
