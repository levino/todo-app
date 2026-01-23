import PocketBase from 'pocketbase'
import { describe, expect, it, beforeEach } from 'vitest'
import { createTestUser, createTestGroup, createTestChild, type TestContext } from '../../tests/helpers'

/**
 * Schedule Management Integration Tests
 *
 * NEW SCHEMA (timePeriod + daysOfWeek):
 * - timePeriod: required, 'morning' | 'afternoon' | 'evening'
 * - daysOfWeek: optional, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
 * - intervalDays: optional, every N days from last completion
 * - Either daysOfWeek OR intervalDays (not both)
 *
 * IMPORTANT: Tests run as regular users, not superusers, to catch permission issues.
 */
describe('Schedule Management', () => {
  let ctx: TestContext
  let groupId: string
  let childId: string

  beforeEach(async () => {
    ctx = await createTestUser()
    groupId = await createTestGroup(ctx.adminPb, ctx.userId)
    childId = await createTestChild(ctx.adminPb, groupId)
  })

  describe('Schedule Schema (Time Periods)', () => {
    it('should allow creating a weekday morning schedule', async () => {
      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Daily Homework',
        child: childId,
        timePeriod: 'morning',
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
        active: true,
        priority: 1,
      })

      expect(schedule.title).toBe('Daily Homework')
      expect(schedule.child).toBe(childId)
      expect(schedule.timePeriod).toBe('morning')
      expect(schedule.daysOfWeek).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
      expect(schedule.active).toBe(true)
      expect(schedule.priority).toBe(1)
    })

    it('should allow creating a daily evening schedule', async () => {
      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Evening Cleanup',
        child: childId,
        timePeriod: 'evening',
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        active: true,
      })

      expect(schedule.title).toBe('Evening Cleanup')
      expect(schedule.timePeriod).toBe('evening')
      expect(schedule.daysOfWeek).toHaveLength(7)
      expect(schedule.active).toBe(true)
    })

    it('should allow creating interval-based schedule with time period', async () => {
      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Shower',
        child: childId,
        timePeriod: 'evening',
        intervalDays: 2, // Every 2 days
        active: true,
      })

      expect(schedule.title).toBe('Shower')
      expect(schedule.timePeriod).toBe('evening')
      expect(schedule.intervalDays).toBe(2)
      expect(schedule.daysOfWeek).toBeFalsy() // Should be empty/null when using intervalDays
      expect(schedule.active).toBe(true)
    })

    it('should allow creating inactive schedules', async () => {
      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Paused Schedule',
        child: childId,
        timePeriod: 'afternoon',
        daysOfWeek: ['sat', 'sun'],
        active: false,
      })

      expect(schedule.active).toBe(false)
      expect(schedule.timePeriod).toBe('afternoon')
    })

    it('should allow weekend-only schedules', async () => {
      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Weekend Chores',
        child: childId,
        timePeriod: 'morning',
        daysOfWeek: ['sat', 'sun'],
        active: true,
      })

      expect(schedule.timePeriod).toBe('morning')
      expect(schedule.daysOfWeek).toEqual(['sat', 'sun'])
    })

    it('should support all three time periods', async () => {
      const morning = await ctx.userPb.collection('schedules').create({
        title: 'Morning Task',
        child: childId,
        timePeriod: 'morning',
        daysOfWeek: ['mon'],
        active: true,
      })

      const afternoon = await ctx.userPb.collection('schedules').create({
        title: 'Afternoon Task',
        child: childId,
        timePeriod: 'afternoon',
        daysOfWeek: ['tue'],
        active: true,
      })

      const evening = await ctx.userPb.collection('schedules').create({
        title: 'Evening Task',
        child: childId,
        timePeriod: 'evening',
        daysOfWeek: ['wed'],
        active: true,
      })

      expect(morning.timePeriod).toBe('morning')
      expect(afternoon.timePeriod).toBe('afternoon')
      expect(evening.timePeriod).toBe('evening')
    })
  })

  describe('Task Schema Updates', () => {
    it('should allow creating one-time tasks without schedule reference', async () => {
      const task = await ctx.userPb.collection('tasks').create({
        title: 'One-time cleanup',
        child: childId,
        completed: false,
      })

      expect(task.title).toBe('One-time cleanup')
      expect(task.child).toBe(childId)
      expect(task.completed).toBe(false)
      expect(task.schedule).toBeFalsy() // PocketBase returns empty string for null relations
      expect(task.generatedAt).toBeFalsy() // PocketBase returns empty string for null date fields
    })

    it('should allow creating tasks generated from schedules', async () => {
      // First create a schedule
      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Daily Homework',
        child: childId,
        timePeriod: 'afternoon',
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
        active: true,
      })

      // Then create a task from that schedule
      const task = await ctx.userPb.collection('tasks').create({
        title: 'Daily Homework',
        child: childId,
        completed: false,
        schedule: schedule.id,
        generatedAt: new Date().toISOString(),
      })

      expect(task.title).toBe('Daily Homework')
      expect(task.schedule).toBe(schedule.id)
      expect(task.generatedAt).toBeDefined()
    })
  })

  describe('Schedule Relationships', () => {
    it('should allow querying tasks with schedule expansion', async () => {
      // Create schedule
      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Daily Homework',
        child: childId,
        timePeriod: 'morning',
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
        active: true,
      })

      // Create task from schedule
      await ctx.userPb.collection('tasks').create({
        title: 'Daily Homework',
        child: childId,
        completed: false,
        schedule: schedule.id,
        generatedAt: new Date().toISOString(),
      })

      // Query tasks with schedule expansion
      const tasks = await ctx.userPb.collection('tasks').getList(1, 50, {
        filter: `child = "${childId}"`,
        expand: 'schedule',
      })

      expect(tasks.items.length).toBe(1)
      const task = tasks.items[0]
      expect(task.schedule).toBe(schedule.id)
      expect(task.expand?.schedule).toBeDefined()
      expect(task.expand.schedule.title).toBe('Daily Homework')
    })
  })

  describe('Business Logic Requirements', () => {
    it('should support the homework example - only one task even if missed', async () => {
      // Create daily homework schedule (weekday afternoons)
      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Daily Homework',
        child: childId,
        timePeriod: 'afternoon',
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
        active: true,
      })

      // Create task for Tuesday (simulating automatic generation)
      const tuesdayTask = await ctx.userPb.collection('tasks').create({
        title: 'Daily Homework',
        child: childId,
        completed: false,
        schedule: schedule.id,
        generatedAt: new Date('2024-01-02').toISOString(), // Tuesday
      })

      // Task is NOT completed (child didn't do homework)
      expect(tuesdayTask.completed).toBe(false)

      // On Wednesday, check if there's an existing incomplete task
      const incompleteTasks = await ctx.userPb.collection('tasks').getList(1, 50, {
        filter: `child = "${childId}" && schedule = "${schedule.id}" && completed = false`,
      })

      // Should have exactly 1 incomplete task - don't create another
      expect(incompleteTasks.items.length).toBe(1)
      expect(incompleteTasks.items[0].id).toBe(tuesdayTask.id)
    })

    it('should support the shower example - track completion time for intervals', async () => {
      // Create shower schedule with intervalDays + timePeriod
      const schedule = await ctx.userPb.collection('schedules').create({
        title: 'Shower Every 2 Days',
        child: childId,
        timePeriod: 'evening',
        intervalDays: 2,
        active: true,
        lastGenerated: new Date('2024-01-01').toISOString(), // Last shower day
      })

      // Simulate 3 days passing without showering
      // Day 3: Complete the overdue shower task
      const showerTask = await ctx.userPb.collection('tasks').create({
        title: 'Shower Every 2 Days',
        child: childId,
        completed: true,
        completedAt: new Date('2024-01-03').toISOString(),
        schedule: schedule.id,
        generatedAt: new Date('2024-01-02').toISOString(),
      })

      // Update schedule's last generated to track completion
      await ctx.userPb.collection('schedules').update(schedule.id, {
        lastGenerated: showerTask.completedAt,
      })

      // Next task should be generated for day 5 (2 days after completion)
      const updatedSchedule = await ctx.userPb.collection('schedules').getOne(schedule.id)
      expect(updatedSchedule.lastGenerated).toBe(showerTask.completedAt)
    })
  })
})
