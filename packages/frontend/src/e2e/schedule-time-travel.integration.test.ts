import { describe, it, expect, beforeEach, vi } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import PocketBase from 'pocketbase'
import { processSchedules } from '../lib/scheduleProcessor'
import TasksChildPage from '../pages/group/[groupId]/tasks/[childId].astro'
import { createTestUser, createTestGroup, createTestChild, type TestContext } from '../../tests/helpers'

/**
 * Schedule Processor Integration Tests
 *
 * Tests the full flow:
 * 1. User creates schedules (with timePeriod + daysOfWeek or intervalDays)
 * 2. Scheduler service processes them
 * 3. User sees the generated tasks in UI
 *
 * IMPORTANT: User operations run as regular users, not superusers, to catch permission issues.
 * The processSchedules function runs with admin credentials (simulating a service account).
 */
describe('Schedule Processor', () => {
  let ctx: TestContext
  let groupId: string
  let childId: string

  beforeEach(async () => {
    ctx = await createTestUser()
    groupId = await createTestGroup(ctx.adminPb, ctx.userId)
    childId = await createTestChild(ctx.adminPb, groupId)
  })

  it('should not create tasks when no active schedules exist', async () => {
    // processSchedules runs as admin (service account)
    await processSchedules(ctx.adminPb)

    // User should see no tasks
    const tasks = await ctx.userPb.collection('tasks').getFullList()
    expect(tasks).toHaveLength(0)
  })

  it('should create task for active schedule with daysOfWeek', async () => {
    vi.setSystemTime(new Date('2026-01-23T08:00:00Z'))

    // User creates a schedule with timePeriod + daysOfWeek
    await ctx.userPb.collection('schedules').create({
      title: 'Brush teeth',
      child: childId,
      timePeriod: 'morning',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // Scheduler service processes schedules (runs as admin)
    await processSchedules(ctx.adminPb)

    // User should see the generated task
    const tasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `child = "${childId}"`,
    })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Brush teeth')

    vi.useRealTimers()
  })

  it('should create task for active schedule with intervalDays', async () => {
    vi.setSystemTime(new Date('2026-01-23T08:00:00Z'))

    // User creates a schedule with timePeriod + intervalDays
    await ctx.userPb.collection('schedules').create({
      title: 'Shower',
      child: childId,
      timePeriod: 'morning',
      intervalDays: 2,
      active: true,
    })

    // Scheduler service processes schedules (runs as admin)
    await processSchedules(ctx.adminPb)

    // User should see the generated task
    const tasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `child = "${childId}"`,
    })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Shower')

    vi.useRealTimers()
  })

  it('should not create duplicate task if incomplete one exists', async () => {
    vi.setSystemTime(new Date('2026-01-23T08:00:00Z'))

    // User creates a schedule
    const schedule = await ctx.userPb.collection('schedules').create({
      title: 'Brush teeth',
      child: childId,
      timePeriod: 'morning',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // Scheduler runs twice
    await processSchedules(ctx.adminPb)
    await processSchedules(ctx.adminPb)

    // Should still only have one task
    const tasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `schedule = "${schedule.id}"`,
    })
    expect(tasks).toHaveLength(1)

    vi.useRealTimers()
  })

  it('should create new task after previous one is completed', async () => {
    vi.setSystemTime(new Date('2026-01-23T08:00:00Z'))

    // User creates a schedule
    const schedule = await ctx.userPb.collection('schedules').create({
      title: 'Brush teeth',
      child: childId,
      timePeriod: 'morning',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
    })

    // First scheduler run
    await processSchedules(ctx.adminPb)

    // User completes the task
    const tasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `schedule = "${schedule.id}"`,
    })
    await ctx.userPb.collection('tasks').update(tasks[0].id, { completed: true })

    // Second scheduler run
    await processSchedules(ctx.adminPb)

    // Should now have two tasks
    const allTasks = await ctx.userPb.collection('tasks').getFullList({
      filter: `schedule = "${schedule.id}"`,
    })
    expect(allTasks).toHaveLength(2)

    vi.useRealTimers()
  })

  it('should not create task for inactive schedule', async () => {
    vi.setSystemTime(new Date('2026-01-23T08:00:00Z'))

    // User creates an inactive schedule
    await ctx.userPb.collection('schedules').create({
      title: 'Brush teeth',
      child: childId,
      timePeriod: 'morning',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: false,
    })

    await processSchedules(ctx.adminPb)

    const tasks = await ctx.userPb.collection('tasks').getFullList()
    expect(tasks).toHaveLength(0)

    vi.useRealTimers()
  })

  it('should show generated task in Astro UI after processSchedules runs', async () => {
    vi.setSystemTime(new Date('2026-01-23T08:00:00Z'))

    // User creates a schedule
    await ctx.userPb.collection('schedules').create({
      title: 'Morning Routine',
      child: childId,
      timePeriod: 'morning',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      active: true,
      priority: 1,
    })

    // Scheduler processes
    await processSchedules(ctx.adminPb)

    // Render the page as the user
    const container = await AstroContainer.create()
    const html = await container.renderToString(TasksChildPage, {
      params: { groupId, childId },
      locals: { pb: ctx.userPb, user: ctx.userPb.authStore.record },
    })

    expect(html).toContain('Morning Routine')
    expect(html).toContain('data-testid="task-item"')

    vi.useRealTimers()
  })
})
