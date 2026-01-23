import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { processSchedules } from '../lib/scheduleProcessor'
import { createTestUser, createTestGroup, createTestChild, type TestContext } from '../../tests/helpers'

/**
 * Schedule Day Filtering Integration Tests
 *
 * Tests that schedules only create tasks on appropriate days:
 * - daysOfWeek: Only create tasks on specified days
 * - intervalDays: Only create tasks after X days have passed since last completion
 */
describe('Schedule Day Filtering', () => {
  let ctx: TestContext
  let groupId: string
  let childId: string

  beforeEach(async () => {
    ctx = await createTestUser()
    groupId = await createTestGroup(ctx.adminPb, ctx.userId)
    childId = await createTestChild(ctx.adminPb, groupId)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('daysOfWeek filtering', () => {
    it('should create task when today matches daysOfWeek', async () => {
      // January 23, 2026 is a Friday
      vi.setSystemTime(new Date('2026-01-23T08:00:00'))

      await ctx.userPb.collection('schedules').create({
        title: 'Friday task',
        child: childId,
        timePeriod: 'morning',
        daysOfWeek: ['fri'],
        active: true,
      })

      await processSchedules(ctx.adminPb)

      const tasks = await ctx.userPb.collection('tasks').getFullList({
        filter: `child = "${childId}"`,
      })
      expect(tasks).toHaveLength(1)
      expect(tasks[0].title).toBe('Friday task')
    })

    it('should NOT create task when today does not match daysOfWeek', async () => {
      // January 23, 2026 is a Friday
      vi.setSystemTime(new Date('2026-01-23T08:00:00'))

      await ctx.userPb.collection('schedules').create({
        title: 'Monday task',
        child: childId,
        timePeriod: 'morning',
        daysOfWeek: ['mon', 'tue', 'wed', 'thu'], // No Friday!
        active: true,
      })

      await processSchedules(ctx.adminPb)

      const tasks = await ctx.userPb.collection('tasks').getFullList({
        filter: `child = "${childId}"`,
      })
      expect(tasks).toHaveLength(0)
    })

    it('should handle multiple days in daysOfWeek', async () => {
      // January 22, 2026 is a Thursday
      vi.setSystemTime(new Date('2026-01-22T08:00:00'))

      await ctx.userPb.collection('schedules').create({
        title: 'Weekday task',
        child: childId,
        timePeriod: 'morning',
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
        active: true,
      })

      await processSchedules(ctx.adminPb)

      const tasks = await ctx.userPb.collection('tasks').getFullList({
        filter: `child = "${childId}"`,
      })
      expect(tasks).toHaveLength(1)
    })

    it('should handle weekend days', async () => {
      // January 24, 2026 is a Saturday
      vi.setSystemTime(new Date('2026-01-24T08:00:00'))

      await ctx.userPb.collection('schedules').create({
        title: 'Weekend task',
        child: childId,
        timePeriod: 'morning',
        daysOfWeek: ['sat', 'sun'],
        active: true,
      })

      await processSchedules(ctx.adminPb)

      const tasks = await ctx.userPb.collection('tasks').getFullList({
        filter: `child = "${childId}"`,
      })
      expect(tasks).toHaveLength(1)
    })
  })

  describe('intervalDays filtering', () => {
    it('should create task when no previous task exists', async () => {
      vi.setSystemTime(new Date('2026-01-23T08:00:00'))

      await ctx.userPb.collection('schedules').create({
        title: 'Every 2 days',
        child: childId,
        timePeriod: 'morning',
        intervalDays: 2,
        active: true,
      })

      await processSchedules(ctx.adminPb)

      const tasks = await ctx.userPb.collection('tasks').getFullList({
        filter: `child = "${childId}"`,
      })
      expect(tasks).toHaveLength(1)
    })

    it('should NOT create task when interval has not passed since last completion', async () => {
      vi.setSystemTime(new Date('2026-01-23T08:00:00'))

      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Every 3 days',
        child: childId,
        timePeriod: 'morning',
        intervalDays: 3,
        active: true,
      })

      // First run creates a task
      await processSchedules(ctx.adminPb)

      // Complete the task
      const tasks1 = await ctx.userPb.collection('tasks').getFullList({
        filter: `schedule = "${schedule.id}"`,
      })
      await ctx.userPb.collection('tasks').update(tasks1[0].id, {
        completed: true,
        completedAt: new Date('2026-01-23T12:00:00').toISOString(),
      })

      // Move time forward by 1 day (interval is 3 days, so should NOT create)
      vi.setSystemTime(new Date('2026-01-24T08:00:00'))
      await processSchedules(ctx.adminPb)

      const tasks2 = await ctx.userPb.collection('tasks').getFullList({
        filter: `schedule = "${schedule.id}" && completed = false`,
      })
      expect(tasks2).toHaveLength(0)
    })

    it('should create task when interval has passed since last completion', async () => {
      vi.setSystemTime(new Date('2026-01-23T08:00:00'))

      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Every 2 days',
        child: childId,
        timePeriod: 'morning',
        intervalDays: 2,
        active: true,
      })

      // First run creates a task
      await processSchedules(ctx.adminPb)

      // Complete the task
      const tasks1 = await ctx.userPb.collection('tasks').getFullList({
        filter: `schedule = "${schedule.id}"`,
      })
      await ctx.userPb.collection('tasks').update(tasks1[0].id, {
        completed: true,
        completedAt: new Date('2026-01-23T08:00:00').toISOString(),
      })

      // Move time forward by exactly 2 days from completion (interval is 2 days, so SHOULD create)
      vi.setSystemTime(new Date('2026-01-25T08:00:00'))
      await processSchedules(ctx.adminPb)

      const tasks2 = await ctx.userPb.collection('tasks').getFullList({
        filter: `schedule = "${schedule.id}" && completed = false`,
      })
      expect(tasks2).toHaveLength(1)
    })

    it('should create task when interval has more than passed since last completion', async () => {
      vi.setSystemTime(new Date('2026-01-23T08:00:00'))

      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Every 2 days',
        child: childId,
        timePeriod: 'morning',
        intervalDays: 2,
        active: true,
      })

      // First run creates a task
      await processSchedules(ctx.adminPb)

      // Complete the task
      const tasks1 = await ctx.userPb.collection('tasks').getFullList({
        filter: `schedule = "${schedule.id}"`,
      })
      await ctx.userPb.collection('tasks').update(tasks1[0].id, {
        completed: true,
        completedAt: new Date('2026-01-23T12:00:00').toISOString(),
      })

      // Move time forward by 5 days (interval is 2 days, so SHOULD create)
      vi.setSystemTime(new Date('2026-01-28T08:00:00'))
      await processSchedules(ctx.adminPb)

      const tasks2 = await ctx.userPb.collection('tasks').getFullList({
        filter: `schedule = "${schedule.id}" && completed = false`,
      })
      expect(tasks2).toHaveLength(1)
    })
  })

  describe('mixed scenarios', () => {
    it('should handle schedule with null daysOfWeek and intervalDays (no filtering)', async () => {
      vi.setSystemTime(new Date('2026-01-23T08:00:00'))

      // Schedule with neither daysOfWeek nor intervalDays should always run
      await ctx.userPb.collection('schedules').create({
        title: 'Always run',
        child: childId,
        timePeriod: 'morning',
        active: true,
      })

      await processSchedules(ctx.adminPb)

      const tasks = await ctx.userPb.collection('tasks').getFullList({
        filter: `child = "${childId}"`,
      })
      expect(tasks).toHaveLength(1)
    })
  })
})
