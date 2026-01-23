import { describe, it, expect, beforeEach, vi } from 'vitest'
import PocketBase from 'pocketbase'
import { processSchedules } from '../lib/scheduleProcessor'
import { createTestUser, createTestGroup, createTestChild, type TestContext } from '../../tests/helpers'
import { DEFAULT_TIME_PERIODS } from '../lib/timePeriods'

/**
 * Task Visibility Integration Tests
 *
 * Tests the visibleFrom logic:
 * - Tasks for a future time period should have visibleFrom set to when that period starts
 * - Tasks for the current time period should be immediately visible
 */
describe('Task Visibility by Time Period', () => {
  let ctx: TestContext
  let groupId: string
  let childId: string

  beforeEach(async () => {
    ctx = await createTestUser()
    groupId = await createTestGroup(ctx.adminPb, ctx.userId)
    childId = await createTestChild(ctx.adminPb, groupId)
  })

  it('should set visibleFrom to evening start when creating evening task in morning', async () => {
    // It's 8am (morning)
    vi.setSystemTime(new Date('2026-01-23T08:00:00'))

    // User creates an evening schedule
    await ctx.userPb.collection('schedules').create({
      title: 'Evening reading',
      child: childId,
      timePeriod: 'evening',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // Scheduler processes
    await processSchedules(ctx.adminPb)

    // Task should be created but with visibleFrom set to evening start (18:00)
    const tasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `child = "${childId}"`,
    })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Evening reading')

    // visibleFrom should be 18:00 on the same day (default evening start)
    const visibleFrom = new Date(tasks[0].visibleFrom)
    expect(visibleFrom.getHours()).toBe(18)
    expect(visibleFrom.getMinutes()).toBe(0)
    expect(visibleFrom.getDate()).toBe(23) // Same day

    vi.useRealTimers()
  })

  it('should set visibleFrom to current time when creating evening task in evening', async () => {
    // It's 8pm (evening)
    vi.setSystemTime(new Date('2026-01-23T20:00:00'))

    // User creates an evening schedule
    await ctx.userPb.collection('schedules').create({
      title: 'Evening reading',
      child: childId,
      timePeriod: 'evening',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // Scheduler processes
    await processSchedules(ctx.adminPb)

    // Task should be created and immediately visible (visibleFrom should be now or null)
    const tasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `child = "${childId}"`,
    })
    expect(tasks).toHaveLength(1)

    // visibleFrom should be the current time (20:00) or empty (meaning immediately visible)
    const visibleFrom = tasks[0].visibleFrom
    if (visibleFrom) {
      const date = new Date(visibleFrom)
      expect(date.getHours()).toBe(20)
    }
    // If null/empty, that also means immediately visible - which is acceptable

    vi.useRealTimers()
  })

  it('should set visibleFrom to afternoon start when creating afternoon task in morning', async () => {
    // It's 8am (morning)
    vi.setSystemTime(new Date('2026-01-23T08:00:00'))

    // User creates an afternoon schedule
    await ctx.userPb.collection('schedules').create({
      title: 'Afternoon homework',
      child: childId,
      timePeriod: 'afternoon',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // Scheduler processes
    await processSchedules(ctx.adminPb)

    // Task should be created with visibleFrom set to afternoon start (12:00)
    const tasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `child = "${childId}"`,
    })
    expect(tasks).toHaveLength(1)

    const visibleFrom = new Date(tasks[0].visibleFrom)
    expect(visibleFrom.getHours()).toBe(12)
    expect(visibleFrom.getMinutes()).toBe(0)

    vi.useRealTimers()
  })

  it('should set visibleFrom to morning start of next day when creating morning task in evening', async () => {
    // It's 8pm (evening)
    vi.setSystemTime(new Date('2026-01-23T20:00:00'))

    // User creates a morning schedule
    await ctx.userPb.collection('schedules').create({
      title: 'Morning brush teeth',
      child: childId,
      timePeriod: 'morning',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // Scheduler processes
    await processSchedules(ctx.adminPb)

    // Task should be created with visibleFrom set to next day morning (06:00)
    const tasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `child = "${childId}"`,
    })
    expect(tasks).toHaveLength(1)

    const visibleFrom = new Date(tasks[0].visibleFrom)
    expect(visibleFrom.getHours()).toBe(6)
    expect(visibleFrom.getMinutes()).toBe(0)
    expect(visibleFrom.getDate()).toBe(24) // Next day

    vi.useRealTimers()
  })

  it('should immediately show morning task created in the morning', async () => {
    // It's 8am (morning)
    vi.setSystemTime(new Date('2026-01-23T08:00:00'))

    // User creates a morning schedule
    await ctx.userPb.collection('schedules').create({
      title: 'Morning brush teeth',
      child: childId,
      timePeriod: 'morning',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // Scheduler processes
    await processSchedules(ctx.adminPb)

    // Task should be immediately visible (visibleFrom should be current time or null)
    const tasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `child = "${childId}"`,
    })
    expect(tasks).toHaveLength(1)

    const visibleFrom = tasks[0].visibleFrom
    if (visibleFrom) {
      const date = new Date(visibleFrom)
      // Should be at or before the current time
      expect(date.getTime()).toBeLessThanOrEqual(new Date('2026-01-23T08:00:00').getTime())
    }

    vi.useRealTimers()
  })

  it('should use user custom time period settings for visibleFrom', async () => {
    // Update user with custom settings (morning starts at 7:00, afternoon at 13:00, evening at 19:00)
    await ctx.adminPb.collection('users').update(ctx.userId, {
      morningStart: '07:00',
      afternoonStart: '13:00',
      eveningStart: '19:00',
    })

    // It's 8am (morning with custom settings)
    vi.setSystemTime(new Date('2026-01-23T08:00:00'))

    // User creates an afternoon schedule
    await ctx.userPb.collection('schedules').create({
      title: 'Afternoon homework',
      child: childId,
      timePeriod: 'afternoon',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // Scheduler processes
    await processSchedules(ctx.adminPb)

    // Task should be created with visibleFrom set to custom afternoon start (13:00)
    const tasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `child = "${childId}"`,
    })
    expect(tasks).toHaveLength(1)

    const visibleFrom = new Date(tasks[0].visibleFrom)
    expect(visibleFrom.getHours()).toBe(13) // Custom afternoon start
    expect(visibleFrom.getMinutes()).toBe(0)

    vi.useRealTimers()
  })
})
