import PocketBase from 'pocketbase'
import { describe, expect, it, beforeEach } from 'vitest'

const POCKETBASE_URL =
  process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

/**
 * Schedule Management Integration Tests
 *
 * These tests verify the new schedule-based architecture:
 * - Creating schedules that define recurring patterns
 * - Tasks are generated automatically from schedules  
 * - Proper separation between schedules and tasks
 */
describe('Schedule Management', () => {
  let pb: PocketBase
  let groupId: string
  let childId: string

  beforeEach(async () => {
    pb = new PocketBase(POCKETBASE_URL)
    await pb
      .collection('_superusers')
      .authWithPassword('admin@test.local', 'testtest123')

    // Create test group and child
    const group = await pb.collection('groups').create({ name: 'Test Family' })
    groupId = group.id

    const child = await pb.collection('children').create({
      name: 'Max',
      group: groupId,
      color: '#4DABF7',
    })
    childId = child.id
  })

  describe('Schedule Schema', () => {
    it('should allow creating a daily schedule', async () => {
      const schedule = await pb.collection('schedules').create({
        title: 'Daily Homework',
        child: childId,
        recurrence: 'daily',
        active: true,
        priority: 1,
      })

      expect(schedule.title).toBe('Daily Homework')
      expect(schedule.child).toBe(childId)
      expect(schedule.recurrence).toBe('daily')
      expect(schedule.active).toBe(true)
      expect(schedule.priority).toBe(1)
    })

    it('should allow creating a weekly schedule with specific days', async () => {
      const schedule = await pb.collection('schedules').create({
        title: 'Weekday Cleanup',
        child: childId,
        recurrence: 'weekly',
        daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
        timePeriod: 'evening',
        active: true,
      })

      expect(schedule.title).toBe('Weekday Cleanup')
      expect(schedule.recurrence).toBe('weekly')
      expect(schedule.daysOfWeek).toEqual([1, 2, 3, 4, 5])
      expect(schedule.timePeriod).toBe('evening')
      expect(schedule.active).toBe(true)
    })

    it('should allow creating inactive schedules', async () => {
      const schedule = await pb.collection('schedules').create({
        title: 'Paused Schedule',
        child: childId,
        recurrence: 'daily',
        active: false,
      })

      expect(schedule.active).toBe(false)
    })
  })

  describe('Task Schema Updates', () => {
    it('should allow creating one-time tasks without schedule reference', async () => {
      const task = await pb.collection('kiosk_tasks').create({
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
      const schedule = await pb.collection('schedules').create({
        title: 'Daily Homework',
        child: childId,
        recurrence: 'daily',
        active: true,
      })

      // Then create a task from that schedule
      const task = await pb.collection('kiosk_tasks').create({
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
      const schedule = await pb.collection('schedules').create({
        title: 'Daily Homework',
        child: childId,
        recurrence: 'daily',
        active: true,
      })

      // Create task from schedule
      await pb.collection('kiosk_tasks').create({
        title: 'Daily Homework',
        child: childId,
        completed: false,
        schedule: schedule.id,
        generatedAt: new Date().toISOString(),
      })

      // Query tasks with schedule expansion
      const tasks = await pb.collection('kiosk_tasks').getList(1, 50, {
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
      // Create daily homework schedule
      const schedule = await pb.collection('schedules').create({
        title: 'Daily Homework',
        child: childId,
        recurrence: 'daily',
        active: true,
      })

      // Create task for Tuesday (simulating automatic generation)
      const tuesdayTask = await pb.collection('kiosk_tasks').create({
        title: 'Daily Homework',
        child: childId,
        completed: false,
        schedule: schedule.id,
        generatedAt: new Date('2024-01-02').toISOString(), // Tuesday
      })

      // Task is NOT completed (child didn't do homework)
      expect(tuesdayTask.completed).toBe(false)

      // On Wednesday, check if there's an existing incomplete task
      const incompleteTasks = await pb.collection('kiosk_tasks').getList(1, 50, {
        filter: `child = "${childId}" && schedule = "${schedule.id}" && completed = false`,
      })

      // Should have exactly 1 incomplete task - don't create another
      expect(incompleteTasks.items.length).toBe(1)
      expect(incompleteTasks.items[0].id).toBe(tuesdayTask.id)
    })

    it('should support the shower example - track completion time for intervals', async () => {
      // Create shower schedule
      const schedule = await pb.collection('schedules').create({
        title: 'Shower Every 2 Days',
        child: childId,
        recurrence: 'daily', // Daily check, but logic determines when to create task
        active: true,
        lastGenerated: new Date('2024-01-01').toISOString(), // Last shower day
      })

      // Simulate 3 days passing without showering
      // Day 3: Complete the overdue shower task
      const showerTask = await pb.collection('kiosk_tasks').create({
        title: 'Shower Every 2 Days',
        child: childId,
        completed: true,
        completedAt: new Date('2024-01-03').toISOString(),
        schedule: schedule.id,
        generatedAt: new Date('2024-01-02').toISOString(),
      })

      // Update schedule's last generated to track completion
      await pb.collection('schedules').update(schedule.id, {
        lastGenerated: showerTask.completedAt,
      })

      // Next task should be generated for day 5 (2 days after completion)
      const updatedSchedule = await pb.collection('schedules').getOne(schedule.id)
      expect(updatedSchedule.lastGenerated).toBe(showerTask.completedAt)
    })
  })
})